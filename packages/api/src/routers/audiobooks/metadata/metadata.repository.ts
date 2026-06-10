import { db } from "@nanahoshi-v2/db";
import {
	audiobookAuthor,
	audiobookChapter,
	audiobookGenre,
	audiobookMetadata,
	audiobookSeries,
	author,
	bookNarrator,
	genre,
	narrator,
	publisher,
	series,
} from "@nanahoshi-v2/db/schema/general";
import { and, eq, sql } from "drizzle-orm";

export class AudiobookMetadataRepository {
	// ---------- 1. UPSERT audiobook_metadata ----------
	async upsertMetadata(bookId: number, metadata: Record<string, unknown>) {
		const existing = await db
			.select()
			.from(audiobookMetadata)
			.where(eq(audiobookMetadata.bookId, bookId))
			.limit(1);

		if (existing.length === 0) {
			const [inserted] = await db
				.insert(audiobookMetadata)
				.values({ bookId, ...metadata })
				.returning();
			return inserted;
		}

		const clean = Object.fromEntries(
			Object.entries(metadata).filter(([, v]) => v !== undefined),
		);
		if (Object.keys(clean).length === 0) return existing[0];

		const [updated] = await db
			.update(audiobookMetadata)
			.set(clean)
			.where(eq(audiobookMetadata.bookId, bookId))
			.returning();

		return updated ?? null;
	}

	// ---------- 2. UPSERT publisher ----------
	async upsertPublisher(name: string): Promise<number> {
		const [pub] = await db
			.insert(publisher)
			.values({ name })
			.onConflictDoUpdate({
				target: publisher.name,
				set: { name },
			})
			.returning({ id: publisher.id });

		if (!pub) throw new Error("Failed to upsert publisher");
		return pub.id;
	}

	// ---------- 3. UPSERT author (LOCAL provider for audiobooks) ----------
	async upsertAuthor(name: string): Promise<number> {
		const [existing] = await db
			.select({ id: author.id })
			.from(author)
			.where(and(eq(author.name, name), eq(author.provider, "LOCAL")))
			.limit(1);

		if (existing) return existing.id;

		const [inserted] = await db
			.insert(author)
			.values({ name, provider: "LOCAL" })
			.onConflictDoNothing()
			.returning({ id: author.id });

		if (inserted) return inserted.id;

		// Race condition retry
		const [retry] = await db
			.select({ id: author.id })
			.from(author)
			.where(and(eq(author.name, name), eq(author.provider, "LOCAL")))
			.limit(1);

		if (!retry) throw new Error(`Failed to upsert author "${name}"`);
		return retry.id;
	}

	// ---------- 4. Link/unlink audiobook-author ----------
	async linkBookAuthor(bookId: number, authorId: number, role = "Author") {
		await db
			.insert(audiobookAuthor)
			.values({ bookId, authorId, role })
			.onConflictDoUpdate({
				target: [audiobookAuthor.bookId, audiobookAuthor.authorId],
				set: { role },
			});
	}

	async getBookAuthors(
		bookId: number,
	): Promise<{ id: number; name: string }[]> {
		return db
			.select({ id: author.id, name: author.name })
			.from(audiobookAuthor)
			.innerJoin(author, eq(author.id, audiobookAuthor.authorId))
			.where(eq(audiobookAuthor.bookId, bookId));
	}

	async clearBookAuthors(bookId: number) {
		await db.delete(audiobookAuthor).where(eq(audiobookAuthor.bookId, bookId));
	}

	// ---------- 5. UPSERT narrator ----------
	async upsertNarrator(name: string): Promise<number> {
		const [existing] = await db
			.select({ id: narrator.id })
			.from(narrator)
			.where(eq(narrator.name, name))
			.limit(1);

		if (existing) return existing.id;

		const [inserted] = await db
			.insert(narrator)
			.values({ name })
			.onConflictDoNothing()
			.returning({ id: narrator.id });

		if (inserted) return inserted.id;

		const [retry] = await db
			.select({ id: narrator.id })
			.from(narrator)
			.where(eq(narrator.name, name))
			.limit(1);

		if (!retry) throw new Error(`Failed to upsert narrator "${name}"`);
		return retry.id;
	}

	// ---------- 6. Link/unlink audiobook-narrator ----------
	async linkBookNarrator(bookId: number, narratorId: number) {
		await db
			.insert(bookNarrator)
			.values({ bookId, narratorId })
			.onConflictDoNothing();
	}

	async getBookNarrators(
		bookId: number,
	): Promise<{ id: number; name: string }[]> {
		return db
			.select({ id: narrator.id, name: narrator.name })
			.from(bookNarrator)
			.innerJoin(narrator, eq(narrator.id, bookNarrator.narratorId))
			.where(eq(bookNarrator.bookId, bookId));
	}

	async clearBookNarrators(bookId: number) {
		await db.delete(bookNarrator).where(eq(bookNarrator.bookId, bookId));
	}

	// ---------- 7. UPSERT series ----------
	async upsertSeries(name: string): Promise<number> {
		const [row] = await db
			.insert(series)
			.values({ name })
			.onConflictDoUpdate({
				target: series.name,
				set: { name },
			})
			.returning({ id: series.id });

		if (!row) throw new Error("Failed to upsert series");
		return row.id;
	}

	// ---------- 8. Link audiobook-series ----------
	async linkBookSeries(
		bookId: number,
		seriesId: number,
		position: number | null,
	) {
		await db
			.insert(audiobookSeries)
			.values({ bookId, seriesId, position })
			.onConflictDoUpdate({
				target: [audiobookSeries.bookId, audiobookSeries.seriesId],
				set: { position },
			});
	}

	async getBookSeriesIds(bookId: number): Promise<number[]> {
		const rows = await db
			.select({ seriesId: audiobookSeries.seriesId })
			.from(audiobookSeries)
			.where(eq(audiobookSeries.bookId, bookId));
		return rows.map((r) => r.seriesId);
	}

	async clearBookSeries(bookId: number) {
		await db.delete(audiobookSeries).where(eq(audiobookSeries.bookId, bookId));
	}

	// ---------- 9. UPSERT genre ----------
	async upsertGenre(name: string): Promise<number> {
		const [row] = await db
			.insert(genre)
			.values({ name })
			.onConflictDoUpdate({
				target: genre.name,
				set: { name },
			})
			.returning({ id: genre.id });

		if (!row) throw new Error("Failed to upsert genre");
		return row.id;
	}

	// ---------- 10. Link audiobook-genre ----------
	async linkBookGenre(bookId: number, genreId: number) {
		await db
			.insert(audiobookGenre)
			.values({ bookId, genreId })
			.onConflictDoNothing();
	}

	async clearBookGenres(bookId: number) {
		await db.delete(audiobookGenre).where(eq(audiobookGenre.bookId, bookId));
	}

	// ---------- 11. Chapters ----------
	async replaceChapters(
		bookId: number,
		chapters: {
			index: number;
			title: string | null;
			startTime: number;
			endTime: number;
		}[],
	) {
		// Clear existing chapters
		await db
			.delete(audiobookChapter)
			.where(eq(audiobookChapter.bookId, bookId));

		if (chapters.length === 0) return;

		await db
			.insert(audiobookChapter)
			.values(chapters.map((ch) => ({ ...ch, bookId })));
	}

	// ---------- 12. Audible enrichment tracking ----------
	async markAudibleEnriched(bookId: number) {
		await db.execute(sql`
			UPDATE audiobook_metadata
			SET asin = asin
			WHERE book_id = ${bookId}
		`);
		// We track enrichment by the presence of an ASIN value.
		// A dedicated column can be added later if needed.
	}

	async isAudibleEnriched(bookId: number): Promise<boolean> {
		const [row] = await db
			.select({ asin: audiobookMetadata.asin })
			.from(audiobookMetadata)
			.where(eq(audiobookMetadata.bookId, bookId))
			.limit(1);
		return row?.asin != null;
	}

	// ---------- 13. Find metadata by bookId ----------
	async findByBookId(bookId: number) {
		const rows = await db
			.select()
			.from(audiobookMetadata)
			.where(eq(audiobookMetadata.bookId, bookId))
			.limit(1);
		return rows[0] ?? null;
	}

	// ---------- 14. Orphan cleanup ----------
	async deleteAuthorIfOrphaned(authorId: number): Promise<boolean> {
		const { rowCount } = await db.execute(sql`
			DELETE FROM author
			WHERE id = ${authorId}
			AND NOT EXISTS (
				SELECT 1 FROM book_author WHERE author_id = ${authorId}
			)
			AND NOT EXISTS (
				SELECT 1 FROM audiobook_author WHERE author_id = ${authorId}
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
			AND NOT EXISTS (
				SELECT 1 FROM audiobook_series WHERE series_id = ${seriesId}
			)
		`);
		return (rowCount ?? 0) > 0;
	}

	async deleteNarratorIfOrphaned(narratorId: number): Promise<boolean> {
		const { rowCount } = await db.execute(sql`
			DELETE FROM narrator
			WHERE id = ${narratorId}
			AND NOT EXISTS (
				SELECT 1 FROM book_narrator WHERE narrator_id = ${narratorId}
			)
		`);
		return (rowCount ?? 0) > 0;
	}
}

export const audiobookMetadataRepository = new AudiobookMetadataRepository();
