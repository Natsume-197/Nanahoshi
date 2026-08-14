import { db } from "@nanahoshi-v2/db";
import {
	book,
	bookMetadata,
	library,
	readingProgress,
	readingProgressSyncOperation,
} from "@nanahoshi-v2/db/schema/general";
import { and, desc, eq, gt, lt, sql } from "drizzle-orm";
import { READING_STATUSES } from "../../constants";
import { batchLoaderRepository } from "../_shared/batch-loaders";
import {
	accessibleCondition,
	type LibraryScope,
} from "../_shared/library-scope";
import type { ReadingProgress } from "./reading-progress.model";

const MAX_CLIENT_CLOCK_SKEW_MS = 5_000;
const SYNC_OPERATION_RETENTION_MS = 30 * 24 * 60 * 60 * 1_000;
const SYNC_OPERATION_CLEANUP_INTERVAL_MS = 60 * 60 * 1_000;
let nextSyncOperationCleanupAt = 0;

export class ReadingProgressRepository {
	async upsert(
		userId: string,
		bookId: number,
		data: {
			exploredCharCount?: number;
			bookCharCount?: number;
			positionMode?: "automatic" | "bookmark";
			positionIntentAt?: number;
			syncOperationId?: string;
			readingTimeSeconds?: number;
			status?: string;
		},
	): Promise<{ progress: ReadingProgress; positionAccepted: boolean }> {
		const serverNowMs = Date.now();
		const now = new Date(serverNowMs).toISOString();
		const hasPosition = data.exploredCharCount !== undefined;
		const normalizedPositionIntentAt =
			data.positionIntentAt !== undefined
				? data.positionIntentAt > serverNowMs + MAX_CLIENT_CLOCK_SKEW_MS
					? serverNowMs
					: data.positionIntentAt
				: undefined;
		// Once a row has ordered writes, legacy clients may still add reading time
		// but cannot replace its position. Future-skewed clocks are capped so one
		// bad device cannot lock every other client out of the book.
		const acceptsPosition = hasPosition
			? normalizedPositionIntentAt !== undefined
				? sql<boolean>`(
						${readingProgress.positionIntentAt} IS NULL
						OR ${readingProgress.positionIntentAt} < ${normalizedPositionIntentAt}
					)`
				: sql<boolean>`${readingProgress.positionIntentAt} IS NULL`
			: undefined;

		return db.transaction(async (tx) => {
			if (data.syncOperationId) {
				const insertedOperation = await tx
					.insert(readingProgressSyncOperation)
					.values({ id: data.syncOperationId, userId, bookId })
					.onConflictDoNothing()
					.returning({ id: readingProgressSyncOperation.id });
				if (insertedOperation.length === 0) {
					const [progress] = await tx
						.select()
						.from(readingProgress)
						.where(
							and(
								eq(readingProgress.userId, userId),
								eq(readingProgress.bookId, bookId),
							),
						);
					if (!progress)
						throw new Error("Progress operation has no progress row");
					return { progress, positionAccepted: false };
				}
				if (serverNowMs >= nextSyncOperationCleanupAt) {
					nextSyncOperationCleanupAt =
						serverNowMs + SYNC_OPERATION_CLEANUP_INTERVAL_MS;
					await tx
						.delete(readingProgressSyncOperation)
						.where(
							lt(
								readingProgressSyncOperation.createdAt,
								new Date(
									serverNowMs - SYNC_OPERATION_RETENTION_MS,
								).toISOString(),
							),
						);
				}
			}

			const [progress] = await tx
				.insert(readingProgress)
				.values({
					userId,
					bookId,
					exploredCharCount: data.exploredCharCount ?? 0,
					bookCharCount: data.bookCharCount ?? 0,
					positionMode: data.positionMode,
					positionIntentAt: normalizedPositionIntentAt,
					positionOperationId: hasPosition ? data.syncOperationId : undefined,
					positionUpdatedAt: hasPosition ? now : undefined,
					readingTimeSeconds: data.readingTimeSeconds ?? 0,
					status: data.status ?? READING_STATUSES.READING,
					startedAt: now,
					lastReadAt: now,
				})
				.onConflictDoUpdate({
					target: [readingProgress.userId, readingProgress.bookId],
					set: {
						...(data.exploredCharCount !== undefined && {
							exploredCharCount: sql`CASE WHEN ${acceptsPosition} THEN ${data.exploredCharCount} ELSE ${readingProgress.exploredCharCount} END`,
							positionUpdatedAt: sql`CASE WHEN ${acceptsPosition} THEN ${now} ELSE ${readingProgress.positionUpdatedAt} END`,
						}),
						...(data.bookCharCount !== undefined && {
							bookCharCount: hasPosition
								? sql`CASE WHEN ${acceptsPosition} THEN ${data.bookCharCount} ELSE ${readingProgress.bookCharCount} END`
								: data.bookCharCount,
						}),
						...(data.positionMode !== undefined && {
							positionMode: sql`CASE WHEN ${acceptsPosition} THEN ${data.positionMode} ELSE ${readingProgress.positionMode} END`,
						}),
						...(normalizedPositionIntentAt !== undefined && {
							positionIntentAt: sql`CASE WHEN ${acceptsPosition} THEN ${normalizedPositionIntentAt} ELSE ${readingProgress.positionIntentAt} END`,
							positionOperationId: sql`CASE WHEN ${acceptsPosition} THEN ${data.syncOperationId} ELSE ${readingProgress.positionOperationId} END`,
						}),
						...(data.readingTimeSeconds !== undefined && {
							readingTimeSeconds: sql`${readingProgress.readingTimeSeconds} + ${data.readingTimeSeconds}`,
						}),
						...(data.status !== undefined && {
							status: hasPosition
								? sql`CASE WHEN ${acceptsPosition} THEN ${data.status} ELSE ${readingProgress.status} END`
								: data.status,
							completedAt: hasPosition
								? sql`CASE WHEN ${acceptsPosition} THEN ${data.status === READING_STATUSES.COMPLETED ? now : null} ELSE ${readingProgress.completedAt} END`
								: data.status === READING_STATUSES.COMPLETED
									? now
									: null,
						}),
						lastReadAt: now,
					},
				})
				.returning();
			if (!progress) throw new Error("Reading progress upsert returned no row");
			const positionAccepted =
				!hasPosition ||
				(data.syncOperationId !== undefined
					? progress.positionOperationId === data.syncOperationId
					: progress.positionIntentAt === normalizedPositionIntentAt);
			return { progress, positionAccepted };
		});
	}

	async getByUserAndBook(
		userId: string,
		bookId: number,
	): Promise<ReadingProgress | null> {
		const [result] = await db
			.select()
			.from(readingProgress)
			.where(
				and(
					eq(readingProgress.userId, userId),
					eq(readingProgress.bookId, bookId),
				),
			);
		return result ?? null;
	}

	async listInProgress(
		userId: string,
		limit = 20,
		serverId?: string,
		scope: LibraryScope = "ALL",
	) {
		const filters = and(
			eq(readingProgress.userId, userId),
			eq(readingProgress.status, READING_STATUSES.READING),
			gt(readingProgress.exploredCharCount, 0),
			eq(library.mediaType, "ebook"),
			...(serverId ? [eq(library.serverId, serverId)] : []),
			accessibleCondition(scope),
		);

		const rows = await db
			.select({
				id: readingProgress.id,
				bookId: readingProgress.bookId,
				exploredCharCount: readingProgress.exploredCharCount,
				bookCharCount: readingProgress.bookCharCount,
				readingTimeSeconds: readingProgress.readingTimeSeconds,
				status: readingProgress.status,
				lastReadAt: readingProgress.lastReadAt,
				bookUuid: book.uuid,
				bookFilename: book.filename,
				title: bookMetadata.title,
				cover: bookMetadata.cover,
				mainColor: bookMetadata.mainColor,
			})
			.from(readingProgress)
			.innerJoin(book, eq(book.id, readingProgress.bookId))
			.innerJoin(library, eq(library.id, book.libraryId))
			.leftJoin(bookMetadata, eq(bookMetadata.bookId, book.id))
			.where(filters)
			.orderBy(desc(readingProgress.lastReadAt))
			.limit(limit);

		const bookIds = rows.map((r) => r.bookId);
		const authorsMap = await batchLoaderRepository.loadEbookAuthors(bookIds);

		return rows.map((row) => ({
			...row,
			authors: authorsMap.get(Number(row.bookId)) ?? [],
		}));
	}
}

export const readingProgressRepository = new ReadingProgressRepository();
