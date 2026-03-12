import { db } from "@nanahoshi-v2/db";
import {
	book,
	bookMetadata,
	library,
	userBookShelf,
} from "@nanahoshi-v2/db/schema/general";
import { and, desc, eq } from "drizzle-orm";
import type { ListStatus } from "../../constants";
import type { UserBookShelf } from "./book-shelf.model";

export class BookShelfRepository {
	async upsert(
		userId: string,
		bookId: number,
		status: ListStatus,
	): Promise<UserBookShelf> {
		const now = new Date().toISOString();
		const [row] = await db
			.insert(userBookShelf)
			.values({ userId, bookId, status, updatedAt: now })
			.onConflictDoUpdate({
				target: [userBookShelf.userId, userBookShelf.bookId],
				set: { status, updatedAt: now },
			})
			.returning();
		return row as UserBookShelf;
	}

	async getByUserAndBook(
		userId: string,
		bookId: number,
	): Promise<UserBookShelf | null> {
		const [result] = await db
			.select()
			.from(userBookShelf)
			.where(
				and(
					eq(userBookShelf.userId, userId),
					eq(userBookShelf.bookId, bookId),
				),
			);
		return result ?? null;
	}

	async remove(userId: string, bookId: number): Promise<void> {
		await db
			.delete(userBookShelf)
			.where(
				and(
					eq(userBookShelf.userId, userId),
					eq(userBookShelf.bookId, bookId),
				),
			);
	}

	async listByStatus(
		userId: string,
		organizationId: string,
		status?: ListStatus,
		limit = 50,
	) {
		const conditions = [
			eq(userBookShelf.userId, userId),
			eq(library.organizationId, organizationId),
			...(status ? [eq(userBookShelf.status, status)] : []),
		];

		return db
			.select({
				bookId: userBookShelf.bookId,
				status: userBookShelf.status,
				updatedAt: userBookShelf.updatedAt,
				bookUuid: book.uuid,
				bookFilename: book.filename,
				title: bookMetadata.title,
				cover: bookMetadata.cover,
				mainColor: bookMetadata.mainColor,
			})
			.from(userBookShelf)
			.innerJoin(book, eq(book.id, userBookShelf.bookId))
			.innerJoin(library, eq(library.id, book.libraryId))
			.leftJoin(bookMetadata, eq(bookMetadata.bookId, book.id))
			.where(and(...conditions))
			.orderBy(desc(userBookShelf.updatedAt))
			.limit(limit);
	}
}

export const bookShelfRepository = new BookShelfRepository();
