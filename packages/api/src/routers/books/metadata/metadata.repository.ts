import { db } from "@nanahoshi-v2/db";
import {
	author,
	book,
	bookAuthor,
	bookGenre,
	bookMetadata,
	bookMetadataOriginal,
	bookSeries,
	genre,
	library,
	publisher,
	series,
} from "@nanahoshi-v2/db/schema/general";
import { and, eq, sql } from "drizzle-orm";

export class BookMetadataRepository {
	// ---------- 1. UPSERT book_metadata ----------
	async upsertMetadata(bookId: number, metadata: Record<string, unknown>) {
		// ¿ya existe?
		const existing = await db
			.select()
			.from(bookMetadata)
			.where(eq(bookMetadata.bookId, bookId))
			.limit(1);

		// --- INSERT -------------------------------------------------
		if (existing.length === 0) {
			const [inserted] = await db
				.insert(bookMetadata)
				.values({ bookId, ...metadata })
				.returning();
			return inserted;
		}

		// --- UPDATE (si hay algo que cambiar) -----------------------
		const clean = Object.fromEntries(
			Object.entries(metadata).filter(([, v]) => v !== undefined),
		);

		if (Object.keys(clean).length === 0) {
			// nada que actualizar → devuelve fila existente
			return existing[0];
		}

		const [updated] = await db
			.update(bookMetadata)
			.set(clean)
			.where(eq(bookMetadata.bookId, bookId))
			.returning();

		return updated ?? null;
	}
	// ---------- 2. UPSERT publisher ----------
	async upsertPublisher(name: string, serverId: string): Promise<number> {
		const [pub] = await db
			.insert(publisher)
			.values({ name, serverId })
			.onConflictDoUpdate({
				target: [publisher.serverId, publisher.name], // ON CONFLICT (server_id, name)
				set: { name },
			})
			.returning({ id: publisher.id });

		if (!pub) {
			throw new Error("Failed to upsert publisher");
		}

		return pub.id;
	}

	// ---------- 3. UPSERT author ----------
	async upsertAuthor(
		name: string,
		provider: string,
		serverId: string,
		amazonAsin?: string,
	): Promise<number> {
		const values = {
			name,
			provider,
			serverId,
			...(amazonAsin ? { amazonAsin } : {}),
		};

		const conflictTarget = amazonAsin
			? [author.serverId, author.amazonAsin] // UNIQUE (server_id, amazon_asin)
			: [author.serverId, author.provider, author.name]; // UNIQUE (server_id, provider, name)

		const [row] = await db
			.insert(author)
			.values(values)
			.onConflictDoUpdate({
				target: conflictTarget,
				set: values,
			})
			.returning({ id: author.id });

		if (!row) {
			throw new Error("Failed to upsert author");
		}

		return row.id;
	}

	// ---------- 4. Vincular libro-autor ----------
	async linkBookAuthor(bookId: number, authorId: number, role = "Author") {
		await db
			.insert(bookAuthor)
			.values({ bookId, authorId, role })
			.onConflictDoUpdate({
				target: [bookAuthor.bookId, bookAuthor.authorId],
				set: { role },
			});
	}

	// ---------- 5. Desvincular libro-autor ----------
	async unlinkBookAuthor(bookId: number, authorId: number) {
		await db
			.delete(bookAuthor)
			.where(
				and(eq(bookAuthor.bookId, bookId), eq(bookAuthor.authorId, authorId)),
			);
	}

	// ---------- 6. Get book authors ----------
	async getBookAuthors(
		bookId: number,
	): Promise<{ id: number; name: string }[]> {
		return db
			.select({ id: author.id, name: author.name })
			.from(bookAuthor)
			.innerJoin(author, eq(author.id, bookAuthor.authorId))
			.where(eq(bookAuthor.bookId, bookId));
	}

	// Resolve the owning server for a book (via its library). Catalog entities are
	// scoped per-server, so enrichment needs this to upsert author/series/etc.
	async getServerIdByBookId(bookId: number): Promise<string | null> {
		const [row] = await db
			.select({ serverId: library.serverId })
			.from(book)
			.innerJoin(library, eq(library.id, book.libraryId))
			.where(eq(book.id, bookId))
			.limit(1);
		return row?.serverId ?? null;
	}

	// ---------- 7. Obtener metadata por bookId ----------
	async findByBookId(bookId: number) {
		const rows = await db
			.select()
			.from(bookMetadata)
			.where(eq(bookMetadata.bookId, bookId))
			.limit(1);

		return rows[0] ?? null;
	}

	// ---------- 8. UPSERT series ----------
	async upsertSeries(name: string, serverId: string): Promise<number> {
		const [row] = await db
			.insert(series)
			.values({ name, serverId })
			.onConflictDoUpdate({
				target: [series.serverId, series.name],
				set: { name },
			})
			.returning({ id: series.id });

		if (!row) {
			throw new Error("Failed to upsert series");
		}

		return row.id;
	}

	// ---------- 9. Vincular libro-serie ----------
	async linkBookSeries(
		bookId: number,
		seriesId: number,
		position: number | null,
	) {
		await db
			.insert(bookSeries)
			.values({ bookId, seriesId, position })
			.onConflictDoUpdate({
				target: [bookSeries.bookId, bookSeries.seriesId],
				set: { position },
			});
	}

	// ---------- 10. UPSERT genre ----------
	async upsertGenre(name: string, serverId: string): Promise<number> {
		const [row] = await db
			.insert(genre)
			.values({ name, serverId })
			.onConflictDoUpdate({
				target: [genre.serverId, genre.name],
				set: { name },
			})
			.returning({ id: genre.id });

		if (!row) {
			throw new Error("Failed to upsert genre");
		}

		return row.id;
	}

	// ---------- 11. Vincular libro-género ----------
	async linkBookGenre(bookId: number, genreId: number) {
		await db
			.insert(bookGenre)
			.values({ bookId, genreId })
			.onConflictDoNothing({
				target: [bookGenre.bookId, bookGenre.genreId],
			});
	}
	// ---------- 12. Clear all book links ----------
	async clearBookAuthors(bookId: number) {
		await db.delete(bookAuthor).where(eq(bookAuthor.bookId, bookId));
	}

	async clearBookGenres(bookId: number) {
		await db.delete(bookGenre).where(eq(bookGenre.bookId, bookId));
	}

	async clearBookSeries(bookId: number) {
		await db.delete(bookSeries).where(eq(bookSeries.bookId, bookId));
	}

	async resetMetadata(bookId: number, fields: Record<string, unknown>) {
		await db
			.update(bookMetadata)
			.set(fields)
			.where(eq(bookMetadata.bookId, bookId));
	}

	// ---------- Library provider priority ----------
	async getLibraryProviderOrder(bookId: number): Promise<string[] | null> {
		const [row] = await db
			.select({ metadataProviders: library.metadataProviders })
			.from(book)
			.innerJoin(library, eq(library.id, book.libraryId))
			.where(eq(book.id, bookId))
			.limit(1);
		return row?.metadataProviders ?? null;
	}

	// ---------- Amazon enrichment tracking ----------
	async markAmazonEnriched(bookId: number) {
		await db
			.update(bookMetadata)
			.set({ amazonEnrichedAt: new Date() })
			.where(eq(bookMetadata.bookId, bookId));
	}

	async isAmazonEnriched(bookId: number): Promise<boolean> {
		const [row] = await db
			.select({ amazonEnrichedAt: bookMetadata.amazonEnrichedAt })
			.from(bookMetadata)
			.where(eq(bookMetadata.bookId, bookId))
			.limit(1);
		return row?.amazonEnrichedAt != null;
	}

	// ---------- 13. Save original metadata snapshot ----------
	async saveOriginalMetadata(bookId: number, data: Record<string, unknown>) {
		await db
			.insert(bookMetadataOriginal)
			.values({ bookId, data })
			.onConflictDoNothing({
				target: bookMetadataOriginal.bookId,
			});
	}

	// ---------- 13. Get original metadata ----------
	async getOriginalMetadata(bookId: number) {
		const [row] = await db
			.select({ data: bookMetadataOriginal.data })
			.from(bookMetadataOriginal)
			.where(eq(bookMetadataOriginal.bookId, bookId));
		return row?.data ?? null;
	}

	// ---------- 14. Get series IDs linked to a book ----------
	async getBookSeriesIds(bookId: number): Promise<number[]> {
		const rows = await db
			.select({ seriesId: bookSeries.seriesId })
			.from(bookSeries)
			.where(eq(bookSeries.bookId, bookId));
		return rows.map((r) => r.seriesId);
	}

	// ---------- 15. Delete orphaned entities ----------
	async deleteAuthorIfOrphaned(authorId: number): Promise<boolean> {
		const { rowCount } = await db.execute(sql`
			DELETE FROM author
			WHERE id = ${authorId}
			AND NOT EXISTS (
				SELECT 1 FROM book_author WHERE author_id = ${authorId}
			)
		`);
		return (rowCount ?? 0) > 0;
	}

	async deleteSeriesIfOrphaned(seriesId: number): Promise<boolean> {
		const { rowCount } = await db.execute(sql`
			DELETE FROM series
			WHERE id = ${seriesId}
			AND NOT EXISTS (
				SELECT 1 FROM book_series WHERE series_id = ${seriesId}
			)
		`);
		return (rowCount ?? 0) > 0;
	}

	// ---------- 16. Cover color ----------
	async setMainColor(bookId: number, color: string) {
		await db
			.update(bookMetadata)
			.set({ mainColor: color })
			.where(eq(bookMetadata.bookId, bookId));
	}

	// ---------- 17. Enrichment rows ----------
	async countAllBooks(): Promise<number> {
		const result = await db
			.select({ count: sql<number>`count(*)::int` })
			.from(book);
		return result[0]?.count ?? 0;
	}

	async getEnrichRowByBookId(
		bookId: number,
	): Promise<Record<string, unknown> | undefined> {
		const { rows } = await db.execute(sql`
			SELECT
				b.id,
				b.uuid,
				b.duplicate_of_book_id AS "duplicateOfBookId",
				bm.title,
				bm.subtitle,
				bm.description,
				bm.isbn_10 AS "isbn10",
				bm.isbn_13 AS "isbn13",
				bm.asin,
				bm.language_code AS "languageCode",
				bm.cover,
				jsonb_build_object('name', p.name) AS publisher,
				COALESCE(
					jsonb_agg(
						DISTINCT jsonb_build_object('name', a.name, 'role', ba.role)
					) FILTER (WHERE a.id IS NOT NULL),
					'[]'
				) AS authors
			FROM book b
			LEFT JOIN book_metadata bm ON bm.book_id = b.id
			LEFT JOIN book_author ba ON ba.book_id = b.id
			LEFT JOIN author a ON a.id = ba.author_id
			LEFT JOIN publisher p ON p.id = bm.publisher_id
			WHERE b.id = ${bookId}
			GROUP BY b.id, bm.book_id, p.id
		`);
		return rows[0] as Record<string, unknown> | undefined;
	}

	async listEnrichRowsAfter(
		lastId: number | null,
		limit: number,
	): Promise<Record<string, unknown>[]> {
		const { rows } = await db.execute(sql`
			SELECT
				b.id,
				b.uuid,
				bm.title,
				bm.subtitle,
				bm.description,
				bm.isbn_10 AS "isbn10",
				bm.isbn_13 AS "isbn13",
				bm.asin,
				bm.language_code AS "languageCode",
				bm.cover,
				jsonb_build_object('name', p.name) AS publisher,
				COALESCE(
					jsonb_agg(
						DISTINCT jsonb_build_object('name', a.name, 'role', ba.role)
					) FILTER (WHERE a.id IS NOT NULL),
					'[]'
				) AS authors
			FROM book b
			LEFT JOIN book_metadata bm ON bm.book_id = b.id
			LEFT JOIN book_author ba ON ba.book_id = b.id
			LEFT JOIN author a ON a.id = ba.author_id
			LEFT JOIN publisher p ON p.id = bm.publisher_id
			${lastId ? sql`WHERE b.id > ${lastId}` : sql``}
			GROUP BY b.id, bm.book_id, p.id
			ORDER BY b.id ASC
			LIMIT ${limit}
		`);
		return rows as Record<string, unknown>[];
	}
}

export const bookMetadataRepository = new BookMetadataRepository();
