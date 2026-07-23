import { afterAll, beforeAll, describe, expect, test } from "bun:test";

/**
 * Integration test against a real PGroonga-enabled Postgres — validates the
 * volume-aware relevance ranking: series matches come out in volume order,
 * a trailing number in the query boosts that volume, unnumbered first volumes
 * lead only when the series has no explicit volume 1, and title matches
 * outweigh description-only matches.
 *
 * Gated: skipped unless SEARCH_INTEGRATION=1 and DB env vars are present.
 * Run with dev infra up:
 *   SEARCH_INTEGRATION=1 bun test --env-file=apps/server/.env \
 *     packages/api/src/infrastructure/search/pgroonga/__tests__/pgroonga.volume-ranking.integration.test.ts
 */
const enabled = process.env.SEARCH_INTEGRATION === "1";

describe.skipIf(!enabled)("pgroonga volume-aware ranking integration", () => {
	let db: typeof import("@nanahoshi-v2/db").db;
	let sql: typeof import("drizzle-orm").sql;
	let provider: import("../pgroonga.provider").PGroongaProvider;

	const orgId = `test-org-${crypto.randomUUID()}`;
	// Unique token so matches can never collide with pre-existing rows.
	const token = `zqv${crypto.randomUUID().slice(0, 8)}`;
	let libraryId: number;
	let nullFirstId: number;
	let extraId: number;
	let vol9Id: number;
	let reZeroTitles: string[];

	// Titles deliberately avoid the series-name tokens so books are reached
	// through the series match alone.
	const insertSeriesWithBooks = async (
		seriesName: string,
		books: { title: string; position: number | null }[],
		aliases: string[] = [],
	) => {
		const aliasesArray = sql`ARRAY[${sql.join(
			aliases.map((alias) => sql`${alias}`),
			sql`, `,
		)}]::text[]`;
		const series = await db.execute(sql`
			INSERT INTO series (name, aliases, server_id)
			VALUES (${seriesName}, ${aliasesArray}, ${orgId})
			RETURNING id
		`);
		const seriesId = Number((series.rows[0] as { id: number }).id);
		const ids: number[] = [];
		for (const [index, bookSpec] of books.entries()) {
			// Later volumes get newer created_at so recency ordering would come
			// out reversed — proves position drives the order.
			const r = await db.execute(sql`
				INSERT INTO book (filename, filehash, uuid, library_id, media_type, created_at)
				VALUES (${`${bookSpec.title}.epub`}, ${`hash-${crypto.randomUUID()}`},
					${crypto.randomUUID()}, ${libraryId}, 'ebook',
					now() + make_interval(mins => ${index}))
				RETURNING id
			`);
			const bookId = Number((r.rows[0] as { id: number }).id);
			ids.push(bookId);
			await db.execute(sql`
				INSERT INTO book_metadata (book_id, title) VALUES (${bookId}, ${bookSpec.title})
			`);
			await db.execute(sql`
				INSERT INTO book_series (book_id, series_id, position)
				VALUES (${bookId}, ${seriesId}, ${bookSpec.position})
			`);
		}
		return ids;
	};

	beforeAll(async () => {
		({ db } = await import("@nanahoshi-v2/db"));
		({ sql } = await import("drizzle-orm"));
		const { PGroongaProvider } = await import("../pgroonga.provider");
		provider = new PGroongaProvider();
		const { runMigrations } = await import("@nanahoshi-v2/db/migrate");
		await runMigrations();

		await db.execute(sql`
			INSERT INTO organization (id, name, slug, created_at)
			VALUES (${orgId}, 'volume-it-org', ${`volume-it-${crypto.randomUUID()}`}, now())
		`);
		const lib = await db.execute(sql`
			INSERT INTO library (name, server_id, media_type, created_at)
			VALUES ('volume-it-lib', ${orgId}, 'ebook', now()) RETURNING id
		`);
		libraryId = Number((lib.rows[0] as { id: number }).id);

		// Fully numbered series, inserted out of order.
		const volserIds = await insertSeriesWithBooks(`${token} volser`, [
			{ title: `${token}vs third`, position: 3 },
			{ title: `${token}vs first`, position: 1 },
			{ title: `${token}vs second`, position: 2 },
		]);
		// Regression: a volume whose description repeats the series tokens (and
		// carries a rating) gets a higher weighted score — volume order must
		// still win inside a matched series (real-world "konosuba" bug).
		await db.execute(sql`
			UPDATE book_metadata
			SET description = ${`${token} volser saga: ${token} volser returns to ${token} volser`},
				rating = 4.8
			WHERE book_id = ${volserIds[0]}
		`);

		// First volume carries no number — no explicit volume 1 exists.
		[nullFirstId] = await insertSeriesWithBooks(`${token} nullser`, [
			{ title: `${token}ns origins`, position: null },
			{ title: `${token}ns second`, position: 2 },
			{ title: `${token}ns third`, position: 3 },
		]);

		// Explicit volume 1 exists — the unnumbered entry is an extra.
		const extraIds = await insertSeriesWithBooks(`${token} extraser`, [
			{ title: `${token}ex sidestory`, position: null },
			{ title: `${token}ex first`, position: 1 },
			{ title: `${token}ex second`, position: 2 },
		]);
		extraId = extraIds[0] as number;

		// Positions drift from printed volume numbers (real konosuba: a side
		// story sits at position 9, so "(9)" lands at position 10) and a bad
		// enrichment merge copied the sibling's romaji onto the extra.
		const driftIds = await insertSeriesWithBooks(`${token} driftser`, [
			{ title: `${token}df (8)`, position: 8 },
			{ title: `${token}df kamen sidestory II`, position: 9 },
			{ title: `${token}df (9)`, position: 10 },
			{ title: `${token}df anthology aka`, position: 11 },
		]);
		vol9Id = driftIds[2] as number;
		await db.execute(sql`
			UPDATE book_metadata SET title_romaji = 'Driftser 9 Sidestory'
			WHERE title = ${`${token}df anthology aka`}
		`);

		// Merged sub-series: two entries print the same volume number at the
		// same position; the unqualified (shortest) title is the canonical one.
		// Full-width digits/periods must normalize.
		await insertSeriesWithBooks(`${token} mergeser`, [
			{ title: `${token}mg 3nensei-hen 4`, position: 4 },
			{ title: `${token}mg 4`, position: 4 },
			{ title: `${token}mg ４．５`, position: 4.5 },
		]);

		// Mirrors every distinct position currently present in the local Re:Zero
		// collection. Its romanized alias deliberately uses punctuation while the
		// user query uses spaces, the regression found in the real catalog.
		const reZeroPositions = [
			...Array.from({ length: 29 }, (_, index) => index + 1),
			33,
			34,
			35,
			36,
			37,
			38,
			39,
			41,
			42,
		];
		reZeroTitles = reZeroPositions.map(
			(position) => `${token}rz volume ${position}`,
		);
		await insertSeriesWithBooks(
			`${token} Re:ゼロから始める異世界生活`,
			reZeroPositions.map((position, index) => ({
				title: reZeroTitles[index] as string,
				position,
			})),
			[`Re: Zero ${token} kara Hajimeru Isekai Seikatsu`],
		);

		// Weighted scoring: title hit must outrank a description-only hit even
		// though the description book is newer.
		const titled = await db.execute(sql`
			INSERT INTO book (filename, filehash, uuid, library_id, media_type, created_at)
			VALUES ('weight-title.epub', ${`hash-${crypto.randomUUID()}`},
				${crypto.randomUUID()}, ${libraryId}, 'ebook', now())
			RETURNING id
		`);
		await db.execute(sql`
			INSERT INTO book_metadata (book_id, title)
			VALUES (${Number((titled.rows[0] as { id: number }).id)}, ${`${token} weighttest alpha`})
		`);
		const described = await db.execute(sql`
			INSERT INTO book (filename, filehash, uuid, library_id, media_type, created_at)
			VALUES ('weight-desc.epub', ${`hash-${crypto.randomUUID()}`},
				${crypto.randomUUID()}, ${libraryId}, 'ebook', now() + interval '1 hour')
			RETURNING id
		`);
		await db.execute(sql`
			INSERT INTO book_metadata (book_id, title, description)
			VALUES (${Number((described.rows[0] as { id: number }).id)}, 'unrelated cooking',
				${`mentions ${token} weighttest in passing`})
		`);
	});

	afterAll(async () => {
		if (!db) return;
		await db.execute(sql`
			DELETE FROM book_series
			WHERE series_id IN (SELECT id FROM series WHERE server_id = ${orgId})
		`);
		await db.execute(sql`DELETE FROM organization WHERE id = ${orgId}`);
	});

	const search = (query: string) =>
		provider.searchBooks({
			query,
			serverId: orgId,
			accessibleLibraryIds: "ALL",
			limit: 50,
		});

	test("series match returns volumes in position order, not recency", async () => {
		const { books } = await search(`${token} volser`);
		expect(books.map((b) => b.title)).toEqual([
			`${token}vs first`,
			`${token}vs second`,
			`${token}vs third`,
		]);
	});

	test("trailing number boosts that volume to the top", async () => {
		const { books } = await search(`${token} volser 2`);
		expect(books[0]?.title).toBe(`${token}vs second`);
		expect(books.map((b) => b.title)).toEqual([
			`${token}vs second`,
			`${token}vs first`,
			`${token}vs third`,
		]);
	});

	test("unnumbered entry leads when the series has no explicit volume 1", async () => {
		const { books } = await search(`${token} nullser`);
		expect(books.map((b) => b.title)).toEqual([
			`${token}ns origins`,
			`${token}ns second`,
			`${token}ns third`,
		]);
	});

	test("querying volume 1 boosts the unnumbered first volume", async () => {
		const { books } = await search(`${token} nullser 1`);
		expect(books[0]?.title).toBe(`${token}ns origins`);
	});

	test("unnumbered entry sorts last when an explicit volume 1 exists", async () => {
		const { books } = await search(`${token} extraser`);
		expect(books.map((b) => b.title)).toEqual([
			`${token}ex first`,
			`${token}ex second`,
			`${token}ex sidestory`,
		]);
	});

	test("title number beats a drifted series position", async () => {
		// Position 9 is a side story; the printed "(9)" sits at position 10.
		const { books } = await search(`${token} driftser 9`);
		expect(books[0]?.title).toBe(`${token}df (9)`);
	});

	test("native title number beats a corrupted romaji number", async () => {
		const { books } = await search(`${token} driftser 9`);
		const titles = books.map((b) => b.title);
		expect(titles.indexOf(`${token}df (9)`)).toBeLessThan(
			titles.indexOf(`${token}df anthology aka`),
		);
	});

	test("unqualified title wins among duplicate volume numbers", async () => {
		const { books } = await search(`${token} mergeser 4`);
		expect(books[0]?.title).toBe(`${token}mg 4`);
	});

	test("full-width digits and periods normalize for decimal volumes", async () => {
		const { books } = await search(`${token} mergeser 4.5`);
		expect(books[0]?.title).toBe(`${token}mg ４．５`);
	});

	test("Re:Zero spaced query orders every volume through its punctuated alias", async () => {
		const { books } = await search(`re zero ${token}`);
		expect(books.map((book) => book.title)).toEqual(reZeroTitles);
	});

	test("Re:Zero explicit volume leads and keeps every other volume ordered", async () => {
		const { books } = await search(`re zero ${token} 20`);
		expect(books.map((book) => book.title)).toEqual([
			`${token}rz volume 20`,
			...reZeroTitles.filter((title) => title !== `${token}rz volume 20`),
		]);
	});

	test("title match outranks a newer description-only match", async () => {
		const { books } = await search(`${token} weighttest`);
		expect(books.map((b) => b.title)).toEqual([
			`${token} weighttest alpha`,
			"unrelated cooking",
		]);
	});

	test("index documents expose the effective seriesPosition", async () => {
		const { fetchBooksForIndexBatch } = await import("../../search.document");
		const snapshotTime = new Date(Date.now() + 7_200_000);
		const [nullFirstDoc] = await fetchBooksForIndexBatch({
			snapshotTime,
			lastId: nullFirstId - 1,
			limit: 1,
		});
		const [extraDoc] = await fetchBooksForIndexBatch({
			snapshotTime,
			lastId: extraId - 1,
			limit: 1,
		});
		// No explicit volume 1 in its series → the unnumbered entry counts as 1.
		expect(nullFirstDoc?.seriesPosition).toBe(1);
		// No number in the title → titleVolume stays null.
		expect(nullFirstDoc?.titleVolume).toBe(null);
		// Explicit volume 1 exists → the unnumbered extra stays null.
		expect(extraDoc?.seriesPosition).toBe(null);

		const [vol9Doc] = await fetchBooksForIndexBatch({
			snapshotTime,
			lastId: vol9Id - 1,
			limit: 1,
		});
		// The printed number, not the drifted position, lands in titleVolume.
		expect(vol9Doc?.titleVolume).toBe(9);
		expect(vol9Doc?.seriesPosition).toBe(10);
	});
});
