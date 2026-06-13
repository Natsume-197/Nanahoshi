import { db } from "@nanahoshi-v2/db";
import { book, bookMetadata, likedBook } from "@nanahoshi-v2/db/schema/general";
import { and, desc, eq } from "drizzle-orm";
import { batchLoadEbookAuthors } from "../_shared/batch-loaders";

export class LikedBooksRepository {
	async isLiked(
		userId: string,
		bookId: number,
		organizationId: string,
	): Promise<boolean> {
		const [result] = await db
			.select()
			.from(likedBook)
			.where(
				and(
					eq(likedBook.userId, userId),
					eq(likedBook.bookId, bookId),
					eq(likedBook.organizationId, organizationId),
				),
			);
		return !!result;
	}

	async insert(userId: string, bookId: number, organizationId: string) {
		await db
			.insert(likedBook)
			.values({ userId, bookId, organizationId })
			.onConflictDoNothing();
	}

	async remove(userId: string, bookId: number, organizationId: string) {
		await db
			.delete(likedBook)
			.where(
				and(
					eq(likedBook.userId, userId),
					eq(likedBook.bookId, bookId),
					eq(likedBook.organizationId, organizationId),
				),
			);
	}

	async listLiked(userId: string, limit: number, organizationId: string) {
		const rows = await db
			.select({
				bookId: likedBook.bookId,
				createdAt: likedBook.createdAt,
				bookUuid: book.uuid,
				bookFilename: book.filename,
				title: bookMetadata.title,
				cover: bookMetadata.cover,
				mainColor: bookMetadata.mainColor,
			})
			.from(likedBook)
			.innerJoin(book, eq(book.id, likedBook.bookId))
			.leftJoin(bookMetadata, eq(bookMetadata.bookId, book.id))
			.where(
				and(
					eq(likedBook.userId, userId),
					eq(likedBook.organizationId, organizationId),
				),
			)
			.orderBy(desc(likedBook.createdAt))
			.limit(limit);

		const authorsMap = await batchLoadEbookAuthors(rows.map((r) => r.bookId));

		return rows.map((row) => ({
			...row,
			authors: authorsMap.get(Number(row.bookId)) ?? [],
		}));
	}
}

export const likedBooksRepository = new LikedBooksRepository();
