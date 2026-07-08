import { db } from "@nanahoshi-v2/db";
import {
	audiobookMetadata,
	author,
	book,
	bookAuthor,
	bookMetadata,
	bookSeries,
	library,
	publisher,
	series,
} from "@nanahoshi-v2/db/schema/general";
import {
	and,
	asc,
	desc,
	eq,
	ilike,
	inArray,
	isNotNull,
	isNull,
	or,
	type SQL,
	sql,
} from "drizzle-orm";
import { logger } from "../../lib/logger";
import { batchLoaderRepository } from "../_shared/batch-loaders";
import {
	accessibleCondition,
	accessibleSql,
	type LibraryScope,
} from "../_shared/library-scope";
import { bayesianRatingSql } from "../_shared/rating";
import type { Book, CreateBookInput } from "./book.model";

export type { LibraryScope };

const log = logger.child({ component: "book-repository" });

/** SQL-normalized ISBN column (mirrors normalizeIsbn in duplicateGrouping). */
function normIsbnSql(
	col: typeof bookMetadata.isbn13 | typeof bookMetadata.isbn10,
) {
	return sql`upper(replace(replace(coalesce(${col}, ''), '-', ''), ' ', ''))`;
}

type WithMetadataRow = {
	id: number;
	created_at: string;
	filename: string;
	user_id: string | null;
	last_modified: string | null;
	filesize_kb: number | null;
	library_id: number | null;
	library_path_id: number | null;
	media_type: string | null;
	filehash: string;
	relative_path: string | null;
	uuid: string;
	duplicate_of_book_id: number | null;
	libraryMediaType: "ebook" | "audiobook";
	libraryUuid: string | null;
	libraryName: string | null;
	title: string | null;
	subtitle: string | null;
	description: string | null;
	publishedDate: string | null;
	languageCode: string | null;
	pageCount: number | null;
	isbn10: string | null;
	isbn13: string | null;
	asin: string | null;
	cover: string | null;
	mainColor: string | null;
	amountChars: number | null;
	titleRomaji: string | null;
	amazonRating: number | null;
	amazonReviewCount: number | null;
	publisher: { uuid: string; name: string } | null;
	series: { uuid: string; name: string; position: number | null } | null;
	authors: Array<{
		uuid: string;
		name: string;
		role: string | null;
		provider: string | null;
	}>;
	genres: Array<{ uuid: string; name: string }> | null;
};

type SiblingRow = {
	id: number;
	uuid: string;
	filename: string;
	mediaType: string | null;
	filesizeKb: number | null;
	isCanonical: boolean;
};

type EntityBookRow = {
	id: number;
	uuid: string;
	filename: string;
	title: string | null;
	cover: string | null;
	mainColor: string | null;
	publishedDate: string | null;
};

type SeriesNameRow = EntityBookRow & {
	position: number | null;
};

type GenreNameRow = EntityBookRow;

type PublisherNameRow = EntityBookRow;

export class BookRepository {
	async create(input: CreateBookInput): Promise<Book | undefined> {
		const [inserted] = await db
			.insert(book)
			.values(input)
			.onConflictDoNothing({ target: [book.libraryId, book.filehash] })
			.returning();
		return inserted;
	}

	// Updates a book's file-derived fields after its file changed on disk. Returns
	// false if the book is gone or the new filehash collides (became a duplicate).
	async updateFileInfo(
		id: number,
		input: {
			filehash: string;
			filesizeKb: number;
			lastModified: string | null;
		},
	): Promise<boolean> {
		try {
			const updated = await db.update(book).set(input).where(eq(book.id, id));
			return (updated.rowCount ?? 0) > 0;
		} catch (error) {
			log.error({ err: error, id }, "Error updating file info for book");
			return false;
		}
	}

	// Migrates book.filehash after the scanner re-hashed unchanged files to a
	// new hash format. Skips a row if the new hash already belongs to another
	// book in the same library (the scanner's dedupe handles those).
	async rehashFilehashBatch(
		libraryPathId: number,
		rows: Array<{ relativePath: string; hash: string }>,
	): Promise<void> {
		if (rows.length === 0) return;
		await db.execute(sql`
			update book set filehash = v.hash
			from (
				select * from unnest(
					${sql.param(rows.map((r) => r.relativePath))}::text[],
					${sql.param(rows.map((r) => r.hash))}::text[]
				) as t(relative_path, hash)
			) v
			where book.library_path_id = ${libraryPathId}
				and book.relative_path = v.relative_path
				and not exists (
					select 1 from book b2
					where b2.library_id = book.library_id
						and b2.filehash = v.hash
						and b2.id <> book.id
				)
		`);
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

	// Display title for a book (metadata title, falling back to the filename).
	async getTitleById(bookId: number): Promise<string | null> {
		const [result] = await db
			.select({ title: bookMetadata.title, filename: book.filename })
			.from(book)
			.leftJoin(bookMetadata, eq(bookMetadata.bookId, book.id))
			.where(eq(book.id, bookId))
			.limit(1);
		if (!result) return null;
		return result.title ?? result.filename;
	}

	// Resolves a book's owning org (via its library), unscoped — recovers the
	// right org when a user opens a book URL outside their active org.
	async getOrganizationId(uuid: string): Promise<string | null> {
		const [result] = await db
			.select({ serverId: library.serverId })
			.from(book)
			.innerJoin(library, eq(library.id, book.libraryId))
			.where(eq(book.uuid, uuid))
			.limit(1);
		return result?.serverId ?? null;
	}

	async getByUuid(
		uuid: string,
		serverId?: string,
		scope?: LibraryScope,
	): Promise<Book | null> {
		if (serverId) {
			const [result] = await db
				.select()
				.from(book)
				.innerJoin(library, eq(library.id, book.libraryId))
				.where(
					and(
						eq(book.uuid, uuid),
						eq(library.serverId, serverId),
						accessibleCondition(scope),
					),
				)
				.limit(1);

			return result?.book ?? null;
		}

		const [result] = await db.select().from(book).where(eq(book.uuid, uuid));
		return result ?? null;
	}

	async getWithMetadata(uuid: string, serverId?: string, scope?: LibraryScope) {
		const result = await db.execute(sql`
			SELECT
				b.*,
				l.media_type AS "libraryMediaType",
				l.uuid AS "libraryUuid",
				l.name AS "libraryName",
				bm.title, bm.subtitle, bm.description,
				bm.published_date AS "publishedDate",
				bm.language_code AS "languageCode",
				bm.page_count AS "pageCount",
				bm.isbn_10 AS "isbn10", bm.isbn_13 AS "isbn13",
				bm.asin, bm.cover, bm.main_color AS "mainColor",
				bm.amount_chars AS "amountChars",
				bm.title_romaji AS "titleRomaji",
				bm.amazon_rating AS "amazonRating",
				bm.amazon_review_count AS "amazonReviewCount",
				jsonb_build_object('uuid', p.uuid, 'name', p.name) AS publisher,
				(
					SELECT jsonb_build_object('uuid', s.uuid, 'name', s.name, 'position', bs.position)
					FROM book_series bs
					INNER JOIN series s ON s.id = bs.series_id
					WHERE bs.book_id = b.id
					ORDER BY bs.position ASC NULLS LAST
					LIMIT 1
				) AS series,
				COALESCE(
					jsonb_agg(DISTINCT jsonb_build_object('uuid', a.uuid, 'name', a.name, 'role', ba.role, 'provider', a.provider))
					FILTER (WHERE a.id IS NOT NULL), '[]'
				) AS authors,
				COALESCE(
					jsonb_agg(DISTINCT jsonb_build_object('uuid', g.uuid, 'name', g.name))
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
			WHERE b.uuid = ${uuid} ${serverId ? sql`AND l.server_id = ${serverId}` : sql``} ${accessibleSql(scope)}
			GROUP BY b.id, l.id, bm.book_id, p.id
			LIMIT 1
		`);

		const row = result.rows[0] as WithMetadataRow | undefined;
		if (!row) return null;

		// Group siblings around the canonical (duplicate target, or self): lists the
		// other copies/formats for download. Unfiltered queries above keep direct
		// URLs to hidden copies resolving.
		const bookId = row.id;
		const duplicateOfBookId = row.duplicate_of_book_id;
		const anchor = duplicateOfBookId ?? bookId;
		const siblingsResult = await db.execute(sql`
			SELECT
				b.id, b.uuid, b.filename,
				b.media_type AS "mediaType",
				b.filesize_kb AS "filesizeKb",
				(b.duplicate_of_book_id IS NULL) AS "isCanonical"
			FROM book b
			WHERE b.duplicate_of_book_id = ${anchor} OR b.id = ${anchor}
			ORDER BY b.filesize_kb DESC NULLS LAST, b.id ASC
		`);
		const siblings = siblingsResult.rows as SiblingRow[];
		const otherCopies = siblings
			// Exclude the book being viewed and the canonical edition (the canonical
			// is reached via the DuplicateBanner, so it shouldn't repeat here).
			.filter((s) => Number(s.id) !== Number(bookId) && !s.isCanonical)
			.map((s) => ({
				uuid: s.uuid,
				filename: s.filename,
				mediaType: s.mediaType,
				filesizeKb: s.filesizeKb,
			}));
		const canonicalUuid = siblings.find((s) => s.isCanonical)?.uuid ?? null;

		const filename = row.filename;
		const publisherObj = row.publisher?.name != null ? row.publisher : null;
		const seriesObj = row.series?.name != null ? row.series : null;
		const authors = row.authors.map((a) => ({
			uuid: a.uuid,
			name: a.name,
			role: a.role ?? "Author",
			provider: a.provider,
		}));

		return {
			id: row.id,
			createdAt: row.created_at,
			filename,
			userId: row.user_id,
			lastModified: row.last_modified,
			filesizeKb: row.filesize_kb,
			libraryId: row.library_id,
			libraryPathId: row.library_path_id,
			mediaType: row.media_type,
			libraryMediaType: row.libraryMediaType,
			libraryUuid: row.libraryUuid,
			libraryName: row.libraryName,
			filehash: row.filehash,
			relativePath: row.relative_path,
			uuid: row.uuid,
			title: row.title,
			subtitle: row.subtitle,
			description: row.description,
			publishedDate: row.publishedDate,
			languageCode: row.languageCode,
			pageCount: row.pageCount,
			isbn10: row.isbn10,
			isbn13: row.isbn13,
			asin: row.asin,
			cover: row.cover,
			mainColor: row.mainColor,
			amountChars: row.amountChars,
			titleRomaji: row.titleRomaji,
			amazonRating: row.amazonRating,
			amazonReviewCount: row.amazonReviewCount,
			publisher: publisherObj,
			series: seriesObj,
			authors,
			genres: row.genres ?? [],
			isDuplicate: duplicateOfBookId != null,
			canonicalUuid,
			otherCopies,
		};
	}

	async getByRelativePath(
		relativePath: string,
		libraryPathId: number,
	): Promise<Book | null> {
		const normalizedPath = relativePath.replace(/\\/g, "/");

		// Normalize both sides so stored back/forward slashes compare equal.
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

	/** True when a book with this content hash already exists in the library. */
	async existsByLibraryAndHash(
		libraryId: number,
		filehash: string,
	): Promise<boolean> {
		const [row] = await db
			.select({ id: book.id })
			.from(book)
			.where(and(eq(book.libraryId, libraryId), eq(book.filehash, filehash)))
			.limit(1);
		return row !== undefined;
	}

	async listRecent(limit = 20, serverId?: string, scope?: LibraryScope) {
		const conditions = [
			eq(library.mediaType, "ebook"),
			isNull(book.duplicateOfBookId),
		];
		if (serverId) {
			conditions.push(eq(library.serverId, serverId));
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
			.where(and(...conditions, accessibleCondition(scope)))
			.orderBy(desc(book.createdAt))
			.limit(limit);

		const rows = await query;
		const authorsMap = await batchLoaderRepository.loadEbookAuthors(
			rows.map((r) => r.id),
		);

		return rows.map((row) => ({
			...row,
			authors: authorsMap.get(Number(row.id)) ?? [],
		}));
	}

	async listRandom(limit = 15, serverId?: string, scope?: LibraryScope) {
		const conditions = [
			eq(library.mediaType, "ebook"),
			isNull(book.duplicateOfBookId),
		];
		if (serverId) {
			conditions.push(eq(library.serverId, serverId));
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
			.where(and(...conditions, accessibleCondition(scope)))
			.orderBy(sql`RANDOM()`)
			.limit(limit);

		const rows = await query;
		const authorsMap = await batchLoaderRepository.loadEbookAuthors(
			rows.map((r) => r.id),
		);

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
		serverId: string,
		orderBy: SQL,
		limit: number,
		offset: number,
		scope?: LibraryScope,
	) {
		const rows = await this.catalogBaseQuery()
			.where(
				and(
					eq(library.serverId, serverId),
					isNull(book.duplicateOfBookId),
					accessibleCondition(scope),
				),
			)
			.orderBy(orderBy)
			.limit(limit)
			.offset(offset);

		const authorsMap = await batchLoaderRepository.loadEbookAuthors(
			rows.map((r) => r.id),
		);
		return rows.map((row) => ({
			...row,
			authors: (authorsMap.get(Number(row.id)) ?? []).map((a) => ({
				uuid: a.uuid,
				name: a.name,
			})),
		}));
	}

	async listByAuthorId(
		authorId: number,
		serverId: string,
		limit: number,
		offset: number,
		scope?: LibraryScope,
	) {
		const rows = await this.catalogBaseQuery()
			.innerJoin(bookAuthor, eq(bookAuthor.bookId, book.id))
			.where(
				and(
					eq(library.serverId, serverId),
					eq(bookAuthor.authorId, authorId),
					isNull(book.duplicateOfBookId),
					accessibleCondition(scope),
				),
			)
			.orderBy(desc(book.createdAt))
			.limit(limit)
			.offset(offset);

		const authorsMap = await batchLoaderRepository.loadEbookAuthors(
			rows.map((r) => r.id),
		);
		return rows.map((row) => ({
			...row,
			authors: (authorsMap.get(Number(row.id)) ?? []).map((a) => ({
				uuid: a.uuid,
				name: a.name,
			})),
		}));
	}

	async listBySeriesId(
		seriesId: number,
		serverId: string,
		limit: number,
		offset: number,
		scope?: LibraryScope,
	) {
		const rows = await db
			.select(BookRepository.catalogColumns)
			.from(book)
			.innerJoin(library, eq(library.id, book.libraryId))
			.innerJoin(bookSeries, eq(bookSeries.bookId, book.id))
			.leftJoin(bookMetadata, eq(bookMetadata.bookId, book.id))
			.where(
				and(
					eq(library.serverId, serverId),
					eq(bookSeries.seriesId, seriesId),
					isNull(book.duplicateOfBookId),
					accessibleCondition(scope),
				),
			)
			.orderBy(asc(bookSeries.position))
			.limit(limit)
			.offset(offset);

		const authorsMap = await batchLoaderRepository.loadEbookAuthors(
			rows.map((r) => r.id),
		);
		return rows.map((row) => ({
			...row,
			authors: (authorsMap.get(Number(row.id)) ?? []).map((a) => ({
				uuid: a.uuid,
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

	// Which of the given relative paths already have a book in the library; used
	// by dedupe to pick the canonical copy (the one with a book).
	async findByRelativePaths(
		libraryId: number,
		relativePaths: string[],
	): Promise<
		Array<{
			id: number;
			relativePath: string | null;
			libraryPathId: number | null;
		}>
	> {
		if (relativePaths.length === 0) return [];
		return db
			.select({
				id: book.id,
				relativePath: book.relativePath,
				libraryPathId: book.libraryPathId,
			})
			.from(book)
			.where(
				and(
					eq(book.libraryId, libraryId),
					inArray(book.relativePath, relativePaths),
				),
			);
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
			// Cascades to book_metadata, book_author, liked_book, collection_book.
			const deleted = await db.delete(book).where(eq(book.id, id));

			return (deleted.rowCount ?? 0) > 0;
		} catch (error) {
			log.error({ err: error, id }, "Error removing book");
			return false;
		}
	}

	async removeBookByRelativePath(
		relativePath: string,
		libraryPathId: number,
	): Promise<boolean> {
		try {
			log.info(
				{ relativePath, libraryPathId },
				"Removing book by relative path",
			);
			const bookRecord = await this.getByRelativePath(
				relativePath,
				libraryPathId,
			);

			if (!bookRecord) {
				log.info({ relativePath }, "Book not found for relative path");
				return false;
			}

			return await this.removeBook(Number(bookRecord.id));
		} catch (error) {
			log.error(
				{ err: error, relativePath },
				"Error removing book by relative path",
			);
			return false;
		}
	}

	// Batch-loads authors for entity book rows and maps them to the shared shape.
	private async withAuthors<T extends EntityBookRow>(rows: T[]) {
		const authorsMap = await batchLoaderRepository.loadEbookAuthors(
			rows.map((r) => Number(r.id)),
		);
		return rows.map((row) => ({
			uuid: row.uuid,
			filename: row.filename,
			title: row.title ?? row.filename,
			cover: row.cover,
			mainColor: row.mainColor,
			publishedDate: row.publishedDate,
			authors: authorsMap.get(Number(row.id)) ?? [],
		}));
	}

	async listBySeriesUuid(
		seriesUuid: string,
		serverId: string,
		scope?: LibraryScope,
	) {
		const result = await db.execute(sql`
			SELECT
				b.id, b.uuid, b.filename,
				bm.title, bm.cover, bm.main_color AS "mainColor",
				bm.published_date AS "publishedDate",
				bs.position
			FROM book b
			INNER JOIN library l ON l.id = b.library_id
			INNER JOIN book_metadata bm ON bm.book_id = b.id
			INNER JOIN book_series bs ON bs.book_id = b.id
			INNER JOIN series s ON s.id = bs.series_id
			WHERE s.uuid = ${seriesUuid}
			AND b.duplicate_of_book_id IS NULL
			${serverId ? sql`AND l.server_id = ${serverId}` : sql``} ${accessibleSql(scope)}
			ORDER BY bs.position ASC NULLS LAST, bm.title ASC
		`);

		const rows = result.rows as SeriesNameRow[];
		const mapped = await this.withAuthors(rows);
		return mapped.map((book, i) => ({ ...book, position: rows[i]?.position }));
	}

	async listByGenreUuid(
		genreUuid: string,
		serverId: string,
		scope?: LibraryScope,
	) {
		const result = await db.execute(sql`
			SELECT
				b.id, b.uuid, b.filename,
				bm.title, bm.cover, bm.main_color AS "mainColor",
				bm.published_date AS "publishedDate"
			FROM book b
			INNER JOIN library l ON l.id = b.library_id
			INNER JOIN book_metadata bm ON bm.book_id = b.id
			INNER JOIN book_genre bg ON bg.book_id = bm.book_id
			INNER JOIN genre g ON g.id = bg.genre_id
			WHERE g.uuid = ${genreUuid}
			AND b.duplicate_of_book_id IS NULL
			${serverId ? sql`AND l.server_id = ${serverId}` : sql``} ${accessibleSql(scope)}
			ORDER BY bm.title ASC
		`);

		const rows = result.rows as GenreNameRow[];
		return this.withAuthors(rows);
	}

	async listByPublisherUuid(
		publisherUuid: string,
		serverId: string,
		scope?: LibraryScope,
	) {
		const result = await db.execute(sql`
			SELECT
				b.id, b.uuid, b.filename,
				bm.title, bm.cover, bm.main_color AS "mainColor",
				bm.published_date AS "publishedDate"
			FROM book b
			INNER JOIN library l ON l.id = b.library_id
			INNER JOIN book_metadata bm ON bm.book_id = b.id
			INNER JOIN publisher p ON p.id = bm.publisher_id
			WHERE p.uuid = ${publisherUuid}
			AND b.duplicate_of_book_id IS NULL
			${serverId ? sql`AND l.server_id = ${serverId}` : sql``} ${accessibleSql(scope)}
			ORDER BY bm.title ASC
		`);

		const rows = result.rows as PublisherNameRow[];
		return this.withAuthors(rows);
	}

	// Shared predicate for a library's visible books, scoped to the caller's
	// accessible libraries and optionally filtered by a title/filename query.
	// Metadata table backing a media type: audiobooks store title/cover/etc. in
	// audiobook_metadata, ebooks in book_metadata. Both expose the columns the
	// catalog reads (title, cover, mainColor, publishedDate).
	private metadataFor(mediaType: "ebook" | "audiobook") {
		return mediaType === "audiobook" ? audiobookMetadata : bookMetadata;
	}

	private libraryBooksWhere(
		libraryId: number,
		serverId: string,
		mediaType: "ebook" | "audiobook",
		scope?: LibraryScope,
		query?: string,
		minRating?: number,
		genres?: string[],
		year?: number,
	): SQL {
		const md = this.metadataFor(mediaType);
		const conditions: (SQL | undefined)[] = [
			eq(book.libraryId, libraryId),
			eq(library.serverId, serverId),
			isNull(book.duplicateOfBookId),
			accessibleCondition(scope),
		];
		const trimmed = query?.trim();
		if (trimmed) {
			const pattern = `%${trimmed}%`;
			conditions.push(
				or(ilike(md.title, pattern), ilike(book.filename, pattern)) as SQL,
			);
		}
		// Rating is an ebook-only facet (audiobook_metadata has no amazonRating).
		if (minRating != null && mediaType === "ebook") {
			conditions.push(sql`${bookMetadata.amazonRating} >= ${minRating}`);
		}
		if (genres && genres.length > 0) {
			// OR-match across both join tables so the predicate works for ebook and
			// audiobook libraries without needing the media type here.
			const names = sql.join(
				genres.map((name) => sql`${name}`),
				sql`, `,
			);
			conditions.push(sql`EXISTS (
				SELECT 1 FROM genre g
				WHERE g.server_id = ${serverId}
					AND g.name IN (${names})
					AND (
						EXISTS (SELECT 1 FROM book_genre bg WHERE bg.book_id = ${book.id} AND bg.genre_id = g.id)
						OR EXISTS (SELECT 1 FROM audiobook_genre ag WHERE ag.book_id = ${book.id} AND ag.genre_id = g.id)
					)
			)`);
		}
		if (year != null) {
			conditions.push(sql`EXTRACT(YEAR FROM ${md.publishedDate}) = ${year}`);
		}
		return and(...conditions.filter((c): c is SQL => c !== undefined)) as SQL;
	}

	// Shared ORDER BY for the paginated book grids (library + server catalog).
	// The metadata table is unaliased in these queries, so the Bayesian rating
	// expression addresses its columns as `book_metadata.*` (ebook-only).
	private catalogOrderBy(
		sort: "recent" | "title" | "author" | "rating",
		serverId: string,
		mediaType: "ebook" | "audiobook",
	): SQL {
		const md = this.metadataFor(mediaType);
		// Primary author name, for the "author" sort. Audiobooks and ebooks keep
		// their author links in separate join tables. Books without an author sort
		// last (NULLS LAST).
		const authorLinkTable =
			mediaType === "audiobook" ? sql`audiobook_author` : sql`book_author`;
		const authorOrder = sql`(
			SELECT a.name
			FROM ${authorLinkTable} ba
			INNER JOIN author a ON a.id = ba.author_id
			WHERE ba.book_id = ${book.id}
			ORDER BY a.name ASC
			LIMIT 1
		) ASC NULLS LAST`;
		return sort === "title"
			? sql`COALESCE(${md.title}, ${book.filename}) ASC`
			: sort === "author"
				? authorOrder
				: // Rating is ebook-only; audiobooks coerce a stale "rating" sort to recent.
					sort === "rating" && mediaType === "ebook"
					? sql`${bayesianRatingSql("book_metadata", serverId)} DESC NULLS LAST, ${desc(book.createdAt)}`
					: (desc(book.createdAt) as SQL);
	}

	// Predicate for a server-wide catalog of one media type, scoped to the
	// caller's accessible libraries and optionally filtered by title/filename and
	// minimum rating. Mirrors libraryBooksWhere but selects by media type across
	// all libraries instead of one library id.
	private catalogBooksWhere(
		serverId: string,
		scope: LibraryScope | undefined,
		mediaType: "ebook" | "audiobook",
		query?: string,
		minRating?: number,
	): SQL {
		const md = this.metadataFor(mediaType);
		const conditions: (SQL | undefined)[] = [
			eq(library.mediaType, mediaType),
			eq(library.serverId, serverId),
			isNull(book.duplicateOfBookId),
			accessibleCondition(scope),
		];
		const trimmed = query?.trim();
		if (trimmed) {
			const pattern = `%${trimmed}%`;
			conditions.push(
				or(ilike(md.title, pattern), ilike(book.filename, pattern)) as SQL,
			);
		}
		// Rating is an ebook-only facet (audiobook_metadata has no amazonRating).
		if (minRating != null && mediaType === "ebook") {
			conditions.push(sql`${bookMetadata.amazonRating} >= ${minRating}`);
		}
		return and(...conditions.filter((c): c is SQL => c !== undefined)) as SQL;
	}

	async listAllBooks(
		serverId: string,
		scope: LibraryScope | undefined,
		{
			mediaType,
			limit,
			offset,
			sort,
			query,
			minRating,
		}: {
			mediaType: "ebook" | "audiobook";
			limit: number;
			offset: number;
			sort: "recent" | "title" | "author" | "rating";
			query?: string;
			minRating?: number;
		},
	) {
		const md = this.metadataFor(mediaType);
		const rows = await db
			.select({
				bookId: book.id,
				uuid: book.uuid,
				filename: book.filename,
				title: md.title,
				cover: md.cover,
				mainColor: md.mainColor,
				publishedDate: md.publishedDate,
			})
			.from(book)
			.innerJoin(library, eq(library.id, book.libraryId))
			.leftJoin(md, eq(md.bookId, book.id))
			.where(
				this.catalogBooksWhere(serverId, scope, mediaType, query, minRating),
			)
			.orderBy(this.catalogOrderBy(sort, serverId, mediaType))
			.limit(limit)
			.offset(offset);

		const authorsMap =
			mediaType === "audiobook"
				? await batchLoaderRepository.loadAudiobookAuthors(
						rows.map((r) => r.bookId),
					)
				: await batchLoaderRepository.loadEbookAuthors(
						rows.map((r) => r.bookId),
					);

		return rows.map((row) => ({
			uuid: row.uuid,
			filename: row.filename,
			title: row.title ?? row.filename,
			cover: row.cover,
			mainColor: row.mainColor,
			publishedDate: row.publishedDate,
			authors: authorsMap.get(Number(row.bookId)) ?? [],
		}));
	}

	async countAllBooks(
		serverId: string,
		scope: LibraryScope | undefined,
		{
			mediaType,
			query,
			minRating,
		}: {
			mediaType: "ebook" | "audiobook";
			query?: string;
			minRating?: number;
		},
	) {
		const md = this.metadataFor(mediaType);
		const [row] = await db
			.select({ count: sql<number>`count(*)::int` })
			.from(book)
			.innerJoin(library, eq(library.id, book.libraryId))
			.leftJoin(md, eq(md.bookId, book.id))
			.where(
				this.catalogBooksWhere(serverId, scope, mediaType, query, minRating),
			)
			.limit(1);
		return row?.count ?? 0;
	}

	async listByLibraryId(
		libraryId: number,
		serverId: string,
		scope: LibraryScope | undefined,
		{
			mediaType,
			limit,
			offset,
			sort,
			query,
			minRating,
			genres,
			year,
		}: {
			mediaType: "ebook" | "audiobook";
			limit: number;
			offset: number;
			sort: "recent" | "title" | "author" | "rating";
			query?: string;
			minRating?: number;
			genres?: string[];
			year?: number;
		},
	) {
		const md = this.metadataFor(mediaType);
		const orderBy = this.catalogOrderBy(sort, serverId, mediaType);

		const rows = await db
			.select({
				bookId: book.id,
				uuid: book.uuid,
				filename: book.filename,
				title: md.title,
				cover: md.cover,
				mainColor: md.mainColor,
				publishedDate: md.publishedDate,
			})
			.from(book)
			.innerJoin(library, eq(library.id, book.libraryId))
			.leftJoin(md, eq(md.bookId, book.id))
			.where(
				this.libraryBooksWhere(
					libraryId,
					serverId,
					mediaType,
					scope,
					query,
					minRating,
					genres,
					year,
				),
			)
			.orderBy(orderBy)
			.limit(limit)
			.offset(offset);

		const authorsMap =
			mediaType === "audiobook"
				? await batchLoaderRepository.loadAudiobookAuthors(
						rows.map((r) => r.bookId),
					)
				: await batchLoaderRepository.loadEbookAuthors(
						rows.map((r) => r.bookId),
					);

		return rows.map((row) => ({
			uuid: row.uuid,
			filename: row.filename,
			title: row.title ?? row.filename,
			cover: row.cover,
			mainColor: row.mainColor,
			publishedDate: row.publishedDate,
			authors: authorsMap.get(Number(row.bookId)) ?? [],
		}));
	}

	async countByLibraryId(
		libraryId: number,
		serverId: string,
		mediaType: "ebook" | "audiobook",
		scope?: LibraryScope,
		filters?: {
			query?: string;
			minRating?: number;
			genres?: string[];
			year?: number;
		},
	) {
		const md = this.metadataFor(mediaType);
		const [row] = await db
			.select({ count: sql<number>`count(*)::int` })
			.from(book)
			.innerJoin(library, eq(library.id, book.libraryId))
			.leftJoin(md, eq(md.bookId, book.id))
			.where(
				this.libraryBooksWhere(
					libraryId,
					serverId,
					mediaType,
					scope,
					filters?.query,
					filters?.minRating,
					filters?.genres,
					filters?.year,
				),
			)
			.limit(1);
		return row?.count ?? 0;
	}

	// Filter options present in a library: distinct genre names (from either the
	// ebook or audiobook join table) and distinct publication years (desc).
	async getLibraryFacets(
		libraryId: number,
		serverId: string,
		mediaType: "ebook" | "audiobook",
		scope?: LibraryScope,
	): Promise<{ genres: string[]; years: number[] }> {
		const where = this.libraryBooksWhere(libraryId, serverId, mediaType, scope);
		// Years come from whichever metadata table backs this library's media type.
		const metadataTable =
			mediaType === "audiobook" ? sql`audiobook_metadata` : sql`book_metadata`;

		const genreResult = await db.execute(sql`
			WITH visible_books AS (
				SELECT book.id
				FROM book
				INNER JOIN library ON library.id = book.library_id
				WHERE ${where}
			)
			SELECT DISTINCT name
			FROM (
				SELECT g.name
				FROM visible_books vb
				INNER JOIN book_genre bg ON bg.book_id = vb.id
				INNER JOIN genre g ON g.id = bg.genre_id AND g.server_id = ${serverId}
				UNION
				SELECT g.name
				FROM visible_books vb
				INNER JOIN audiobook_genre ag ON ag.book_id = vb.id
				INNER JOIN genre g ON g.id = ag.genre_id AND g.server_id = ${serverId}
			) library_genres
			ORDER BY name ASC
		`);

		const yearResult = await db.execute(sql`
			WITH visible_books AS (
				SELECT book.id
				FROM book
				INNER JOIN library ON library.id = book.library_id
				WHERE ${where}
			)
			SELECT DISTINCT EXTRACT(YEAR FROM md.published_date)::int AS year
			FROM visible_books vb
			INNER JOIN ${metadataTable} md ON md.book_id = vb.id
			WHERE md.published_date IS NOT NULL
			ORDER BY year DESC
		`);

		return {
			genres: (genreResult.rows as { name: string }[]).map((r) => r.name),
			years: (yearResult.rows as { year: number }[]).map((r) => r.year),
		};
	}

	// ── Duplicate grouping ──────────────────────────────────────────────────

	/** Fields needed to recompute a book's duplicate group (with its metadata). */
	async getGroupingInfo(bookId: number) {
		const [row] = await db
			.select({
				libraryId: book.libraryId,
				groupLocked: book.groupLocked,
				title: bookMetadata.title,
				titleRomaji: bookMetadata.titleRomaji,
				isbn13: bookMetadata.isbn13,
				isbn10: bookMetadata.isbn10,
				asin: bookMetadata.asin,
			})
			.from(book)
			.leftJoin(bookMetadata, eq(bookMetadata.bookId, book.id))
			.where(eq(book.id, bookId))
			.limit(1);
		return row ?? null;
	}

	// Non-locked books in the library matching any identifier: a normalized
	// ISBN-13/10, or an ASIN (Kindle-only editions carry no ISBN).
	async findGroupingCandidates(
		libraryId: number,
		ids: { isbns: string[]; asins: string[] },
	) {
		const matchers: SQL[] = [];
		if (ids.isbns.length > 0) {
			const isbnList = sql.join(
				ids.isbns.map((v) => sql`${v}`),
				sql`, `,
			);
			matchers.push(sql`${normIsbnSql(bookMetadata.isbn13)} IN (${isbnList})`);
			matchers.push(sql`${normIsbnSql(bookMetadata.isbn10)} IN (${isbnList})`);
		}
		if (ids.asins.length > 0) {
			const asinList = sql.join(
				ids.asins.map((v) => sql`${v}`),
				sql`, `,
			);
			matchers.push(
				sql`upper(trim(coalesce(${bookMetadata.asin}, ''))) IN (${asinList})`,
			);
		}
		return db
			.select({
				id: book.id,
				filesizeKb: book.filesizeKb,
				duplicateOfBookId: book.duplicateOfBookId,
				title: bookMetadata.title,
				titleRomaji: bookMetadata.titleRomaji,
			})
			.from(book)
			.leftJoin(bookMetadata, eq(bookMetadata.bookId, book.id))
			.where(
				and(
					eq(book.libraryId, libraryId),
					eq(book.groupLocked, false),
					or(...matchers),
				),
			);
	}

	/** Re-expose a book as its own canonical (only if it currently points at one). */
	async clearDuplicatePointerIfSet(bookId: number): Promise<void> {
		await db
			.update(book)
			.set({ duplicateOfBookId: null })
			.where(and(eq(book.id, bookId), isNotNull(book.duplicateOfBookId)));
	}

	async clearDuplicatePointers(ids: number[]): Promise<void> {
		if (ids.length === 0) return;
		await db
			.update(book)
			.set({ duplicateOfBookId: null })
			.where(inArray(book.id, ids));
	}

	async setDuplicateOf(ids: number[], canonicalId: number): Promise<void> {
		if (ids.length === 0) return;
		await db
			.update(book)
			.set({ duplicateOfBookId: canonicalId })
			.where(inArray(book.id, ids));
	}

	/** Non-locked members currently hidden behind a canonical. */
	async listHiddenMembers(canonicalId: number) {
		return db
			.select({ id: book.id, uuid: book.uuid, filesizeKb: book.filesizeKb })
			.from(book)
			.where(
				and(
					eq(book.duplicateOfBookId, canonicalId),
					eq(book.groupLocked, false),
				),
			);
	}

	async listByIdsWithSize(ids: number[]) {
		return db
			.select({ id: book.id, filesizeKb: book.filesizeKb })
			.from(book)
			.where(inArray(book.id, ids));
	}

	/** Selected books plus any books already hidden behind them (avoids nested chains). */
	async listGroupMemberIds(ids: number[]) {
		return db
			.select({ id: book.id })
			.from(book)
			.where(or(inArray(book.id, ids), inArray(book.duplicateOfBookId, ids)));
	}

	/** Mark as its own canonical and lock it against re-merging. */
	async lockAsCanonical(bookId: number): Promise<void> {
		await db
			.update(book)
			.set({ duplicateOfBookId: null, groupLocked: true })
			.where(eq(book.id, bookId));
	}

	async lockAsHidden(ids: number[], canonicalId: number): Promise<void> {
		if (ids.length === 0) return;
		await db
			.update(book)
			.set({ duplicateOfBookId: canonicalId, groupLocked: true })
			.where(inArray(book.id, ids));
	}

	async getUuid(bookId: number): Promise<string | null> {
		const [row] = await db
			.select({ uuid: book.uuid })
			.from(book)
			.where(eq(book.id, bookId))
			.limit(1);
		return row?.uuid ?? null;
	}
}
export const bookRepository = new BookRepository();
