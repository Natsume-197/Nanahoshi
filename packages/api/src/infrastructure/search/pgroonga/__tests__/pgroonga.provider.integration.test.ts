import { afterAll, beforeAll, describe, expect, test } from "bun:test";

/**
 * Integration test against a real PGroonga-enabled Postgres — validates that
 * the hits-CTE match path (metadata + author/narrator indexes) actually finds
 * and ranks books, which Drizzle mocks cannot catch.
 *
 * Gated: skipped unless SEARCH_INTEGRATION=1 and DB env vars are present.
 * Run with dev infra up:
 *   SEARCH_INTEGRATION=1 bun test --env-file=apps/server/.env \
 *     packages/api/src/infrastructure/search/pgroonga/__tests__/pgroonga.provider.integration.test.ts
 *
 * Isolation: everything hangs off a throwaway organization created in
 * beforeAll; afterAll deletes it and FK cascades remove every row.
 */
const enabled = process.env.SEARCH_INTEGRATION === "1";

describe.skipIf(!enabled)("pgroonga provider integration", () => {
	let db: typeof import("@nanahoshi-v2/db").db;
	let sql: typeof import("drizzle-orm").sql;
	let provider: import("../pgroonga.provider").PGroongaProvider;

	const orgId = `test-org-${crypto.randomUUID()}`;
	// Unique token so matches can never collide with pre-existing rows.
	const token = `zqx${crypto.randomUUID().slice(0, 8)}`;
	const seriesAlias = `${token}abbr`;
	let libraryId: number;
	let audioLibraryId: number;
	let exactId: number;
	let titledId: number;
	let describedId: number;
	let authoredId: number;
	let narratedId: number;
	let seriesId: number;

	beforeAll(async () => {
		({ db } = await import("@nanahoshi-v2/db"));
		({ sql } = await import("drizzle-orm"));
		const { PGroongaProvider } = await import("../pgroonga.provider");
		provider = new PGroongaProvider();
		const { runMigrations } = await import("@nanahoshi-v2/db/migrate");
		await runMigrations();

		await db.execute(sql`
			INSERT INTO organization (id, name, slug, created_at)
			VALUES (${orgId}, 'search-it-org', ${`search-it-${crypto.randomUUID()}`}, now())
		`);
		const lib = await db.execute(sql`
			INSERT INTO library (name, server_id, media_type, created_at)
			VALUES ('search-it-lib', ${orgId}, 'ebook', now()) RETURNING id
		`);
		libraryId = Number((lib.rows[0] as { id: number }).id);
		const audioLib = await db.execute(sql`
			INSERT INTO library (name, server_id, media_type, created_at)
			VALUES ('search-it-audio', ${orgId}, 'audiobook', now()) RETURNING id
		`);
		audioLibraryId = Number((audioLib.rows[0] as { id: number }).id);

		const insertBook = async (filename: string, libId: number) => {
			const r = await db.execute(sql`
				INSERT INTO book (filename, filehash, uuid, library_id, media_type, created_at)
				VALUES (${filename}, ${`hash-${filename}-${token}`}, ${crypto.randomUUID()}, ${libId}, 'ebook', now())
				RETURNING id
			`);
			return Number((r.rows[0] as { id: number }).id);
		};

		exactId = await insertBook("exact.epub", libraryId);
		titledId = await insertBook("titled.epub", libraryId);
		describedId = await insertBook("described.epub", libraryId);
		authoredId = await insertBook("authored.epub", libraryId);
		narratedId = await insertBook("narrated.m4b", audioLibraryId);

		await db.execute(sql`
			INSERT INTO book_metadata (book_id, title, description, language_code) VALUES
				(${exactId}, ${`${token} sorcery`}, NULL, 'ja'),
				(${titledId}, ${`${token} sorcery nights`}, 'unrelated text', 'en'),
				(${describedId}, 'everyday cooking', ${`a ${token} sorcery academy drama`}, 'fr'),
				(${authoredId}, 'plain title', 'plain description', NULL)
		`);
		const author = await db.execute(sql`
			INSERT INTO author (name, server_id) VALUES (${`${token} kuonji`}, ${orgId}) RETURNING id
		`);
		await db.execute(sql`
			INSERT INTO book_author (book_id, author_id)
			VALUES (${authoredId}, ${Number((author.rows[0] as { id: number }).id)})
		`);

		await db.execute(sql`
			INSERT INTO audiobook_metadata (book_id, title) VALUES (${narratedId}, 'audio plain title')
		`);
		const narrator = await db.execute(sql`
			INSERT INTO narrator (name, server_id) VALUES (${`${token} yukikaji`}, ${orgId}) RETURNING id
		`);
		await db.execute(sql`
			INSERT INTO book_narrator (book_id, narrator_id)
			VALUES (${narratedId}, ${Number((narrator.rows[0] as { id: number }).id)})
		`);

		const series = await db.execute(sql`
			INSERT INTO series (name, aliases, server_id)
			VALUES ('Canonical Alias Test Series', ARRAY[${seriesAlias}]::text[], ${orgId})
			RETURNING id
		`);
		seriesId = Number((series.rows[0] as { id: number }).id);
		await db.execute(sql`
			INSERT INTO book_series (book_id, series_id, position) VALUES
				(${exactId}, ${seriesId}, 1),
				(${titledId}, ${seriesId}, 2)
		`);
		await db.execute(sql`
			INSERT INTO audiobook_series (book_id, series_id, position)
			VALUES (${narratedId}, ${seriesId}, 1)
		`);
	});

	afterAll(async () => {
		if (!db) return;
		await db.execute(sql`
			DELETE FROM book_series
			WHERE series_id IN (SELECT id FROM series WHERE server_id = ${orgId})
		`);
		await db.execute(sql`
			DELETE FROM audiobook_series
			WHERE series_id IN (SELECT id FROM series WHERE server_id = ${orgId})
		`);
		await db.execute(sql`DELETE FROM organization WHERE id = ${orgId}`);
	});

	const search = (query: string, accessible: number[] | "ALL" = "ALL") =>
		provider.searchBooks({
			query,
			serverId: orgId,
			accessibleLibraryIds: accessible,
		});

	test("matches on title with the exact title ranked first", async () => {
		const { books, pagination } = await search(`${token} sorcery`);
		const titles = books.map((b) => b.title);
		expect(titles).toContain(`${token} sorcery nights`);
		expect(titles[0]).toBe(`${token} sorcery`);
		expect(pagination.totalHits).toBeGreaterThanOrEqual(2);
	});

	test("matches on description", async () => {
		const { books } = await search(`${token} sorcery academy`);
		expect(books.some((b) => b.title === "everyday cooking")).toBe(true);
	});

	test("matches on author name only", async () => {
		const { books } = await search(`${token} kuonji`);
		expect(books.length).toBe(1);
		expect(books[0]?.title).toBe("plain title");
	});

	test("scope restricted to another library hides everything", async () => {
		const { books } = await search(`${token} sorcery`, [audioLibraryId]);
		expect(books).toEqual([]);

		const { series } = await provider.searchSeries({
			query: seriesAlias,
			serverId: orgId,
			accessibleLibraryIds: [audioLibraryId],
		});
		expect(series).toEqual([]);

		const { authors } = await provider.searchAuthors({
			query: `${token} kuonji`,
			serverId: orgId,
			accessibleLibraryIds: [audioLibraryId],
		});
		expect(authors).toEqual([]);
	});

	test("full reindex documents retain their library scope", async () => {
		const { fetchAudiobooksForIndexBatch, fetchBooksForIndexBatch } =
			await import("../../search.document");
		const snapshotTime = new Date(Date.now() + 1_000);
		const [bookDoc] = await fetchBooksForIndexBatch({
			snapshotTime,
			lastId: exactId - 1,
			limit: 1,
		});
		const [audiobookDoc] = await fetchAudiobooksForIndexBatch({
			snapshotTime,
			lastId: narratedId - 1,
			limit: 1,
		});

		expect(bookDoc?.id).toBe(String(exactId));
		expect(bookDoc?.libraryId).toBe(libraryId);
		expect(audiobookDoc?.id).toBe(String(narratedId));
		expect(audiobookDoc?.libraryId).toBe(audioLibraryId);
	});

	test("audiobooks match on narrator name", async () => {
		const { audiobooks } = await provider.searchAudiobooks({
			query: `${token} yukikaji`,
			serverId: orgId,
			accessibleLibraryIds: "ALL",
		});
		expect(audiobooks.length).toBe(1);
		expect(audiobooks[0]?.title).toBe("audio plain title");
	});

	test("updates multi-value series aliases without expanding them as a SQL tuple", async () => {
		const { bookMetadataRepository } = await import(
			"../../../../routers/books/metadata/metadata.repository"
		);
		const aliases = [seriesAlias, `${token}second`];
		expect(
			await bookMetadataRepository.updateSeriesAliases(seriesId, aliases),
		).toBe(true);
		expect(
			await bookMetadataRepository.updateSeriesAliases(seriesId, aliases),
		).toBe(false);
	});

	test("series aliases find the canonical series and its linked items", async () => {
		const { series } = await provider.searchSeries({
			query: seriesAlias,
			serverId: orgId,
		});
		expect(series.map((item) => item.name)).toContain(
			"Canonical Alias Test Series",
		);

		const { books } = await search(seriesAlias);
		expect(books.map((item) => item.title)).toContain(`${token} sorcery`);

		const { audiobooks } = await provider.searchAudiobooks({
			query: seriesAlias,
			serverId: orgId,
			accessibleLibraryIds: "ALL",
		});
		expect(audiobooks.map((item) => item.title)).toContain("audio plain title");
	});

	test("no-query browse returns exact totals for the scoped catalog", async () => {
		const { books, pagination } = await search("");
		expect(pagination.totalHitsRelation).toBe("eq");
		expect(pagination.totalHits).toBe(4);
		expect(books.length).toBe(4);
	});

	// Regression: multi-value filters used `col = ANY(${array})`, which drizzle
	// renders as a record `($1, $2)` — a runtime error on every filtered search.
	test("multi-value language filter narrows browse and keeps totals exact", async () => {
		const { books, pagination } = await provider.searchBooks({
			query: "",
			serverId: orgId,
			accessibleLibraryIds: "ALL",
			filters: { languageCode: ["ja", "en"] },
		});
		expect(pagination.totalHits).toBe(2);
		expect(books.map((b) => b.title).sort()).toEqual([
			`${token} sorcery`,
			`${token} sorcery nights`,
		]);
	});

	test("language filter combines with a text query", async () => {
		const { books } = await provider.searchBooks({
			query: `${token} sorcery`,
			serverId: orgId,
			accessibleLibraryIds: "ALL",
			filters: { languageCode: ["en"] },
		});
		expect(books.map((b) => b.title)).toEqual([`${token} sorcery nights`]);
	});

	test("author filter matches via EXISTS and keeps the full author list", async () => {
		const { books, pagination } = await provider.searchBooks({
			query: "",
			serverId: orgId,
			accessibleLibraryIds: "ALL",
			filters: { authors: [`${token} kuonji`] },
		});
		expect(pagination.totalHits).toBe(1);
		expect(books[0]?.title).toBe("plain title");
		expect(books[0]?.authors.map((a) => a.name)).toContain(`${token} kuonji`);
	});

	test("catalog title sort pages alphabetically (index-driven branches)", async () => {
		const { bookRepository } = await import(
			"../../../../routers/books/book.repository"
		);
		const rows = await bookRepository.listAllBooks(orgId, "ALL", {
			mediaType: "all",
			limit: 10,
			offset: 0,
			sort: "title",
		});
		const titles = rows.map((r) => r.title);
		expect(titles.length).toBe(5);
		expect([...titles].sort()).toEqual(titles);
	});

	test("catalog quick-search matches substrings via the pgroonga ILIKE indexes", async () => {
		const { bookRepository } = await import(
			"../../../../routers/books/book.repository"
		);
		const rows = await bookRepository.listAllBooks(orgId, "ALL", {
			mediaType: "all",
			limit: 10,
			offset: 0,
			sort: "recent",
			query: `${token} sorcery`,
		});
		expect(rows.map((r) => r.title).sort()).toEqual([
			`${token} sorcery`,
			`${token} sorcery nights`,
		]);
		const count = await bookRepository.countAllBooks(orgId, "ALL", {
			mediaType: "all",
			query: `${token} sorcery`,
		});
		expect(count).toBe(2);
	});

	test("browse pagination pages without overlap", async () => {
		const page1 = await provider.searchBooks({
			query: "",
			serverId: orgId,
			accessibleLibraryIds: "ALL",
			limit: 2,
			offset: 0,
		});
		const page2 = await provider.searchBooks({
			query: "",
			serverId: orgId,
			accessibleLibraryIds: "ALL",
			limit: 2,
			offset: 2,
		});
		expect(page1.books.length).toBe(2);
		expect(page2.books.length).toBe(2);
		expect(page1.pagination.hasMore).toBe(true);
		expect(page2.pagination.hasMore).toBe(false);
		const uuids = [...page1.books, ...page2.books].map((b) => b.uuid);
		expect(new Set(uuids).size).toBe(4);
	});
});
