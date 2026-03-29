import { db } from "@nanahoshi-v2/db";
import {
	audiobookMetadata,
	book,
	library,
	userAudiobookShelf,
} from "@nanahoshi-v2/db/schema/general";
import { and, desc, eq } from "drizzle-orm";
import {
	batchLoadAudiobookAuthors,
	batchLoadNarrators,
} from "../_shared/batch-loaders";
import type { UserAudiobookShelf } from "./audiobook-shelf.model";

export class AudiobookShelfRepository {
	async upsert(
		userId: string,
		bookId: number,
		status: string,
	): Promise<UserAudiobookShelf> {
		const now = new Date().toISOString();
		const [row] = await db
			.insert(userAudiobookShelf)
			.values({
				userId,
				bookId,
				status: status as UserAudiobookShelf["status"],
				updatedAt: now,
			})
			.onConflictDoUpdate({
				target: [userAudiobookShelf.userId, userAudiobookShelf.bookId],
				set: {
					status: status as UserAudiobookShelf["status"],
					updatedAt: now,
				},
			})
			.returning();
		return row as UserAudiobookShelf;
	}

	async getByUserAndBook(
		userId: string,
		bookId: number,
	): Promise<UserAudiobookShelf | null> {
		const [result] = await db
			.select()
			.from(userAudiobookShelf)
			.where(
				and(
					eq(userAudiobookShelf.userId, userId),
					eq(userAudiobookShelf.bookId, bookId),
				),
			);
		return result ?? null;
	}

	async remove(userId: string, bookId: number): Promise<boolean> {
		const result = await db
			.delete(userAudiobookShelf)
			.where(
				and(
					eq(userAudiobookShelf.userId, userId),
					eq(userAudiobookShelf.bookId, bookId),
				),
			);
		return (result.rowCount ?? 0) > 0;
	}

	async listByStatus(
		userId: string,
		organizationId: string,
		status?: string,
		limit = 50,
	) {
		const filters = [
			eq(userAudiobookShelf.userId, userId),
			eq(library.organizationId, organizationId),
		];
		if (status) {
			filters.push(
				eq(userAudiobookShelf.status, status as UserAudiobookShelf["status"]),
			);
		}

		const rows = await db
			.select({
				bookId: userAudiobookShelf.bookId,
				status: userAudiobookShelf.status,
				updatedAt: userAudiobookShelf.updatedAt,
				bookUuid: book.uuid,
				bookFilename: book.filename,
				title: audiobookMetadata.title,
				cover: audiobookMetadata.cover,
				duration: audiobookMetadata.duration,
			})
			.from(userAudiobookShelf)
			.innerJoin(book, eq(book.id, userAudiobookShelf.bookId))
			.innerJoin(library, eq(library.id, book.libraryId))
			.leftJoin(audiobookMetadata, eq(audiobookMetadata.bookId, book.id))
			.where(and(...filters))
			.orderBy(desc(userAudiobookShelf.updatedAt))
			.limit(limit);

		const bookIds = rows.map((r) => r.bookId);
		const [authorsMap, narratorsMap] = await Promise.all([
			batchLoadAudiobookAuthors(bookIds),
			batchLoadNarrators(bookIds),
		]);

		return rows.map((row) => ({
			...row,
			authors: authorsMap.get(Number(row.bookId)) ?? [],
			narrators: narratorsMap.get(Number(row.bookId)) ?? [],
		}));
	}
}

export const audiobookShelfRepository = new AudiobookShelfRepository();
