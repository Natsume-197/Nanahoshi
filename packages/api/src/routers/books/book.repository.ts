import { db } from "@nanahoshi-v2/db";
import {
	author,
	book,
	bookAuthor,
	bookMetadata,
	bookSeries,
	library,
	publisher,
	series,
} from "@nanahoshi-v2/db/schema/general";
import { and, asc, desc, eq, type SQL, sql } from "drizzle-orm";
import { batchLoadEbookAuthors } from "../_shared/batch-loaders";
import type { Book, CreateBookInput } from "./book.model";

export class BookRepository {
	async create(input: CreateBookInput): Promise<Book | undefined> {
		const [inserted] = await db
			.insert(book)
			.values(input)
			.onConflictDoNothing({ target: [book.libraryId, book.filehash] })
			.returning();
		return inserted;
	}

	async getById(id: number): Promise<Book | null> {
		const [result] = await db.select().from(book).where(eq(book.id, id));
		return result ?? null;
	}

	async getIdByUuid(uuid: string): Promise<number | null> {
		const [result] = await db
			.select({ id: book.id })
			.from(book)
			.where(eq(book.uuid, uuid))
			.limit(1);
		return result?.id ?? null;
	}

	async getByUuid(uuid: string, organizationId?: string): Promise<Book | null> {
		if (organizationId) {
			const [result] = await db
				.select()
				.from(book)
				.innerJoin(library, eq(library.id, book.libraryId))
				.where(
					and(eq(book.uuid, uuid), eq(library.organizationId, organizationId)),
				)
				.limit(1);

			return result?.book ?? null;
		}

		const [result] = await db.select().from(book).where(eq(book.uuid, uuid));
		return result ?? null;
	}

	async getWithMetadata(uuid: string, organizationId?: string) {
		const conditions = [eq(book.uuid, uuid)];
		if (organizationId) {
			conditions.push(eq(library.organizationId, organizationId));
		}

		const result = await db.execute(sql`
			SELECT
				b.*,
				l.media_type AS "libraryMediaType",
				bm.title, bm.subtitle, bm.description,
				bm.published_date AS "publishedDate",
				bm.language_code AS "languageCode",
				bm.page_count AS "pageCount",
				bm.isbn_10 AS "isbn10", bm.isbn_13 AS "isbn13",
				bm.asin, bm.cover, bm.main_color AS "mainColor",
				bm.amount_chars AS "amountChars",
				bm.title_romaji AS "titleRomaji",
				jsonb_build_object('name', p.name) AS publisher,
				jsonb_build_object('name', s.name, 'position', bs.position) AS series,
				COALESCE(
					jsonb_agg(DISTINCT jsonb_build_object('id', a.id, 'name', a.name, 'role', ba.role, 'provider', a.provider))
					FILTER (WHERE a.id IS NOT NULL), '[]'
				) AS authors,
				COALESCE(
					jsonb_agg(DISTINCT g.name)
					FILTER (WHERE g.id IS NOT NULL), '[]'
				) AS genres
			FROM book b
			INNER JOIN library l ON l.id = b.library_id
			LEFT JOIN book_metadata bm ON bm.book_id = b.id
			LEFT JOIN book_author ba ON ba.book_id = b.id
			LEFT JOIN author a ON a.id = ba.author_id
			LEFT JOIN book_genre bg ON bg.book_id = bm.book_id
			LEFT JOIN genre g ON g.id = bg.genre_id
			LEFT JOIN publisher p ON p.id = bm.publisher_id
			LEFT JOIN series s ON s.id = bm.series_id
			LEFT JOIN book_series bs ON bs.book_id = b.id AND bs.series_id = bm.series_id
			WHERE b.uuid = ${uuid} ${organizationId ? sql`AND l.organization_id = ${organizationId}` : sql``}
			GROUP BY b.id, l.media_type, bm.book_id, p.id, s.id, bs.position
			LIMIT 1
		`);

		const row = result.rows[0] as Record<string, unknown> | undefined;
		if (!row) return null;

		const filename = row.filename as string;
		const publisherObj =
			(row.publisher as Record<string, unknown>)?.name != null
				? (row.publisher as { name: string })
				: null;
		const seriesObj =
			(row.series as Record<string, unknown>)?.name != null
				? (row.series as { name: string; position: number | null })
				: null;
		const authors = (
			row.authors as Array<{
				id: number;
				name: string;
				role: string | null;
				provider: string | null;
			}>
		).map((a) => ({
			id: a.id,
			name: a.name,
			role: a.role ?? "Author",
			provider: a.provider,
		}));

		return {
			id: row.id as number,
			createdAt: row.created_at as string,
			filename,
			userId: row.user_id as string | null,
			lastModified: row.last_modified as string | null,
			filesizeKb: row.filesize_kb as number | null,
			libraryId: row.library_id as number | null,
			libraryPathId: row.library_path_id as number | null,
			mediaType: row.media_type as string | null,
			libraryMediaType: row.libraryMediaType as "ebook" | "audiobook",
			filehash: row.filehash as string,
			relativePath: row.relative_path as string | null,
			uuid: row.uuid as string,
			title: row.title as string | null,
			subtitle: row.subtitle as string | null,
			description: row.description as string | null,
			publishedDate: row.publishedDate as string | null,
			languageCode: row.languageCode as string | null,
			pageCount: row.pageCount as number | null,
			isbn10: row.isbn10 as string | null,
			isbn13: row.isbn13 as string | null,
			asin: row.asin as string | null,
			cover: row.cover as string | null,
			mainColor: row.mainColor as string | null,
			amountChars: row.amountChars as number | null,
			titleRomaji: row.titleRomaji as string | null,
			publisher: publisherObj,
			series: seriesObj,
			authors,
			genres: (row.genres as string[]) ?? [],
		};
	}

	async getByRelativePath(
		relativePath: string,
		libraryPathId: number,
	): Promise<Book | null> {
		// Normalize path separators (convert backslashes to forward slashes)
		const normalizedPath = relativePath.replace(/\\/g, "/");

		// Use SQL to normalize paths in the database for comparison
		const [result] = await db
			.select()
			.from(book)
			.where(
				and(
					eq(book.libraryPathId, libraryPathId),
					sql`REPLACE(${book.relativePath}, '\\', '/') = ${normalizedPath}`,
				),
			);

		return result ?? null;
	}

	async listRecent(limit = 20, organizationId?: string) {
		const conditions = [eq(library.mediaType, "ebook")];
		if (organizationId) {
			conditions.push(eq(library.organizationId, organizationId));
		}

		const query = db
			.select({
				id: book.id,
				uuid: book.uuid,
				filename: book.filename,
				filesizeKb: book.filesizeKb,
				createdAt: book.createdAt,
				lastModified: book.lastModified,
				title: bookMetadata.title,
				subtitle: bookMetadata.subtitle,
				description: bookMetadata.description,
				cover: bookMetadata.cover,
				mainColor: bookMetadata.mainColor,
				languageCode: bookMetadata.languageCode,
				pageCount: bookMetadata.pageCount,
				publisherName: publisher.name,
			})
			.from(book)
			.innerJoin(library, eq(library.id, book.libraryId))
			.leftJoin(bookMetadata, eq(bookMetadata.bookId, book.id))
			.leftJoin(publisher, eq(publisher.id, bookMetadata.publisherId))
			.where(and(...conditions))
			.orderBy(desc(book.createdAt))
			.limit(limit);

		const rows = await query;
		const authorsMap = await batchLoadEbookAuthors(rows.map((r) => r.id));

		return rows.map((row) => ({
			...row,
			authors: authorsMap.get(Number(row.id)) ?? [],
		}));
	}

	async listRandom(limit = 15, organizationId?: string) {
		const conditions = [eq(library.mediaType, "ebook")];
		if (organizationId) {
			conditions.push(eq(library.organizationId, organizationId));
		}

		const query = db
			.select({
				id: book.id,
				uuid: book.uuid,
				filename: book.filename,
				title: bookMetadata.title,
				cover: bookMetadata.cover,
				mainColor: bookMetadata.mainColor,
			})
			.from(book)
			.innerJoin(library, eq(library.id, book.libraryId))
			.leftJoin(bookMetadata, eq(bookMetadata.bookId, book.id))
			.where(and(...conditions))
			.orderBy(sql`RANDOM()`)
			.limit(limit);

		const rows = await query;
		const authorsMap = await batchLoadEbookAuthors(rows.map((r) => r.id));

		return rows.map((row) => ({
			...row,
			authors: authorsMap.get(Number(row.id)) ?? [],
		}));
	}

	private static readonly catalogColumns = {
		id: book.id,
		uuid: book.uuid,
		filename: book.filename,
		createdAt: book.createdAt,
		title: bookMetadata.title,
		cover: bookMetadata.cover,
	};

	private catalogBaseQuery() {
		return db
			.select(BookRepository.catalogColumns)
			.from(book)
			.innerJoin(library, eq(library.id, book.libraryId))
			.leftJoin(bookMetadata, eq(bookMetadata.bookId, book.id));
	}

	async listPaginated(
		organizationId: string,
		orderBy: SQL,
		limit: number,
		offset: number,
	) {
		const rows = await this.catalogBaseQuery()
			.where(eq(library.organizationId, organizationId))
			.orderBy(orderBy)
			.limit(limit)
			.offset(offset);

		const authorsMap = await batchLoadEbookAuthors(rows.map((r) => r.id));
		return rows.map((row) => ({
			...row,
			authors: (authorsMap.get(Number(row.id)) ?? []).map((a) => ({
				id: a.id,
				name: a.name,
			})),
		}));
	}

	async listByAuthorId(
		authorId: number,
		organizationId: string,
		limit: number,
		offset: number,
	) {
		const rows = await this.catalogBaseQuery()
			.innerJoin(bookAuthor, eq(bookAuthor.bookId, book.id))
			.where(
				and(
					eq(library.organizationId, organizationId),
					eq(bookAuthor.authorId, authorId),
				),
			)
			.orderBy(desc(book.createdAt))
			.limit(limit)
			.offset(offset);

		const authorsMap = await batchLoadEbookAuthors(rows.map((r) => r.id));
		return rows.map((row) => ({
			...row,
			authors: (authorsMap.get(Number(row.id)) ?? []).map((a) => ({
				id: a.id,
				name: a.name,
			})),
		}));
	}

	async listBySeriesId(
		seriesId: number,
		organizationId: string,
		limit: number,
		offset: number,
	) {
		const rows = await db
			.select(BookRepository.catalogColumns)
			.from(book)
			.innerJoin(library, eq(library.id, book.libraryId))
			.innerJoin(bookSeries, eq(bookSeries.bookId, book.id))
			.leftJoin(bookMetadata, eq(bookMetadata.bookId, book.id))
			.where(
				and(
					eq(library.organizationId, organizationId),
					eq(bookSeries.seriesId, seriesId),
				),
			)
			.orderBy(asc(bookSeries.position))
			.limit(limit)
			.offset(offset);

		const authorsMap = await batchLoadEbookAuthors(rows.map((r) => r.id));
		return rows.map((row) => ({
			...row,
			authors: (authorsMap.get(Number(row.id)) ?? []).map((a) => ({
				id: a.id,
				name: a.name,
			})),
		}));
	}

	async getAuthorName(authorId: number): Promise<string | null> {
		const [row] = await db
			.select({ name: author.name })
			.from(author)
			.where(eq(author.id, authorId))
			.limit(1);
		return row?.name ?? null;
	}

	async getSeriesName(seriesId: number): Promise<string | null> {
		const [row] = await db
			.select({ name: series.name })
			.from(series)
			.where(eq(series.id, seriesId))
			.limit(1);
		return row?.name ?? null;
	}

	async getIdsByLibraryId(
		libraryId: number,
	): Promise<{ id: number; uuid: string }[]> {
		return db
			.select({ id: book.id, uuid: book.uuid })
			.from(book)
			.where(eq(book.libraryId, libraryId));
	}

	async getIdsByLibraryPathId(
		libraryPathId: number,
	): Promise<{ id: number; uuid: string }[]> {
		return db
			.select({ id: book.id, uuid: book.uuid })
			.from(book)
			.where(eq(book.libraryPathId, libraryPathId));
	}

	async removeBook(id: number): Promise<boolean> {
		try {
			// THIS REMOVES ALSO
			// - bookMetadata (cascade)
			// - bookAuthor (cascade)
			// - likedBook (cascade)
			// - collectionBook (cascade)

			const deleted = await db.delete(book).where(eq(book.id, id));

			return (deleted.rowCount ?? 0) > 0;
		} catch (error) {
			console.error(`Error removing book with id ${id}:`, error);
			return false;
		}
	}

	async removeBookByRelativePath(
		relativePath: string,
		libraryPathId: number,
	): Promise<boolean> {
		try {
			console.log(relativePath, libraryPathId);
			const bookRecord = await this.getByRelativePath(
				relativePath,
				libraryPathId,
			);

			if (!bookRecord) {
				console.log(`Book not found for relative path: ${relativePath}`);
				return false;
			}

			return await this.removeBook(Number(bookRecord.id));
		} catch (error) {
			console.error(
				`Error removing book by relative path ${relativePath}:`,
				error,
			);
			return false;
		}
	}

	async listBySeriesName(seriesName: string, organizationId?: string) {
		const result = await db.execute(sql`
			SELECT
				b.uuid, b.filename,
				bm.title, bm.cover, bm.main_color AS "mainColor",
				bs.position
			FROM book b
			INNER JOIN library l ON l.id = b.library_id
			INNER JOIN book_metadata bm ON bm.book_id = b.id
			INNER JOIN book_series bs ON bs.book_id = b.id
			INNER JOIN series s ON s.id = bs.series_id
			WHERE s.name = ${seriesName}
			${organizationId ? sql`AND l.organization_id = ${organizationId}` : sql``}
			ORDER BY bs.position ASC NULLS LAST, bm.title ASC
		`);

		return result.rows.map((row) => ({
			uuid: row.uuid as string,
			filename: row.filename as string,
			title: (row.title as string | null) ?? (row.filename as string),
			cover: row.cover as string | null,
			mainColor: row.mainColor as string | null,
			position: row.position as number | null,
		}));
	}
}
export const bookRepository = new BookRepository();
