import { db } from "@nanahoshi-v2/db";
import { book, bookMetadata, likedBook } from "@nanahoshi-v2/db/schema/general";
import { and, desc, eq, ilike, or, type SQL, sql } from "drizzle-orm";
import { batchLoaderRepository } from "../_shared/batch-loaders";

export type LikedSort = "recent" | "title" | "author";

interface ListLikedOptions {
	limit: number;
	offset: number;
	sort: LikedSort;
	query?: string;
}

export class LikedBooksRepository {
	async isLiked(
		userId: string,
		bookId: number,
		serverId: string,
	): Promise<boolean> {
		const [result] = await db
			.select()
			.from(likedBook)
			.where(
				and(
					eq(likedBook.userId, userId),
					eq(likedBook.bookId, bookId),
					eq(likedBook.serverId, serverId),
				),
			);
		return !!result;
	}

	async insert(userId: string, bookId: number, serverId: string) {
		await db
			.insert(likedBook)
			.values({ userId, bookId, serverId })
			.onConflictDoNothing();
	}

	async remove(userId: string, bookId: number, serverId: string) {
		await db
			.delete(likedBook)
			.where(
				and(
					eq(likedBook.userId, userId),
					eq(likedBook.bookId, bookId),
					eq(likedBook.serverId, serverId),
				),
			);
	}

	private likedWhere(userId: string, serverId: string, query?: string) {
		const conditions: SQL[] = [
			eq(likedBook.userId, userId),
			eq(likedBook.serverId, serverId),
		];
		const trimmed = query?.trim();
		if (trimmed) {
			const pattern = `%${trimmed}%`;
			conditions.push(
				or(
					ilike(bookMetadata.title, pattern),
					ilike(book.filename, pattern),
				) as SQL,
			);
		}
		return and(...conditions);
	}

	async listLiked(
		userId: string,
		serverId: string,
		{ limit, offset, sort, query }: ListLikedOptions,
	) {
		// Primary author name, for the "author" sort. Books without an author sort
		// last (NULLS LAST).
		const authorOrder = sql`(
			SELECT a.name
			FROM book_author ba
			INNER JOIN author a ON a.id = ba.author_id
			WHERE ba.book_id = ${book.id}
			ORDER BY a.name ASC
			LIMIT 1
		) ASC NULLS LAST`;
		const orderBy =
			sort === "title"
				? sql`COALESCE(${bookMetadata.title}, ${book.filename}) ASC`
				: sort === "author"
					? authorOrder
					: desc(likedBook.createdAt);

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
			.where(this.likedWhere(userId, serverId, query))
			.orderBy(orderBy)
			.limit(limit)
			.offset(offset);

		const authorsMap = await batchLoaderRepository.loadEbookAuthors(
			rows.map((r) => r.bookId),
		);

		return rows.map((row) => ({
			...row,
			authors: authorsMap.get(Number(row.bookId)) ?? [],
		}));
	}

	async count(userId: string, serverId: string) {
		const [row] = await db
			.select({ count: sql<number>`count(*)::int` })
			.from(likedBook)
			.where(
				and(eq(likedBook.userId, userId), eq(likedBook.serverId, serverId)),
			);
		return row?.count ?? 0;
	}
}

export const likedBooksRepository = new LikedBooksRepository();
