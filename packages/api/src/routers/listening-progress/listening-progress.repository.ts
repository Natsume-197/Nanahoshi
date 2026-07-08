import { db } from "@nanahoshi-v2/db";
import {
	audiobookMetadata,
	book,
	library,
	listeningProgress,
} from "@nanahoshi-v2/db/schema/general";
import { and, desc, eq, sql } from "drizzle-orm";
import { LISTENING_STATUSES } from "../../constants";
import { batchLoaderRepository } from "../_shared/batch-loaders";
import {
	accessibleCondition,
	type LibraryScope,
} from "../_shared/library-scope";
import type { ListeningProgress } from "./listening-progress.model";

export class ListeningProgressRepository {
	async upsert(
		userId: string,
		bookId: number,
		data: {
			currentTimeSeconds?: number;
			durationSeconds?: number;
			listeningTimeSeconds?: number;
			status?: string;
		},
	): Promise<ListeningProgress> {
		const now = new Date().toISOString();
		const rows = await db
			.insert(listeningProgress)
			.values({
				userId,
				bookId,
				currentTimeSeconds: data.currentTimeSeconds ?? 0,
				durationSeconds: data.durationSeconds ?? 0,
				listeningTimeSeconds: data.listeningTimeSeconds ?? 0,
				status: data.status ?? LISTENING_STATUSES.LISTENING,
				startedAt: now,
				lastListenedAt: now,
			})
			.onConflictDoUpdate({
				target: [listeningProgress.userId, listeningProgress.bookId],
				set: {
					...(data.currentTimeSeconds !== undefined && {
						currentTimeSeconds: data.currentTimeSeconds,
					}),
					...(data.durationSeconds !== undefined && {
						durationSeconds: data.durationSeconds,
					}),
					...(data.listeningTimeSeconds !== undefined && {
						listeningTimeSeconds: sql`${listeningProgress.listeningTimeSeconds} + ${data.listeningTimeSeconds}`,
					}),
					...(data.status !== undefined && { status: data.status }),
					lastListenedAt: now,
					...(data.status !== undefined && {
						completedAt:
							data.status === LISTENING_STATUSES.COMPLETED ? now : null,
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
