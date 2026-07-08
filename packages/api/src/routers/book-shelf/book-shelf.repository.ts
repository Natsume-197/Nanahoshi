import { db } from "@nanahoshi-v2/db";
import { user } from "@nanahoshi-v2/db/schema/auth";
import {
	book,
	bookMetadata,
	library,
	userBookShelf,
} from "@nanahoshi-v2/db/schema/general";
import { and, count, desc, eq } from "drizzle-orm";
import type { ListStatus } from "../../constants";
import { batchLoaderRepository } from "../_shared/batch-loaders";
import {
	accessibleCondition,
	type LibraryScope,
} from "../_shared/library-scope";
import type { UserBookShelf } from "./book-shelf.model";

export class BookShelfRepository {
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
				and(eq(userBookShelf.userId, userId), eq(userBookShelf.bookId, bookId)),
			);
		return result ?? null;
	}

	async remove(userId: string, bookId: number): Promise<void> {
		await db
			.delete(userBookShelf)
			.where(
				and(eq(userBookShelf.userId, userId), eq(userBookShelf.bookId, bookId)),
			);
	}

	async listByStatus(
		userId: string,
		serverId: string,
		scope: LibraryScope = "ALL",
		status?: ListStatus,
		limit = 50,
	) {
		const conditions = [
			eq(userBookShelf.userId, userId),
			eq(library.serverId, serverId),
			eq(library.mediaType, "ebook"),
			accessibleCondition(scope),
			...(status ? [eq(userBookShelf.status, status)] : []),
		];

		const rows = await db
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

		const bookIds = rows.map((r) => r.bookId);
		const authorsMap = await batchLoaderRepository.loadEbookAuthors(bookIds);

		return rows.map((row) => ({
			...row,
			authors: authorsMap.get(Number(row.bookId)) ?? [],
		}));
	}

	async listPaginated(
		userId: string,
		serverId: string,
		scope: LibraryScope = "ALL",
		status?: ListStatus,
		limit = 40,
		offset = 0,
	) {
		const conditions = [
			eq(userBookShelf.userId, userId),
			eq(library.serverId, serverId),
			eq(library.mediaType, "ebook"),
			accessibleCondition(scope),
			...(status ? [eq(userBookShelf.status, status)] : []),
		];

		const [countResult] = await db
			.select({ total: count() })
			.from(userBookShelf)
			.innerJoin(book, eq(book.id, userBookShelf.bookId))
			.innerJoin(library, eq(library.id, book.libraryId))
			.where(and(...conditions));

		const total = countResult?.total ?? 0;

		const rows = await db
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
			.limit(limit)
			.offset(offset);

		const bookIds = rows.map((r) => r.bookId);
		const authorsMap = await batchLoaderRepository.loadEbookAuthors(bookIds);

		return {
			items: rows.map((row) => ({
				...row,
				authors: authorsMap.get(Number(row.bookId)) ?? [],
			})),
			total,
		};
	}
}

export const bookShelfRepository = new BookShelfRepository();
