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
	eq,
	gt,
	inArray,
	isNotNull,
	isNull,
	notLike,
	or,
	type SQL,
	type SQLWrapper,
	sql,
} from "drizzle-orm";
import { logger } from "../../lib/logger";
import { batchLoaderRepository } from "../_shared/batch-loaders";
import {
	accessibleCondition,
	accessibleSql,
	type LibraryScope,
	visibleBookSql,
} from "../_shared/library-scope";
import { bayesianRatingSql } from "../_shared/rating";
import { withSerialScan } from "../_shared/serial-scan";
import type { Book, CreateBookInput } from "./book.model";

export type { LibraryScope };

const log = logger.child({ component: "book-repository" });

// book_created_at_idx is DESC NULLS LAST; drizzle's desc() emits plain DESC
// (= NULLS FIRST), which the index cannot serve — every recency sort must use
// this expression or Postgres sorts the whole catalog per query.
export const bookCreatedAtDesc = sql`${book.createdAt} DESC NULLS LAST`;

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
	lockedFields: string[] | null;
	publisher: { uuid: string; name: string } | null;
	series: { uuid: string; name: string; position: number | null } | null;
	authors: Array<{
		uuid: string;
		name: string;
		role: string | null;
		provider: string | null;
	}>;
	genres: Array<{ uuid: string; name: string }> | null;
	tags: Array<{ uuid: string; name: string }> | null;
	siblings: SiblingRow[];
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

type MixedEntityBookRow = EntityBookRow & {
	mediaType: "ebook" | "audiobook";
};

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

	async getByUuidAndMediaType(
		uuid: string,
		mediaType: "ebook" | "audiobook",
		serverId?: string,
		scope?: LibraryScope,
	): Promise<Book | null> {
		const [result] = await db
			.select()
			.from(book)
			.innerJoin(library, eq(library.id, book.libraryId))
			.where(
				and(
					eq(book.uuid, uuid),
					eq(library.mediaType, mediaType),
					...(serverId ? [eq(library.serverId, serverId)] : []),
					accessibleCondition(scope),
				),
			)
			.limit(1);

		return result?.book ?? null;
	}

	async getWithMetadata(uuid: string, serverId?: string, scope?: LibraryScope) {
		// One flat row + correlated jsonb subqueries: the previous 7-join GROUP BY
		// shape spent ~5ms per call in planning alone and needed a second round
		// trip for siblings.
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
				bm.locked_fields AS "lockedFields",
				(
					SELECT jsonb_build_object('uuid', p.uuid, 'name', p.name)
					FROM publisher p
					WHERE p.id = bm.publisher_id
				) AS publisher,
				(
					SELECT jsonb_build_object('uuid', s.uuid, 'name', s.name, 'position', bs.position)
					FROM book_series bs
					INNER JOIN series s ON s.id = bs.series_id
					WHERE bs.book_id = b.id
					ORDER BY bs.position ASC NULLS LAST
					LIMIT 1
				) AS series,
				(
					SELECT COALESCE(
						jsonb_agg(jsonb_build_object('uuid', a.uuid, 'name', a.name, 'role', ba.role, 'provider', a.provider) ORDER BY a.name),
						'[]'
					)
					FROM book_author ba
					INNER JOIN author a ON a.id = ba.author_id
					WHERE ba.book_id = b.id
				) AS authors,
				(
					SELECT COALESCE(
						jsonb_agg(jsonb_build_object('uuid', g.uuid, 'name', g.name) ORDER BY g.name),
						'[]'
					)
					FROM book_genre bg
					INNER JOIN genre g ON g.id = bg.genre_id
					WHERE bg.book_id = b.id
				) AS genres,
				(
					SELECT COALESCE(
						jsonb_agg(jsonb_build_object('uuid', t.uuid, 'name', t.name) ORDER BY t.name),
						'[]'
					)
					FROM book_tag bt
					INNER JOIN tag t ON t.id = bt.tag_id
					WHERE bt.book_id = b.id
				) AS tags,
				(
					SELECT COALESCE(
						jsonb_agg(
							jsonb_build_object(
								'id', b2.id, 'uuid', b2.uuid, 'filename', b2.filename,
								'mediaType', b2.media_type, 'filesizeKb', b2.filesize_kb,
								'isCanonical', b2.duplicate_of_book_id IS NULL
							)
							ORDER BY b2.filesize_kb DESC NULLS LAST, b2.id ASC
						),
						'[]'
					)
					FROM book b2
					WHERE b2.duplicate_of_book_id = COALESCE(b.duplicate_of_book_id, b.id)
						OR b2.id = COALESCE(b.duplicate_of_book_id, b.id)
				) AS siblings
			FROM book b
			INNER JOIN library l ON l.id = b.library_id
			LEFT JOIN book_metadata bm ON bm.book_id = b.id
			WHERE b.uuid = ${uuid} ${serverId ? sql`AND l.server_id = ${serverId}` : sql``} ${accessibleSql(scope)}
			LIMIT 1
		`);

		const row = result.rows[0] as WithMetadataRow | undefined;
		if (!row) return null;

		// Siblings group around the canonical (duplicate target, or self): lists the
		// other copies/formats for download. The unfiltered subquery keeps direct
		// URLs to hidden copies resolving.
		const bookId = row.id;
		const duplicateOfBookId = row.duplicate_of_book_id;
		const siblings = row.siblings;
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
			lockedFields: row.lockedFields ?? [],
			publisher: publisherObj,
			series: seriesObj,
			authors,
			genres: row.genres ?? [],
			tags: row.tags ?? [],
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
			.orderBy(bookCreatedAtDesc)
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
			.orderBy(bookCreatedAtDesc)
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

	// Scoped by serverId (via a book in one of the server's libraries) so the
	// display name of an author/series from another tenant can't be enumerated.
	async getAuthorName(
		authorId: number,
		serverId: string,
	): Promise<string | null> {
		const [row] = await db
			.select({ name: author.name })
			.from(author)
			.innerJoin(bookAuthor, eq(bookAuthor.authorId, author.id))
			.innerJoin(book, eq(book.id, bookAuthor.bookId))
			.innerJoin(library, eq(library.id, book.libraryId))
			.where(and(eq(author.id, authorId), eq(library.serverId, serverId)))
			.limit(1);
		return row?.name ?? null;
	}

	async getSeriesName(
		seriesId: number,
		serverId: string,
	): Promise<string | null> {
		const [row] = await db
			.select({ name: series.name })
			.from(series)
			.innerJoin(bookSeries, eq(bookSeries.seriesId, series.id))
			.innerJoin(book, eq(book.id, bookSeries.bookId))
			.innerJoin(library, eq(library.id, book.libraryId))
			.where(and(eq(series.id, seriesId), eq(library.serverId, serverId)))
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

	// Same as withAuthors but for mixed ebook/audiobook rows: each media type
	// keeps its author links in its own join table.
	private async withAuthorsMixed<
		T extends EntityBookRow & { mediaType: "ebook" | "audiobook" },
	>(rows: T[]) {
		const [ebookAuthors, audiobookAuthors] = await Promise.all([
			batchLoaderRepository.loadEbookAuthors(
				rows.filter((r) => r.mediaType === "ebook").map((r) => Number(r.id)),
			),
			batchLoaderRepository.loadAudiobookAuthors(
				rows
					.filter((r) => r.mediaType === "audiobook")
					.map((r) => Number(r.id)),
			),
		]);
		return rows.map((row) => ({
			uuid: row.uuid,
			filename: row.filename,
			title: row.title ?? row.filename,
			cover: row.cover,
			mainColor: row.mainColor,
			publishedDate: row.publishedDate,
			mediaType: row.mediaType,
			authors:
				(row.mediaType === "audiobook"
					? audiobookAuthors.get(Number(row.id))
					: ebookAuthors.get(Number(row.id))) ?? [],
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

	// Ebooks and audiobooks carrying the entity, each row tagged with its media
	// type so the UI can facet by format (never an undifferentiated mix).
	private async listMixedByEntityUuid(
		linkSql: (mediaType: "ebook" | "audiobook") => SQL,
		uuid: string,
		serverId: string,
		scope?: LibraryScope,
	) {
		const branch = (mediaType: "ebook" | "audiobook") => {
			const md =
				mediaType === "audiobook"
					? sql`audiobook_metadata`
					: sql`book_metadata`;
			return sql`
				SELECT
					b.id, b.uuid, b.filename,
					md.title, md.cover, md.main_color AS "mainColor",
					md.published_date AS "publishedDate",
					${mediaType === "audiobook" ? sql`'audiobook'` : sql`'ebook'`} AS "mediaType"
				FROM book b
				INNER JOIN library l ON l.id = b.library_id
				INNER JOIN ${md} md ON md.book_id = b.id
				${linkSql(mediaType)}
				WHERE e.uuid = ${uuid}
				AND b.duplicate_of_book_id IS NULL
				${serverId ? sql`AND l.server_id = ${serverId}` : sql``} ${accessibleSql(scope)}`;
		};

		const result = await db.execute(sql`
			${branch("ebook")}
			UNION ALL
			${branch("audiobook")}
			ORDER BY title ASC
		`);

		const rows = result.rows as MixedEntityBookRow[];
		return this.withAuthorsMixed(rows);
	}

	async listByGenreUuid(
		genreUuid: string,
		serverId: string,
		scope?: LibraryScope,
	) {
		return this.listMixedByEntityUuid(
			(mediaType) =>
				mediaType === "audiobook"
					? sql`INNER JOIN audiobook_genre ag ON ag.book_id = md.book_id
						INNER JOIN genre e ON e.id = ag.genre_id`
					: sql`INNER JOIN book_genre bg ON bg.book_id = md.book_id
						INNER JOIN genre e ON e.id = bg.genre_id`,
			genreUuid,
			serverId,
			scope,
		);
	}

	async listByTagUuid(tagUuid: string, serverId: string, scope?: LibraryScope) {
		return this.listMixedByEntityUuid(
			(mediaType) =>
				mediaType === "audiobook"
					? sql`INNER JOIN audiobook_tag at ON at.book_id = md.book_id
						INNER JOIN tag e ON e.id = at.tag_id`
					: sql`INNER JOIN book_tag bt ON bt.book_id = md.book_id
						INNER JOIN tag e ON e.id = bt.tag_id`,
			tagUuid,
			serverId,
			scope,
		);
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
		tags?: string[],
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
			conditions.push(this.quickSearchSql(`%${trimmed}%`, mediaType));
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
		if (tags && tags.length > 0) {
			const names = sql.join(
				tags.map((name) => sql`${name}`),
				sql`, `,
			);
			conditions.push(sql`EXISTS (
				SELECT 1 FROM tag t
				WHERE t.server_id = ${serverId}
					AND t.name IN (${names})
					AND (
						EXISTS (SELECT 1 FROM book_tag bt WHERE bt.book_id = ${book.id} AND bt.tag_id = t.id)
						OR EXISTS (SELECT 1 FROM audiobook_tag at WHERE at.book_id = ${book.id} AND at.tag_id = t.id)
					)
			)`);
		}
		if (year != null) {
			conditions.push(sql`EXTRACT(YEAR FROM ${md.publishedDate}) = ${year}`);
		}
		return and(...conditions.filter((c): c is SQL => c !== undefined)) as SQL;
	}

	// Shared ORDER BY for the paginated book grids (library + server catalog).
	// Runs inside orderedCatalogIds, where the metadata tables are unaliased
	// (the Bayesian rating addresses `book_metadata.*`) and the "author" sort
	// can reference the aggregated `pa` join.
	private catalogOrderBy(
		sort: "recent" | "title" | "author" | "rating",
		serverId: string,
		mediaType: "ebook" | "audiobook" | "all",
	): SQL {
		const titleExpr =
			mediaType === "all"
				? this.catalogTitleExpr
				: this.metadataFor(mediaType).title;
		return sort === "title"
			? sql`COALESCE(${titleExpr}, ${book.filename}) ASC`
			: sort === "author"
				? // Primary author name from the `pa` aggregate (see
					// primaryAuthorJoin). Books without an author sort last.
					sql`pa.name ASC NULLS LAST, ${book.id} ASC`
				: // Rating is ebook-only; audiobook-only catalogs coerce a stale
					// "rating" sort to recent. In the mixed catalog audiobooks have no
					// rating and sink to the recency tail via NULLS LAST.
					sort === "rating" && mediaType !== "audiobook"
					? sql`${bayesianRatingSql("book_metadata", serverId)} DESC NULLS LAST, ${bookCreatedAtDesc}`
					: bookCreatedAtDesc;
	}

	// Aggregated primary-author name per book (MIN = first alphabetically,
	// matching the old per-row `ORDER BY a.name LIMIT 1` subquery). One hash
	// aggregate over the link table beats re-running that subquery for every
	// sorted row (~38k times per catalog page at prod scale).
	private primaryAuthorJoin(mediaType: "ebook" | "audiobook" | "all"): SQL {
		const ebook = sql`SELECT ba.book_id, a.name FROM book_author ba INNER JOIN author a ON a.id = ba.author_id`;
		const audio = sql`SELECT aa.book_id, a.name FROM audiobook_author aa INNER JOIN author a ON a.id = aa.author_id`;
		const links =
			mediaType === "all"
				? sql`${ebook} UNION ALL ${audio}`
				: mediaType === "audiobook"
					? audio
					: ebook;
		return sql`LEFT JOIN (
			SELECT book_id, MIN(name) AS name FROM (${links}) links GROUP BY book_id
		) pa ON pa.book_id = ${book.id}`;
	}

	// Executes a catalog id-page query; `serial` (quick-search present) keeps
	// PGroonga scans out of parallel workers (see withSerialScan).
	private async runCatalogIds(serial: boolean, query: SQL): Promise<number[]> {
		const result = serial
			? await withSerialScan((tx) => tx.execute(query))
			: await db.execute(query);
		return result.rows.map((r) => Number((r as { id: number }).id));
	}

	// Resolves one page of catalog book ids in display order. Sorting happens
	// over ids + sort keys only; callers hydrate the page afterwards, so display
	// columns never travel through a 40k-row sort. Title and rating sorts get
	// per-branch queries that walk their backing index instead of sorting the
	// whole catalog.
	private async orderedCatalogIds(
		where: SQL,
		sort: "recent" | "title" | "author" | "rating",
		serverId: string,
		mediaType: "ebook" | "audiobook" | "all",
		limit: number,
		offset: number,
		serial: boolean,
	): Promise<number[]> {
		if (sort === "title") {
			return this.titleOrderedIds(where, mediaType, limit, offset, serial);
		}
		if (sort === "rating" && mediaType !== "audiobook") {
			return this.ratingOrderedIds(where, serverId, limit, offset, serial);
		}
		return this.runCatalogIds(
			serial,
			sql`
			SELECT ${book.id} AS id
			FROM ${book}
			INNER JOIN ${library} ON ${library.id} = ${book.libraryId}
			LEFT JOIN ${bookMetadata} ON ${bookMetadata.bookId} = ${book.id}
			LEFT JOIN ${audiobookMetadata} ON ${audiobookMetadata.bookId} = ${book.id}
			${sort === "author" ? this.primaryAuthorJoin(mediaType) : sql``}
			WHERE ${where}
			ORDER BY ${this.catalogOrderBy(sort, serverId, mediaType)}
			LIMIT ${limit} OFFSET ${offset}
		`,
		);
	}

	// Title sort as a union of per-metadata-table branches: each branch drives
	// its own title btree index and stops after limit+offset rows, so nothing
	// sorts the full catalog. Untitled books (NULL title or no metadata row)
	// sort to the tail. The outer ORDER BY repeats the branch ordering, which
	// makes the per-branch LIMIT safe for pagination.
	private async titleOrderedIds(
		where: SQL,
		mediaType: "ebook" | "audiobook" | "all",
		limit: number,
		offset: number,
		serial: boolean,
	): Promise<number[]> {
		const reach = limit + offset;
		const branches: SQL[] = [];
		if (mediaType !== "audiobook") {
			branches.push(sql`(
				SELECT ${book.id} AS id, ${bookMetadata.title} AS sort_title
				FROM ${bookMetadata}
				INNER JOIN ${book} ON ${book.id} = ${bookMetadata.bookId}
				INNER JOIN ${library} ON ${library.id} = ${book.libraryId}
				LEFT JOIN ${audiobookMetadata} ON ${audiobookMetadata.bookId} = ${book.id}
				WHERE ${where}
				ORDER BY ${bookMetadata.title} ASC NULLS LAST, ${book.id} ASC
				LIMIT ${reach}
			)`);
		}
		if (mediaType !== "ebook") {
			branches.push(sql`(
				SELECT ${book.id} AS id, ${audiobookMetadata.title} AS sort_title
				FROM ${audiobookMetadata}
				INNER JOIN ${book} ON ${book.id} = ${audiobookMetadata.bookId}
				INNER JOIN ${library} ON ${library.id} = ${book.libraryId}
				LEFT JOIN ${bookMetadata} ON ${bookMetadata.bookId} = ${book.id}
				WHERE ${where}
				ORDER BY ${audiobookMetadata.title} ASC NULLS LAST, ${book.id} ASC
				LIMIT ${reach}
			)`);
		}
		const page = (extra?: SQL) => sql`
			SELECT id FROM (${sql.join(extra ? [...branches, extra] : branches, sql` UNION ALL `)}) u
			ORDER BY sort_title ASC NULLS LAST, id ASC
			LIMIT ${limit} OFFSET ${offset}
		`;
		// Fast path: metadata-backed branches only. Books with no metadata row at
		// all sort after every titled one, so a full page needs no stragglers scan
		// — the anti-join below costs a whole-catalog pass and virtually never
		// contributes (the scanner always creates the metadata row).
		const ids = await this.runCatalogIds(serial, page());
		if (ids.length === limit) return ids;
		return this.runCatalogIds(
			serial,
			page(sql`(
				SELECT ${book.id} AS id, NULL AS sort_title
				FROM ${book}
				INNER JOIN ${library} ON ${library.id} = ${book.libraryId}
				LEFT JOIN ${bookMetadata} ON ${bookMetadata.bookId} = ${book.id}
				LEFT JOIN ${audiobookMetadata} ON ${audiobookMetadata.bookId} = ${book.id}
				WHERE ${where} AND ${bookMetadata.bookId} IS NULL AND ${audiobookMetadata.bookId} IS NULL
				ORDER BY ${book.id} ASC
				LIMIT ${reach}
			)`),
		);
	}

	// Rating sort split into rated/unrated branches: only rated books (a small
	// or empty set on most servers) pay the Bayesian expression sort; everything
	// else pages straight off the created_at index. Order matches the old
	// single-query `bayes DESC NULLS LAST, created_at DESC` exactly.
	private async ratingOrderedIds(
		where: SQL,
		serverId: string,
		limit: number,
		offset: number,
		serial: boolean,
	): Promise<number[]> {
		const reach = limit + offset;
		return this.runCatalogIds(
			serial,
			sql`
			SELECT id FROM (
				(
					SELECT ${book.id} AS id, ${bayesianRatingSql("book_metadata", serverId)} AS rating_key, ${book.createdAt} AS tiebreak
					FROM ${bookMetadata}
					INNER JOIN ${book} ON ${book.id} = ${bookMetadata.bookId}
					INNER JOIN ${library} ON ${library.id} = ${book.libraryId}
					LEFT JOIN ${audiobookMetadata} ON ${audiobookMetadata.bookId} = ${book.id}
					WHERE ${where} AND ${bookMetadata.amazonRating} IS NOT NULL
					ORDER BY rating_key DESC, tiebreak DESC NULLS LAST, id DESC
					LIMIT ${reach}
				)
				UNION ALL
				(
					SELECT ${book.id} AS id, NULL::float8 AS rating_key, ${book.createdAt} AS tiebreak
					FROM ${book}
					INNER JOIN ${library} ON ${library.id} = ${book.libraryId}
					LEFT JOIN ${bookMetadata} ON ${bookMetadata.bookId} = ${book.id}
					LEFT JOIN ${audiobookMetadata} ON ${audiobookMetadata.bookId} = ${book.id}
					WHERE ${where} AND ${bookMetadata.amazonRating} IS NULL
					ORDER BY tiebreak DESC NULLS LAST, id DESC
					LIMIT ${reach}
				)
			) u
			ORDER BY rating_key DESC NULLS LAST, tiebreak DESC NULLS LAST, id DESC
			LIMIT ${limit} OFFSET ${offset}
		`,
		);
	}

	// Restores the page order computed by orderedCatalogIds after hydration.
	private sortByIdOrder<T>(rows: T[], ids: number[], idOf: (row: T) => number) {
		const pos = new Map(ids.map((id, i) => [id, i]));
		return rows.sort(
			(a, b) => (pos.get(idOf(a)) ?? 0) - (pos.get(idOf(b)) ?? 0),
		);
	}

	// Substring quick-search across titles + filename, written as an id-set
	// union so each branch lands on its own PGroonga index (the (title::text)
	// expression indexes / pgroonga_book_filename). An ILIKE OR over the joined
	// CASE expression seq-scans the whole catalog instead. Queries touching
	// these indexes must run under withSerialScan.
	private quickSearchSql(
		pattern: string,
		mediaType: "ebook" | "audiobook" | "all",
	): SQL {
		const branches: SQL[] = [];
		if (mediaType !== "audiobook") {
			branches.push(
				sql`SELECT bmq.book_id FROM book_metadata bmq WHERE (bmq.title::text) ILIKE ${pattern}`,
			);
		}
		if (mediaType !== "ebook") {
			branches.push(
				sql`SELECT amq.book_id FROM audiobook_metadata amq WHERE (amq.title::text) ILIKE ${pattern}`,
			);
		}
		branches.push(
			sql`SELECT bq.id FROM book bq WHERE bq.filename ILIKE ${pattern}`,
		);
		return sql`${book.id} IN (${sql.join(branches, sql` UNION ALL `)})`;
	}

	// Per-row title for the mixed catalog: audiobook rows read audiobook_metadata,
	// ebook rows book_metadata (requires both tables joined).
	private get catalogTitleExpr(): SQL<string | null> {
		return sql<
			string | null
		>`CASE WHEN ${library.mediaType} = 'audiobook' THEN ${audiobookMetadata.title} ELSE ${bookMetadata.title} END`;
	}

	// Predicate for a server-wide catalog, scoped to the caller's accessible
	// libraries and optionally filtered by title/filename and minimum rating.
	// Mirrors libraryBooksWhere but selects by media type across all libraries
	// instead of one library id; `"all"` skips the media-type filter entirely
	// (both metadata tables are joined in the catalog queries).
	private catalogBooksWhere(
		serverId: string,
		scope: LibraryScope | undefined,
		mediaType: "ebook" | "audiobook" | "all",
		query?: string,
		minRating?: number,
	): SQL {
		const conditions: (SQL | undefined)[] = [
			mediaType === "all" ? undefined : eq(library.mediaType, mediaType),
			eq(library.serverId, serverId),
			isNull(book.duplicateOfBookId),
			accessibleCondition(scope),
		];
		const trimmed = query?.trim();
		if (trimmed) {
			conditions.push(this.quickSearchSql(`%${trimmed}%`, mediaType));
		}
		// Rating is an ebook-only facet (audiobook_metadata has no amazonRating).
		if (minRating != null && mediaType === "ebook") {
			conditions.push(sql`${bookMetadata.amazonRating} >= ${minRating}`);
		}
		return and(...conditions.filter((c): c is SQL => c !== undefined)) as SQL;
	}

	// Catalog select columns resolved per media type. For "all" each column reads
	// the row's own metadata table (both are joined); single-format catalogs read
	// theirs directly.
	private catalogMetadataColumns(mediaType: "ebook" | "audiobook" | "all") {
		if (mediaType !== "all") {
			const md = this.metadataFor(mediaType);
			return {
				title: md.title,
				cover: md.cover,
				mainColor: md.mainColor,
				publishedDate: md.publishedDate,
			};
		}
		const pick = (audioCol: SQLWrapper, ebookCol: SQLWrapper) =>
			sql<
				string | null
			>`CASE WHEN ${library.mediaType} = 'audiobook' THEN ${audioCol} ELSE ${ebookCol} END`;
		return {
			title: this.catalogTitleExpr,
			cover: pick(audiobookMetadata.cover, bookMetadata.cover),
			mainColor: pick(audiobookMetadata.mainColor, bookMetadata.mainColor),
			publishedDate: pick(
				audiobookMetadata.publishedDate,
				bookMetadata.publishedDate,
			),
		};
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
			mediaType: "ebook" | "audiobook" | "all";
			limit: number;
			offset: number;
			sort: "recent" | "title" | "author" | "rating";
			query?: string;
			minRating?: number;
		},
	) {
		const ids = await this.orderedCatalogIds(
			this.catalogBooksWhere(serverId, scope, mediaType, query, minRating),
			sort,
			serverId,
			mediaType,
			limit,
			offset,
			!!query?.trim(),
		);
		if (ids.length === 0) return [];

		const md = this.catalogMetadataColumns(mediaType);
		const rows = this.sortByIdOrder(
			await db
				.select({
					bookId: book.id,
					uuid: book.uuid,
					filename: book.filename,
					mediaType: library.mediaType,
					title: md.title,
					cover: md.cover,
					mainColor: md.mainColor,
					publishedDate: md.publishedDate,
				})
				.from(book)
				.innerJoin(library, eq(library.id, book.libraryId))
				.leftJoin(bookMetadata, eq(bookMetadata.bookId, book.id))
				.leftJoin(audiobookMetadata, eq(audiobookMetadata.bookId, book.id))
				.where(inArray(book.id, ids)),
			ids,
			(r) => Number(r.bookId),
		);

		const [ebookAuthors, audiobookAuthors] = await Promise.all([
			batchLoaderRepository.loadEbookAuthors(
				rows.filter((r) => r.mediaType !== "audiobook").map((r) => r.bookId),
			),
			batchLoaderRepository.loadAudiobookAuthors(
				rows.filter((r) => r.mediaType === "audiobook").map((r) => r.bookId),
			),
		]);

		return rows.map((row) => ({
			uuid: row.uuid,
			filename: row.filename,
			mediaType: row.mediaType,
			title: row.title ?? row.filename,
			cover: row.cover,
			mainColor: row.mainColor,
			publishedDate: row.publishedDate,
			authors:
				(row.mediaType === "audiobook"
					? audiobookAuthors.get(Number(row.bookId))
					: ebookAuthors.get(Number(row.bookId))) ?? [],
		}));
	}

	/**
	 * Whether the server has at least one ebook / audiobook the caller can see.
	 * Uses `EXISTS` (stops at the first matching row) instead of `COUNT(*)`, so it
	 * stays cheap no matter how large the catalog is. Both formats resolve in one
	 * round-trip. Drives which format chips the home dashboard offers.
	 */
	async availableFormats(
		serverId: string,
		scope: LibraryScope | undefined,
	): Promise<{ books: boolean; audiobooks: boolean }> {
		const existsFor = (mediaType: "ebook" | "audiobook") => sql`EXISTS (
			SELECT 1
			FROM book b
			INNER JOIN library l ON l.id = b.library_id
			WHERE l.server_id = ${serverId}
				AND l.media_type = ${mediaType}
				AND ${visibleBookSql("b")}
				${accessibleSql(scope)}
		)`;
		const [row] = (
			await db.execute(sql`
				SELECT
					${existsFor("ebook")} AS "books",
					${existsFor("audiobook")} AS "audiobooks"
			`)
		).rows as Array<{ books: boolean; audiobooks: boolean }>;
		return { books: row?.books ?? false, audiobooks: row?.audiobooks ?? false };
	}

	async countAllBooks(
		serverId: string,
		scope: LibraryScope | undefined,
		{
			mediaType,
			query,
			minRating,
		}: {
			mediaType: "ebook" | "audiobook" | "all";
			query?: string;
			minRating?: number;
		},
	) {
		const run = (ex: Pick<typeof db, "select">) =>
			ex
				.select({ count: sql<number>`count(*)::int` })
				.from(book)
				.innerJoin(library, eq(library.id, book.libraryId))
				.leftJoin(bookMetadata, eq(bookMetadata.bookId, book.id))
				.leftJoin(audiobookMetadata, eq(audiobookMetadata.bookId, book.id))
				.where(
					this.catalogBooksWhere(serverId, scope, mediaType, query, minRating),
				)
				.limit(1);
		// A quick-search hits pgroonga indexes — keep it out of parallel workers.
		const [row] = query?.trim() ? await withSerialScan(run) : await run(db);
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
			tags,
		}: {
			mediaType: "ebook" | "audiobook";
			limit: number;
			offset: number;
			sort: "recent" | "title" | "author" | "rating";
			query?: string;
			minRating?: number;
			genres?: string[];
			year?: number;
			tags?: string[];
		},
	) {
		const ids = await this.orderedCatalogIds(
			this.libraryBooksWhere(
				libraryId,
				serverId,
				mediaType,
				scope,
				query,
				minRating,
				genres,
				year,
				tags,
			),
			sort,
			serverId,
			mediaType,
			limit,
			offset,
			!!query?.trim(),
		);
		if (ids.length === 0) return [];

		const md = this.metadataFor(mediaType);
		const rows = this.sortByIdOrder(
			await db
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
				.leftJoin(md, eq(md.bookId, book.id))
				.where(inArray(book.id, ids)),
			ids,
			(r) => Number(r.bookId),
		);

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
			tags?: string[];
		},
	) {
		const md = this.metadataFor(mediaType);
		const run = (ex: Pick<typeof db, "select">) =>
			ex
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
						filters?.tags,
					),
				)
				.limit(1);
		// A quick-search hits pgroonga indexes — keep it out of parallel workers.
		const [row] = filters?.query?.trim()
			? await withSerialScan(run)
			: await run(db);
		return row?.count ?? 0;
	}

	// Filter options present in a library: distinct genre/tag names (from either
	// the ebook or audiobook join tables) and distinct publication years (desc).
	async getLibraryFacets(
		libraryId: number,
		serverId: string,
		mediaType: "ebook" | "audiobook",
		scope?: LibraryScope,
	): Promise<{ genres: string[]; tags: string[]; years: number[] }> {
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

		const tagResult = await db.execute(sql`
			WITH visible_books AS (
				SELECT book.id
				FROM book
				INNER JOIN library ON library.id = book.library_id
				WHERE ${where}
			)
			SELECT DISTINCT name
			FROM (
				SELECT t.name
				FROM visible_books vb
				INNER JOIN book_tag bt ON bt.book_id = vb.id
				INNER JOIN tag t ON t.id = bt.tag_id AND t.server_id = ${serverId}
				UNION
				SELECT t.name
				FROM visible_books vb
				INNER JOIN audiobook_tag at ON at.book_id = vb.id
				INNER JOIN tag t ON t.id = at.tag_id AND t.server_id = ${serverId}
			) library_tags
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
			tags: (tagResult.rows as { name: string }[]).map((r) => r.name),
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
				embeddedUid: bookMetadata.embeddedUid,
			})
			.from(book)
			.leftJoin(bookMetadata, eq(bookMetadata.bookId, book.id))
			.where(eq(book.id, bookId))
			.limit(1);
		return row ?? null;
	}

	// Non-locked books in the library matching any identifier: a normalized
	// ISBN-13/10, an ASIN (Kindle-only editions carry no ISBN), or the opaque
	// OPF embedded uid (re-packaged copies of the same edition).
	async findGroupingCandidates(
		libraryId: number,
		ids: { isbns: string[]; asins: string[]; uids?: string[] },
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
		if (ids.uids && ids.uids.length > 0) {
			const uidList = sql.join(
				ids.uids.map((v) => sql`${v}`),
				sql`, `,
			);
			matchers.push(
				sql`trim(coalesce(${bookMetadata.embeddedUid}, '')) IN (${uidList})`,
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

	/** Books in a library sharing an embedded uid — boilerplate detection. */
	async countBooksWithEmbeddedUid(
		libraryId: number,
		uid: string,
	): Promise<number> {
		const [row] = await db
			.select({ count: sql<number>`count(*)::int` })
			.from(book)
			.leftJoin(bookMetadata, eq(bookMetadata.bookId, book.id))
			.where(
				and(
					eq(book.libraryId, libraryId),
					sql`trim(coalesce(${bookMetadata.embeddedUid}, '')) = ${uid}`,
				),
			);
		return row?.count ?? 0;
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

	/** Paginated (id, uuid) pages of a library's ebooks, for reprocess fan-out.
	 * Audiobooks are excluded — their pipeline (audio probe) is not reprocessable
	 * from the OPF path. */
	async listEbookIdsByLibraryAfter(
		libraryId: number,
		lastId: number,
		limit: number,
	): Promise<{ id: number; uuid: string }[]> {
		return db
			.select({ id: book.id, uuid: book.uuid })
			.from(book)
			.where(
				and(
					eq(book.libraryId, libraryId),
					gt(book.id, lastId),
					// NULL media_type predates the column and is always an ebook.
					or(isNull(book.mediaType), notLike(book.mediaType, "audio/%")),
				),
			)
			.orderBy(asc(book.id))
			.limit(limit);
	}
}
export const bookRepository = new BookRepository();
