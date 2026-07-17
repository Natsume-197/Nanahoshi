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
	let libraryId: number;
	let audioLibraryId: number;
	let exactId: number;
	let titledId: number;
	let describedId: number;
	let authoredId: number;
	let narratedId: number;

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
			INSERT INTO book_metadata (book_id, title, description) VALUES
				(${exactId}, ${`${token} sorcery`}, NULL),
				(${titledId}, ${`${token} sorcery nights`}, 'unrelated text'),
				(${describedId}, 'everyday cooking', ${`a ${token} sorcery academy drama`}),
				(${authoredId}, 'plain title', 'plain description')
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
	});

	afterAll(async () => {
		if (!db) return;
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

	test("no-query browse returns exact totals for the scoped catalog", async () => {
		const { books, pagination } = await search("");
		expect(pagination.totalHitsRelation).toBe("eq");
		expect(pagination.totalHits).toBe(4);
		expect(books.length).toBe(4);
	});
});
