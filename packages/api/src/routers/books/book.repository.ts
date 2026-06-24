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
import {
	and,
	asc,
	desc,
	eq,
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
	publisher: { name: string } | null;
	series: { name: string; position: number | null } | null;
	authors: Array<{
		id: number;
		name: string;
		role: string | null;
		provider: string | null;
	}>;
	genres: string[] | null;
};

type SiblingRow = {
	id: number;
	uuid: string;
	filename: string;
	mediaType: string | null;
	filesizeKb: number | null;
	isCanonical: boolean;
};

type SeriesNameRow = {
	uuid: string;
	filename: string;
	title: string | null;
	cover: string | null;
	mainColor: string | null;
	position: number | null;
};

type GenreNameRow = {
	uuid: string;
	filename: string;
	title: string | null;
	cover: string | null;
	mainColor: string | null;
};

export class BookRepository {
	async create(input: CreateBookInput): Promise<Book | undefined> {
		const [inserted] = await db
			.insert(book)
			.values(input)
			.onConflictDoNothing({ target: [book.libraryId, book.filehash] })
			.returning();
		return inserted;
	}

	/**
	 * Updates the file-derived fields of a book whose file changed on disk.
	 * Returns false if the book no longer exists or the new filehash collides
	 * with another book in the library (the file became a duplicate).
	 */
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

	/**
	 * Resolves the organization a book belongs to (via its library), without
	 * scoping to any active organization. Used to recover the correct org when a
	 * user lands on a book URL that lives outside their currently active org.
	 */
	async getOrganizationId(uuid: string): Promise<string | null> {
		const [result] = await db
			.select({ organizationId: library.organizationId })
			.from(book)
			.innerJoin(library, eq(library.id, book.libraryId))
			.where(eq(book.uuid, uuid))
			.limit(1);
		return result?.organizationId ?? null;
	}

	async getByUuid(
		uuid: string,
		organizationId?: string,
		scope?: LibraryScope,
	): Promise<Book | null> {
		if (organizationId) {
			const [result] = await db
				.select()
				.from(book)
				.innerJoin(library, eq(library.id, book.libraryId))
				.where(
					and(
						eq(book.uuid, uuid),
						eq(library.organizationId, organizationId),
						accessibleCondition(scope),
					),
				)
				.limit(1);

			return result?.book ?? null;
		}

		const [result] = await db.select().from(book).where(eq(book.uuid, uuid));
		return result ?? null;
	}

	async getWithMetadata(
		uuid: string,
		organizationId?: string,
		scope?: LibraryScope,
	) {
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
			WHERE b.uuid = ${uuid} ${organizationId ? sql`AND l.organization_id = ${organizationId}` : sql``} ${accessibleSql(scope)}
			GROUP BY b.id, l.media_type, bm.book_id, p.id, s.id, bs.position
			LIMIT 1
		`);

		const row = result.rows[0] as WithMetadataRow | undefined;
		if (!row) return null;

		// Group siblings: anchor on the canonical (this book's duplicate target,
		// or itself when canonical). Lists the other physical copies/formats so
		// the detail page can offer them for download. Unfiltered queries above
		// keep direct URLs to hidden copies resolving.
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
			id: a.id,
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

	async listRecent(limit = 20, organizationId?: string, scope?: LibraryScope) {
		const conditions = [
			eq(library.mediaType, "ebook"),
			isNull(book.duplicateOfBookId),
		];
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

	async listRandom(limit = 15, organizationId?: string, scope?: LibraryScope) {
		const conditions = [
			eq(library.mediaType, "ebook"),
			isNull(book.duplicateOfBookId),
		];
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
		organizationId: string,
		orderBy: SQL,
		limit: number,
		offset: number,
		scope?: LibraryScope,
	) {
		const rows = await this.catalogBaseQuery()
			.where(
				and(
					eq(library.organizationId, organizationId),
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
		scope?: LibraryScope,
	) {
		const rows = await this.catalogBaseQuery()
			.innerJoin(bookAuthor, eq(bookAuthor.bookId, book.id))
			.where(
				and(
					eq(library.organizationId, organizationId),
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
					eq(library.organizationId, organizationId),
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

	/**
	 * Resolves which of the given relative paths already have a book in the
	 * library. Used by dedupe to pick the canonical copy (the one with a book).
	 */
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
			// THIS REMOVES ALSO
			// - bookMetadata (cascade)
			// - bookAuthor (cascade)
			// - likedBook (cascade)
			// - collectionBook (cascade)

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

	async listBySeriesName(
		seriesName: string,
		organizationId?: string,
		scope?: LibraryScope,
	) {
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
			AND b.duplicate_of_book_id IS NULL
			${organizationId ? sql`AND l.organization_id = ${organizationId}` : sql``} ${accessibleSql(scope)}
			ORDER BY bs.position ASC NULLS LAST, bm.title ASC
		`);

		const rows = result.rows as SeriesNameRow[];
		return rows.map((row) => ({
			uuid: row.uuid,
			filename: row.filename,
			title: row.title ?? row.filename,
			cover: row.cover,
			mainColor: row.mainColor,
			position: row.position,
		}));
	}

	async listByGenreName(
		genreName: string,
		organizationId?: string,
		scope?: LibraryScope,
	) {
		const result = await db.execute(sql`
			SELECT
				b.uuid, b.filename,
				bm.title, bm.cover, bm.main_color AS "mainColor"
			FROM book b
			INNER JOIN library l ON l.id = b.library_id
			INNER JOIN book_metadata bm ON bm.book_id = b.id
			INNER JOIN book_genre bg ON bg.book_id = bm.book_id
			INNER JOIN genre g ON g.id = bg.genre_id
			WHERE g.name = ${genreName}
			AND b.duplicate_of_book_id IS NULL
			${organizationId ? sql`AND l.organization_id = ${organizationId}` : sql``} ${accessibleSql(scope)}
			ORDER BY bm.title ASC
		`);

		const rows = result.rows as GenreNameRow[];
		return rows.map((row) => ({
			uuid: row.uuid,
			filename: row.filename,
			title: row.title ?? row.filename,
			cover: row.cover,
			mainColor: row.mainColor,
		}));
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
			})
			.from(book)
			.leftJoin(bookMetadata, eq(bookMetadata.bookId, book.id))
			.where(eq(book.id, bookId))
			.limit(1);
		return row ?? null;
	}

	/** Non-locked books in the library whose normalized ISBN-13/10 matches any given one. */
	async findGroupingCandidatesByIsbn(libraryId: number, isbns: string[]) {
		const isbnList = sql.join(
			isbns.map((v) => sql`${v}`),
			sql`, `,
		);
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
					or(
						sql`${normIsbnSql(bookMetadata.isbn13)} IN (${isbnList})`,
						sql`${normIsbnSql(bookMetadata.isbn10)} IN (${isbnList})`,
					),
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
