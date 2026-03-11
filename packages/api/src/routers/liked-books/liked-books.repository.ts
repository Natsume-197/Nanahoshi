import { db } from "@nanahoshi-v2/db";
import {
	book,
	bookMetadata,
	likedBook,
} from "@nanahoshi-v2/db/schema/general";
import { and, desc, eq } from "drizzle-orm";

export class LikedBooksRepository {
	async isLiked(userId: string, bookId: number, organizationId: string): Promise<boolean> {
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

	async listLiked(userId: string, limit = 20, organizationId: string) {
		return db
			.select({
				bookId: likedBook.bookId,
				createdAt: likedBook.createdAt,
				bookUuid: book.uuid,
				bookFilename: book.filename,
				title: bookMetadata.title,
				cover: bookMetadata.cover,
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
	}
}

export const likedBooksRepository = new LikedBooksRepository();
