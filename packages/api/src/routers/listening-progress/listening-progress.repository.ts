import { db } from "@nanahoshi-v2/db";
import {
	audiobookMetadata,
	book,
	library,
	listeningProgress,
} from "@nanahoshi-v2/db/schema/general";
import { and, desc, eq, gt, sql } from "drizzle-orm";
import { LISTENING_STATUSES } from "../../constants";
import { batchLoaderRepository } from "../_shared/batch-loaders";
import {
	accessibleCondition,
	type LibraryScope,
} from "../_shared/library-scope";
import type { ListeningProgress } from "./listening-progress.model";

const MAX_CLIENT_CLOCK_SKEW_MS = 5_000;

export class ListeningProgressRepository {
	async upsert(
		userId: string,
		bookId: number,
		data: {
			currentTimeSeconds?: number;
			durationSeconds?: number;
			positionIntentAt?: number;
			listeningTimeSeconds?: number;
			status?: string;
		},
	): Promise<ListeningProgress> {
		const serverNowMs = Date.now();
		const now = new Date(serverNowMs).toISOString();
		const hasPosition = data.currentTimeSeconds !== undefined;
		const normalizedPositionIntentAt =
			data.positionIntentAt !== undefined
				? data.positionIntentAt > serverNowMs + MAX_CLIENT_CLOCK_SKEW_MS
					? serverNowMs
					: data.positionIntentAt
				: undefined;
		// A mobile browser can deliver its last keepalive request before an older
		// in-flight sync. Once a client supplies ordered intents, the late request
		// may add listening time but can never rewind the playhead.
		const acceptsPosition = hasPosition
			? normalizedPositionIntentAt !== undefined
				? sql<boolean>`(
						${listeningProgress.positionIntentAt} IS NULL
						OR ${listeningProgress.positionIntentAt} < ${normalizedPositionIntentAt}
					)`
				: sql<boolean>`${listeningProgress.positionIntentAt} IS NULL`
			: undefined;
		const rows = await db
			.insert(listeningProgress)
			.values({
				userId,
				bookId,
				currentTimeSeconds: data.currentTimeSeconds ?? 0,
				durationSeconds: data.durationSeconds ?? 0,
				positionIntentAt: normalizedPositionIntentAt,
				positionUpdatedAt: hasPosition ? now : undefined,
				listeningTimeSeconds: data.listeningTimeSeconds ?? 0,
				status: data.status ?? LISTENING_STATUSES.LISTENING,
				startedAt: now,
				lastListenedAt: now,
			})
			.onConflictDoUpdate({
				target: [listeningProgress.userId, listeningProgress.bookId],
				set: {
					...(data.currentTimeSeconds !== undefined && {
						currentTimeSeconds: sql`CASE WHEN ${acceptsPosition} THEN ${data.currentTimeSeconds} ELSE ${listeningProgress.currentTimeSeconds} END`,
						positionUpdatedAt: sql`CASE WHEN ${acceptsPosition} THEN ${now} ELSE ${listeningProgress.positionUpdatedAt} END`,
					}),
					...(data.durationSeconds !== undefined && {
						durationSeconds: hasPosition
							? sql`CASE WHEN ${acceptsPosition} THEN ${data.durationSeconds} ELSE ${listeningProgress.durationSeconds} END`
							: data.durationSeconds,
					}),
					...(normalizedPositionIntentAt !== undefined && {
						positionIntentAt: sql`CASE WHEN ${acceptsPosition} THEN ${normalizedPositionIntentAt} ELSE ${listeningProgress.positionIntentAt} END`,
					}),
					...(data.listeningTimeSeconds !== undefined && {
						listeningTimeSeconds: sql`${listeningProgress.listeningTimeSeconds} + ${data.listeningTimeSeconds}`,
					}),
					...(data.status !== undefined && {
						status: hasPosition
							? sql`CASE WHEN ${acceptsPosition} THEN ${data.status} ELSE ${listeningProgress.status} END`
							: data.status,
					}),
					lastListenedAt: hasPosition
						? sql`CASE WHEN ${acceptsPosition} THEN ${now} ELSE ${listeningProgress.lastListenedAt} END`
						: now,
					...(data.status !== undefined && {
						completedAt: hasPosition
							? sql`CASE WHEN ${acceptsPosition} THEN ${data.status === LISTENING_STATUSES.COMPLETED ? now : null} ELSE ${listeningProgress.completedAt} END`
							: data.status === LISTENING_STATUSES.COMPLETED
								? now
								: null,
					}),
				},
			})
			.returning();
		return rows[0] as ListeningProgress;
	}

	async getByUserAndBook(
		userId: string,
		bookId: number,
	): Promise<ListeningProgress | null> {
		const [result] = await db
			.select()
			.from(listeningProgress)
			.where(
				and(
					eq(listeningProgress.userId, userId),
					eq(listeningProgress.bookId, bookId),
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
			eq(listeningProgress.userId, userId),
			eq(listeningProgress.status, LISTENING_STATUSES.LISTENING),
			// Rows at 0 seconds are "opened once" artifacts, not listens in progress.
			gt(listeningProgress.currentTimeSeconds, 0),
			eq(library.mediaType, "audiobook"),
			...(serverId ? [eq(library.serverId, serverId)] : []),
			accessibleCondition(scope),
		);

		const rows = await db
			.select({
				id: listeningProgress.id,
				bookId: listeningProgress.bookId,
				currentTimeSeconds: listeningProgress.currentTimeSeconds,
				durationSeconds: listeningProgress.durationSeconds,
				listeningTimeSeconds: listeningProgress.listeningTimeSeconds,
				status: listeningProgress.status,
				lastListenedAt: listeningProgress.lastListenedAt,
				bookUuid: book.uuid,
				bookFilename: book.filename,
				title: audiobookMetadata.title,
				cover: audiobookMetadata.cover,
				mainColor: audiobookMetadata.mainColor,
				duration: audiobookMetadata.duration,
			})
			.from(listeningProgress)
			.innerJoin(book, eq(book.id, listeningProgress.bookId))
			.innerJoin(library, eq(library.id, book.libraryId))
			.leftJoin(audiobookMetadata, eq(audiobookMetadata.bookId, book.id))
			.where(filters)
			.orderBy(desc(listeningProgress.lastListenedAt))
			.limit(limit);

		const bookIds = rows.map((r) => r.bookId);
		const [authorsMap, narratorsMap] = await Promise.all([
			batchLoaderRepository.loadAudiobookAuthors(bookIds),
			batchLoaderRepository.loadNarrators(bookIds),
		]);

		return rows.map((row) => ({
			...row,
			authors: authorsMap.get(Number(row.bookId)) ?? [],
			narrators: narratorsMap.get(Number(row.bookId)) ?? [],
		}));
	}
}

export const listeningProgressRepository = new ListeningProgressRepository();
