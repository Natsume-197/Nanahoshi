import { db } from "@nanahoshi-v2/db";
import {
	audiobookAuthor,
	audiobookChapter,
	audiobookGenre,
	audiobookMetadata,
	audiobookSeries,
	audiobookTag,
	audioFile,
	author,
	book,
	bookNarrator,
	genre,
	library,
	narrator,
	publisher,
	series,
	tag,
} from "@nanahoshi-v2/db/schema/general";
import { and, eq, sql } from "drizzle-orm";
import { normalizeTagNames } from "../../../utils/normalizeTagNames";
import { normalizePersonName } from "../../_shared/person-name";

type AudiobookMetadataInsert = typeof audiobookMetadata.$inferInsert;
type AudioFileInsert = typeof audioFile.$inferInsert;
type AudiobookChapterInsert = typeof audiobookChapter.$inferInsert;

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

	// Resolve the owning server for a book (via its library); catalog is per-server.
	async getServerIdByBookId(bookId: number): Promise<string | null> {
		const [row] = await db
			.select({ serverId: library.serverId })
			.from(book)
			.innerJoin(library, eq(library.id, book.libraryId))
			.where(eq(book.id, bookId))
			.limit(1);
		return row?.serverId ?? null;
	}

	// ---------- 2. UPSERT publisher ----------
	async upsertPublisher(name: string, serverId: string): Promise<number> {
		const [pub] = await db
			.insert(publisher)
			.values({ name, serverId })
			.onConflictDoUpdate({
				target: [publisher.serverId, publisher.name],
				set: { name },
			})
			.returning({ id: publisher.id });

		if (!pub) throw new Error("Failed to upsert publisher");
		return pub.id;
	}

	// ---------- 3. UPSERT author (by normalized name, any provider) ----------
	async upsertAuthor(name: string, serverId: string): Promise<number> {
		const nameNormalized = normalizePersonName(name);
		const byNormalized = () =>
			db
				.select({ id: author.id })
				.from(author)
				.where(
					and(
						eq(author.serverId, serverId),
						eq(author.nameNormalized, nameNormalized),
					),
				)
				.orderBy(author.id)
				.limit(1);

		const [existing] = await byNormalized();
		if (existing) return existing.id;

		const [inserted] = await db
			.insert(author)
			.values({ name, provider: "LOCAL", serverId })
			.onConflictDoNothing()
			.returning({ id: author.id });

		if (inserted) return inserted.id;

		// Race condition retry
		const [retry] = await byNormalized();
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

	// ---------- 5. UPSERT narrator (by normalized name) ----------
	async upsertNarrator(name: string, serverId: string): Promise<number> {
		const nameNormalized = normalizePersonName(name);
		const byNormalized = () =>
			db
				.select({ id: narrator.id })
				.from(narrator)
				.where(
					and(
						eq(narrator.serverId, serverId),
						eq(narrator.nameNormalized, nameNormalized),
					),
				)
				.limit(1);

		const [existing] = await byNormalized();
		if (existing) return existing.id;

		const [inserted] = await db
			.insert(narrator)
			.values({ name, serverId })
			.onConflictDoNothing()
			.returning({ id: narrator.id });

		if (inserted) return inserted.id;

		const [retry] = await byNormalized();
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
	async upsertSeries(name: string, serverId: string): Promise<number> {
		const [row] = await db
			.insert(series)
			.values({ name, serverId })
			.onConflictDoUpdate({
				target: [series.serverId, series.name],
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
	async upsertGenre(name: string, serverId: string): Promise<number> {
		const [row] = await db
			.insert(genre)
			.values({ name, serverId })
			.onConflictDoUpdate({
				target: [genre.serverId, genre.name],
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

	// ---------- 10b. Tags ----------
	/** Upserts tags (normalized for cross-provider dedupe) and links them. */
	async upsertTagsAndLink(bookId: number, tags: string[], serverId: string) {
		const uniq = normalizeTagNames(tags);
		if (uniq.length === 0) return;

		const upserted = await db
			.insert(tag)
			.values(uniq.map((name) => ({ name, serverId })))
			.onConflictDoUpdate({
				target: [tag.serverId, tag.name],
				set: { name: sql`excluded.name` },
			})
			.returning({ id: tag.id });

		await db
			.insert(audiobookTag)
			.values(upserted.map((t) => ({ bookId, tagId: t.id })))
			.onConflictDoNothing({
				target: [audiobookTag.bookId, audiobookTag.tagId],
			});
	}

	async clearBookTags(bookId: number) {
		await db.delete(audiobookTag).where(eq(audiobookTag.bookId, bookId));
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

	// ---------- 12. Field provenance ----------
	// Shallow jsonb merge: incoming fields overwrite their entry, the rest keep
	// their recorded origin. Run tracking lives in enrichment_state.
	async mergeFieldSources(
		bookId: number,
		sources: Record<string, { p: string; at: string }>,
	) {
		if (Object.keys(sources).length === 0) return;
		await db
			.update(audiobookMetadata)
			.set({
				fieldSources: sql`${audiobookMetadata.fieldSources} || ${JSON.stringify(sources)}::jsonb`,
			})
			.where(eq(audiobookMetadata.bookId, bookId));
	}

	// ---------- Locked fields (manual-edit protection) ----------
	async getLockedFields(bookId: number): Promise<string[]> {
		const [row] = await db
			.select({ lockedFields: audiobookMetadata.lockedFields })
			.from(audiobookMetadata)
			.where(eq(audiobookMetadata.bookId, bookId))
			.limit(1);
		return row?.lockedFields ?? [];
	}

	async setLockedFields(bookId: number, fields: string[]) {
		await db
			.insert(audiobookMetadata)
			.values({ bookId, lockedFields: fields })
			.onConflictDoUpdate({
				target: audiobookMetadata.bookId,
				set: { lockedFields: fields },
			});
	}

	async addLockedFields(bookId: number, fields: string[]) {
		if (fields.length === 0) return;
		const current = await this.getLockedFields(bookId);
		await this.setLockedFields(bookId, [...new Set([...current, ...fields])]);
	}

	async removeLockedFields(bookId: number, fields: string[]) {
		if (fields.length === 0) return;
		const remove = new Set(fields);
		const current = await this.getLockedFields(bookId);
		await this.setLockedFields(
			bookId,
			current.filter((f) => !remove.has(f)),
		);
	}

	// ---------- Inferred series resolution ----------
	// For a title-derived series name, reuse an existing series sharing a
	// strong common prefix: light-novel volumes titled "<series><subtitle>"
	// must converge on the prefix instead of one series per volume. Singleton
	// series (inference artifacts) get renamed to the common prefix;
	// established multi-book series are never disturbed.
	async resolveInferredSeries(
		name: string,
		serverId: string,
	): Promise<{ id: number; name: string }> {
		const { commonSeriesPrefix } = await import(
			"../../../modules/audiobookSeriesInference"
		);

		const exact = await db
			.select({ id: series.id })
			.from(series)
			.where(and(eq(series.serverId, serverId), eq(series.name, name)))
			.limit(1);
		if (exact[0]) return { id: exact[0].id, name };

		const { rows } = await db.execute(sql`
			SELECT s.id, s.name, COUNT(abs.book_id)::int AS cnt
			FROM series s
			LEFT JOIN audiobook_series abs ON abs.series_id = s.id
			WHERE s.server_id = ${serverId}
				AND left(s.name, 4) = ${name.slice(0, 4)}
				AND s.name != ${name}
			GROUP BY s.id
		`);
		const candidates = rows as { id: number; name: string; cnt: number }[];

		let best: { id: number; name: string; cnt: number } | null = null;
		let bestPrefix: string | null = null;
		for (const candidate of candidates) {
			const prefix = commonSeriesPrefix(name, candidate.name);
			if (!prefix) continue;
			if (
				!bestPrefix ||
				prefix.length > bestPrefix.length ||
				(prefix.length === bestPrefix.length && candidate.name === prefix)
			) {
				best = candidate;
				bestPrefix = prefix;
			}
		}

		if (best && bestPrefix) {
			if (best.name === bestPrefix) return { id: best.id, name: best.name };
			if (best.cnt <= 1) {
				try {
					await db
						.update(series)
						.set({ name: bestPrefix })
						.where(eq(series.id, best.id));
					return { id: best.id, name: bestPrefix };
				} catch {
					// Another series already holds the prefix name — use it.
					const [existing] = await db
						.select({ id: series.id })
						.from(series)
						.where(
							and(eq(series.serverId, serverId), eq(series.name, bestPrefix)),
						)
						.limit(1);
					if (existing) return { id: existing.id, name: bestPrefix };
				}
			}
		}

		const id = await this.upsertSeries(name, serverId);
		return { id, name };
	}

	// ---------- Library provider priority ----------
	private async selectLibraryForBook(bookId: number) {
		const [row] = await db
			.select({
				metadataProviders: library.metadataProviders,
				metadataConfig: library.metadataConfig,
			})
			.from(book)
			.innerJoin(library, eq(library.id, book.libraryId))
			.where(eq(book.id, bookId))
			.limit(1);
		return row ?? null;
	}

	async getLibraryProviderOrder(
		bookId: number,
	): Promise<
		string[] | { order: string[]; fields?: Record<string, string[]> } | null
	> {
		const row = await this.selectLibraryForBook(bookId);
		return row?.metadataProviders ?? null;
	}

	// Per-library metadata overrides (Audible region).
	async getLibraryMetadataConfig(
		bookId: number,
	): Promise<(typeof library.$inferSelect)["metadataConfig"] | null> {
		const row = await this.selectLibraryForBook(bookId);
		return row?.metadataConfig ?? null;
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

	async getCoverByBookId(bookId: number): Promise<string | null> {
		const [row] = await db
			.select({ cover: audiobookMetadata.cover })
			.from(audiobookMetadata)
			.where(eq(audiobookMetadata.bookId, bookId))
			.limit(1);
		return row?.cover ?? null;
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

	// ---------- 15. Audiobook processor inserts ----------
	async insertMetadata(row: AudiobookMetadataInsert) {
		await db.insert(audiobookMetadata).values(row).onConflictDoNothing();
	}

	async insertAudioFiles(rows: AudioFileInsert[]) {
		if (rows.length === 0) return;
		await db.insert(audioFile).values(rows).onConflictDoNothing();
	}

	async insertChapters(rows: AudiobookChapterInsert[]) {
		if (rows.length === 0) return;
		await db.insert(audiobookChapter).values(rows).onConflictDoNothing();
	}

	async linkAuthor(bookId: number, authorId: number, role = "Author") {
		await db
			.insert(audiobookAuthor)
			.values({ bookId, authorId, role })
			.onConflictDoNothing();
	}

	async linkNarrator(bookId: number, narratorId: number) {
		await db
			.insert(bookNarrator)
			.values({ bookId, narratorId })
			.onConflictDoNothing();
	}

	async linkGenre(bookId: number, genreId: number) {
		await db
			.insert(audiobookGenre)
			.values({ bookId, genreId })
			.onConflictDoNothing();
	}

	async linkSeries(bookId: number, seriesId: number, position: number | null) {
		await db
			.insert(audiobookSeries)
			.values({ bookId, seriesId, position })
			.onConflictDoNothing();
	}

	// ---------- 16. Cover color ----------
	async setMainColor(bookId: number, color: string) {
		await db
			.update(audiobookMetadata)
			.set({ mainColor: color })
			.where(eq(audiobookMetadata.bookId, bookId));
	}

	/** Ingest renames the file to carry its resolution, so the row has to follow
	 * it or the stored path points at art that no longer exists. */
	async setCoverArtifacts(
		bookId: number,
		artifacts: { cover?: string; mainColor?: string },
	) {
		if (!artifacts.cover && !artifacts.mainColor) return;
		await db
			.update(audiobookMetadata)
			.set({
				...(artifacts.cover ? { cover: artifacts.cover } : {}),
				...(artifacts.mainColor ? { mainColor: artifacts.mainColor } : {}),
			})
			.where(eq(audiobookMetadata.bookId, bookId));
	}

	// ---------- 17. Enrichment row (single audiobook) ----------
	async getEnrichRowByBookId(
		bookId: number,
	): Promise<Record<string, unknown> | undefined> {
		const { rows } = await db.execute(sql`
			SELECT
				am.title,
				am.asin,
				am.duration,
				b.filename,
				COALESCE(
					jsonb_agg(
						DISTINCT jsonb_build_object('name', a.name)
					) FILTER (WHERE a.id IS NOT NULL),
					'[]'
				) AS authors
			FROM audiobook_metadata am
			INNER JOIN book b ON b.id = am.book_id
			LEFT JOIN audiobook_author aa ON aa.book_id = am.book_id
			LEFT JOIN author a ON a.id = aa.author_id
			WHERE am.book_id = ${bookId}
			GROUP BY am.book_id, b.filename
		`);
		return rows[0] as Record<string, unknown> | undefined;
	}
}

export const audiobookMetadataRepository = new AudiobookMetadataRepository();
