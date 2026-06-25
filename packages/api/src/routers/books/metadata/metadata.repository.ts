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
import { and, eq, inArray, notExists, sql } from "drizzle-orm";
import { withDeadlockRetry } from "../../../utils/withDeadlockRetry";

export class BookMetadataRepository {
	// ---------- 1. UPSERT book_metadata ----------
	// bookId is the PK → one INSERT ... ON CONFLICT upserts. undefined values are
	// dropped (don't overwrite); nulls kept so callers can clear fields.
	async upsertMetadata(bookId: number, metadata: Record<string, unknown>) {
		const clean = Object.fromEntries(
			Object.entries(metadata).filter(([, v]) => v !== undefined),
		);

		// Nothing to set: just make sure the row exists and return it.
		if (Object.keys(clean).length === 0) {
			const [inserted] = await db
				.insert(bookMetadata)
				.values({ bookId })
				.onConflictDoNothing({ target: bookMetadata.bookId })
				.returning();
			if (inserted) return inserted;
			const [existing] = await db
				.select()
				.from(bookMetadata)
				.where(eq(bookMetadata.bookId, bookId))
				.limit(1);
			return existing ?? null;
		}

		const [row] = await db
			.insert(bookMetadata)
			.values({ bookId, ...clean })
			.onConflictDoUpdate({ target: bookMetadata.bookId, set: clean })
			.returning();

		return row ?? null;
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

	/**
	 * Replaces a book's authors in bulk: upserts every author in one INSERT,
	 * relinks them in one INSERT, and reports which previous authors are no
	 * longer linked (so the caller can prune orphans / sync search). Collapses
	 * the per-author round trips saveMetadata used to do.
	 */
	async replaceBookAuthors(
		bookId: number,
		authors: { name: string; role?: string | null }[],
		provider: string,
		serverId: string,
	): Promise<{ authorIds: number[]; removedAuthorIds: number[] }> {
		// Idempotent, so safe to retry the rare deadlock the sort below misses.
		return withDeadlockRetry(async () => {
			const previous = await db
				.select({ id: bookAuthor.authorId })
				.from(bookAuthor)
				.where(eq(bookAuthor.bookId, bookId));
			const previousIds = previous.map((r) => r.id);

			// Dedupe by name, then sort: concurrent jobs upserting shared authors
			// must lock rows in the same order or they deadlock.
			const uniq = [...new Map(authors.map((a) => [a.name, a])).values()].sort(
				(a, b) => a.name.localeCompare(b.name),
			);
			if (uniq.length === 0) {
				await db.delete(bookAuthor).where(eq(bookAuthor.bookId, bookId));
				return { authorIds: [], removedAuthorIds: previousIds };
			}

			const upserted = await db
				.insert(author)
				.values(uniq.map((a) => ({ name: a.name, provider, serverId })))
				.onConflictDoUpdate({
					target: [author.serverId, author.provider, author.name],
					set: { name: sql`excluded.name` },
				})
				.returning({ id: author.id, name: author.name });
			const idByName = new Map(upserted.map((r) => [r.name, r.id]));
			const authorIds = uniq
				.map((a) => idByName.get(a.name))
				.filter((id): id is number => id != null);

			// Replace links: clear then bulk re-insert (book_author is per-book,
			// so no cross-job contention — only the shared `author` table is).
			await db.delete(bookAuthor).where(eq(bookAuthor.bookId, bookId));
			await db
				.insert(bookAuthor)
				.values(
					uniq.flatMap((a) => {
						const authorId = idByName.get(a.name);
						return authorId != null
							? [{ bookId, authorId, role: a.role ?? "Author" }]
							: [];
					}),
				)
				.onConflictDoUpdate({
					target: [bookAuthor.bookId, bookAuthor.authorId],
					set: { role: sql`excluded.role` },
				});

			const newIds = new Set(authorIds);
			const removedAuthorIds = previousIds.filter((id) => !newIds.has(id));
			return { authorIds, removedAuthorIds };
		});
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

	/** Upserts genres and links them to the book, in two bulk INSERTs. */
	async upsertGenresAndLink(
		bookId: number,
		genres: string[],
		serverId: string,
	) {
		// Sort by name so concurrent jobs upserting shared genres (e.g. "Fantasy")
		// lock rows in the same order; idempotent, so retry the rare deadlock.
		const uniq = [...new Set(genres)].sort((a, b) => a.localeCompare(b));
		if (uniq.length === 0) return;

		await withDeadlockRetry(async () => {
			const upserted = await db
				.insert(genre)
				.values(uniq.map((name) => ({ name, serverId })))
				.onConflictDoUpdate({
					target: [genre.serverId, genre.name],
					set: { name: sql`excluded.name` },
				})
				.returning({ id: genre.id });

			await db
				.insert(bookGenre)
				.values(upserted.map((g) => ({ bookId, genreId: g.id })))
				.onConflictDoNothing({
					target: [bookGenre.bookId, bookGenre.genreId],
				});
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

	/** Batch variant: deletes every given author that no longer has any links. */
	async deleteAuthorsIfOrphaned(authorIds: number[]): Promise<void> {
		if (authorIds.length === 0) return;
		// Lock candidate rows in a stable order and retry on deadlock: this can
		// race against another job upserting the same author.
		const ids = [...new Set(authorIds)].sort((a, b) => a - b);
		await withDeadlockRetry(async () => {
			await db
				.delete(author)
				.where(
					and(
						inArray(author.id, ids),
						notExists(
							db
								.select({ one: sql`1` })
								.from(bookAuthor)
								.where(eq(bookAuthor.authorId, author.id)),
						),
					),
				);
		});
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

	/** Lightweight (id, uuid) pages over every book, for fan-out enqueuing. */
	async listBookIdsAfter(
		lastId: number | null,
		limit: number,
	): Promise<{ id: number; uuid: string }[]> {
		const { rows } = await db.execute(sql`
			SELECT id, uuid FROM book
			${lastId ? sql`WHERE id > ${lastId}` : sql``}
			ORDER BY id ASC
			LIMIT ${limit}
		`);
		return rows as { id: number; uuid: string }[];
	}
}

export const bookMetadataRepository = new BookMetadataRepository();
