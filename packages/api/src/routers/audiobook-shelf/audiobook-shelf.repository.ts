import { db } from "@nanahoshi-v2/db";
import { user } from "@nanahoshi-v2/db/schema/auth";
import {
	audiobookMetadata,
	book,
	library,
	userAudiobookShelf,
} from "@nanahoshi-v2/db/schema/general";
import { and, count, desc, eq } from "drizzle-orm";
import { batchLoaderRepository } from "../_shared/batch-loaders";
import {
	accessibleCondition,
	type LibraryScope,
} from "../_shared/library-scope";
import type { UserAudiobookShelf } from "./audiobook-shelf.model";

export class AudiobookShelfRepository {
	async getUserIdByUsername(username: string): Promise<string | null> {
		const [result] = await db
			.select({ id: user.id })
			.from(user)
			.where(eq(user.username, username.toLowerCase()));
		return result?.id ?? null;
	}

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
		serverId: string,
		scope: LibraryScope = "ALL",
		status?: string,
		limit = 50,
	) {
		const filters = [
			eq(userAudiobookShelf.userId, userId),
			eq(library.serverId, serverId),
			eq(library.mediaType, "audiobook"),
			accessibleCondition(scope),
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
			batchLoaderRepository.loadAudiobookAuthors(bookIds),
			batchLoaderRepository.loadNarrators(bookIds),
		]);

		return rows.map((row) => ({
			...row,
			authors: authorsMap.get(Number(row.bookId)) ?? [],
			narrators: narratorsMap.get(Number(row.bookId)) ?? [],
		}));
	}

	async listPaginated(
		userId: string,
		serverId: string,
		scope: LibraryScope = "ALL",
		status?: string,
		limit = 40,
		offset = 0,
	) {
		const conditions = [
			eq(userAudiobookShelf.userId, userId),
			eq(library.serverId, serverId),
			eq(library.mediaType, "audiobook"),
			accessibleCondition(scope),
			...(status
				? [
						eq(
							userAudiobookShelf.status,
							status as UserAudiobookShelf["status"],
						),
					]
				: []),
		];

		const [countResult] = await db
			.select({ total: count() })
			.from(userAudiobookShelf)
			.innerJoin(book, eq(book.id, userAudiobookShelf.bookId))
			.innerJoin(library, eq(library.id, book.libraryId))
			.where(and(...conditions));

		const total = countResult?.total ?? 0;

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
			.where(and(...conditions))
			.orderBy(desc(userAudiobookShelf.updatedAt))
			.limit(limit)
			.offset(offset);

		const bookIds = rows.map((row) => row.bookId);
		const [authorsMap, narratorsMap] = await Promise.all([
			batchLoaderRepository.loadAudiobookAuthors(bookIds),
			batchLoaderRepository.loadNarrators(bookIds),
		]);

		return {
			items: rows.map((row) => ({
				...row,
				authors: authorsMap.get(Number(row.bookId)) ?? [],
				narrators: narratorsMap.get(Number(row.bookId)) ?? [],
			})),
			total,
		};
	}
}

export const audiobookShelfRepository = new AudiobookShelfRepository();
