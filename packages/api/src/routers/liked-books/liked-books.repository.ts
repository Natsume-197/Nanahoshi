import { db } from "@nanahoshi-v2/db";
import {
	audiobookMetadata,
	book,
	bookMetadata,
	library,
	likedBook,
} from "@nanahoshi-v2/db/schema/general";
import { and, desc, eq, ilike, or, type SQL, sql } from "drizzle-orm";
import {
	type AuthorInfo,
	type AuthorInfoFull,
	batchLoaderRepository,
} from "../_shared/batch-loaders";
import {
	accessibleCondition,
	type LibraryScope,
} from "../_shared/library-scope";

export type LikedSort = "recent" | "title" | "author";
export type LikedFormat = "books" | "audiobooks";

interface ListLikedOptions {
	limit: number;
	offset: number;
	sort: LikedSort;
	query?: string;
	format?: LikedFormat;
}

type LikedListItem = {
	bookId: number;
	createdAt: string;
	bookUuid: string;
	bookFilename: string;
	title: string | null;
	cover: string | null;
	mainColor: string | null;
	authors: Array<AuthorInfo | AuthorInfoFull>;
};

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

	private likedWhere(
		userId: string,
		serverId: string,
		isAudiobook: boolean,
		scope: LibraryScope = "ALL",
		query?: string,
	) {
		const metadata = isAudiobook ? audiobookMetadata : bookMetadata;
		const conditions: (SQL | undefined)[] = [
			eq(likedBook.userId, userId),
			eq(likedBook.serverId, serverId),
			eq(library.mediaType, isAudiobook ? "audiobook" : "ebook"),
			accessibleCondition(scope),
		];
		const trimmed = query?.trim();
		if (trimmed) {
			const pattern = `%${trimmed}%`;
			conditions.push(
				or(
					ilike(metadata.title, pattern),
					ilike(book.filename, pattern),
				) as SQL,
			);
		}
		return and(...conditions);
	}

	async listLiked(
		userId: string,
		serverId: string,
		options: ListLikedOptions,
	): Promise<LikedListItem[]>;
	async listLiked(
		userId: string,
		serverId: string,
		scope: LibraryScope,
		options: ListLikedOptions,
	): Promise<LikedListItem[]>;
	async listLiked(
		userId: string,
		serverId: string,
		scopeOrOptions: LibraryScope | ListLikedOptions,
		options?: ListLikedOptions,
	): Promise<LikedListItem[]> {
		const scope = options ? (scopeOrOptions as LibraryScope) : "ALL";
		const { limit, offset, sort, query, format } =
			options ?? (scopeOrOptions as ListLikedOptions);
		const isAudiobook = format === "audiobooks";
		const metadata = isAudiobook ? audiobookMetadata : bookMetadata;
		// Primary author name, for the "author" sort. Books without an author sort
		// last (NULLS LAST).
		const authorOrder = isAudiobook
			? sql`(
				SELECT a.name
				FROM audiobook_author ba
				INNER JOIN author a ON a.id = ba.author_id
				WHERE ba.book_id = ${book.id}
				ORDER BY a.name ASC
				LIMIT 1
			) ASC NULLS LAST`
			: sql`(
				SELECT a.name
				FROM book_author ba
				INNER JOIN author a ON a.id = ba.author_id
				WHERE ba.book_id = ${book.id}
				ORDER BY a.name ASC
				LIMIT 1
			) ASC NULLS LAST`;
		const orderBy =
			sort === "title"
				? sql`COALESCE(${metadata.title}, ${book.filename}) ASC`
				: sort === "author"
					? authorOrder
					: desc(likedBook.createdAt);

		const rows = await db
			.select({
				bookId: likedBook.bookId,
				createdAt: likedBook.createdAt,
				bookUuid: book.uuid,
				bookFilename: book.filename,
				title: metadata.title,
				cover: metadata.cover,
				mainColor: metadata.mainColor,
			})
			.from(likedBook)
			.innerJoin(book, eq(book.id, likedBook.bookId))
			.innerJoin(library, eq(library.id, book.libraryId))
			.leftJoin(metadata, eq(metadata.bookId, book.id))
			.where(this.likedWhere(userId, serverId, isAudiobook, scope, query))
			.orderBy(orderBy)
			.limit(limit)
			.offset(offset);

		const bookIds = rows.map((r) => r.bookId);
		const authorsMap = isAudiobook
			? await batchLoaderRepository.loadAudiobookAuthors(bookIds)
			: await batchLoaderRepository.loadEbookAuthors(bookIds);

		return rows.map((row) => ({
			...row,
			authors: authorsMap.get(Number(row.bookId)) ?? [],
		}));
	}

	async count(
		userId: string,
		serverId: string,
		scope: LibraryScope = "ALL",
		format?: LikedFormat,
	) {
		const [row] = await db
			.select({ count: sql<number>`count(*)::int` })
			.from(likedBook)
			.innerJoin(book, eq(book.id, likedBook.bookId))
			.innerJoin(library, eq(library.id, book.libraryId))
			.where(
				and(
					eq(likedBook.userId, userId),
					eq(likedBook.serverId, serverId),
					eq(
						library.mediaType,
						format === "audiobooks" ? "audiobook" : "ebook",
					),
					accessibleCondition(scope),
				),
			);
		return row?.count ?? 0;
	}
}

export const likedBooksRepository = new LikedBooksRepository();
