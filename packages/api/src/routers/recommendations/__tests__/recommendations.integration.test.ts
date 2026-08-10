import { afterAll, beforeAll, describe, expect, test } from "bun:test";

/**
 * Integration test against a real Postgres — validates the LATERAL joins and
 * permission fail-closed behavior that Drizzle mocks cannot catch.
 *
 * Gated: skipped unless RECS_INTEGRATION=1 and DB env vars are present.
 * Run with dev infra up:
 *   RECS_INTEGRATION=1 bun test --env-file=apps/server/.env \
 *     packages/api/src/routers/recommendations/__tests__/recommendations.integration.test.ts
 *
 * Isolation: everything hangs off a throwaway organization + user created in
 * beforeAll; afterAll deletes them and FK cascades remove every row.
 */
const enabled = process.env.RECS_INTEGRATION === "1";

describe.skipIf(!enabled)("recommendations integration", () => {
	// dynamic imports so the DB pool is only created when the gate is open
	let db: typeof import("@nanahoshi-v2/db").db;
	let repo: typeof import("../recommendations.repository").recommendationsRepository;
	let sql: typeof import("drizzle-orm").sql;

	const orgId = `test-org-${crypto.randomUUID()}`;
	const userId = `test-user-${crypto.randomUUID()}`;
	let libraryId: number;
	let hiddenLibraryId: number;
	let seriesId: number;
	let vol1Id: number;
	let vol2Id: number;
	let standaloneId: number;
	let hiddenBookId: number;

	beforeAll(async () => {
		({ db } = await import("@nanahoshi-v2/db"));
		({ sql } = await import("drizzle-orm"));
		({ recommendationsRepository: repo } = await import(
			"../recommendations.repository"
		));
		const { runMigrations } = await import("@nanahoshi-v2/db/migrate");
		await runMigrations();

		await db.execute(sql`
			INSERT INTO organization (id, name, slug, created_at)
			VALUES (${orgId}, 'recs-it-org', ${`recs-it-${crypto.randomUUID()}`}, now())
		`);
		await db.execute(sql`
			INSERT INTO "user" (id, name, email, email_verified, username, created_at, updated_at)
			VALUES (${userId}, 'recs-it', ${`${userId}@test.local`}, true, ${userId}, now(), now())
		`);

		const lib = await db.execute(sql`
			INSERT INTO library (name, server_id, media_type, created_at)
			VALUES ('recs-it-lib', ${orgId}, 'ebook', now()) RETURNING id
		`);
		libraryId = Number((lib.rows[0] as { id: number }).id);
		const hiddenLib = await db.execute(sql`
			INSERT INTO library (name, server_id, media_type, created_at)
			VALUES ('recs-it-hidden', ${orgId}, 'ebook', now()) RETURNING id
		`);
		hiddenLibraryId = Number((hiddenLib.rows[0] as { id: number }).id);

		const insertBook = async (filename: string, libId: number) => {
			const r = await db.execute(sql`
				INSERT INTO book (filename, filehash, uuid, library_id, media_type, created_at)
				VALUES (${filename}, ${`hash-${filename}`}, ${crypto.randomUUID()}, ${libId}, 'ebook', now())
				RETURNING id, uuid
			`);
			return r.rows[0] as { id: number; uuid: string };
		};

		const v1 = await insertBook("series-vol1.epub", libraryId);
		const v2 = await insertBook("series-vol2.epub", libraryId);
		const st = await insertBook("standalone.epub", libraryId);
		const hb = await insertBook("hidden.epub", hiddenLibraryId);
		vol1Id = Number(v1.id);
		vol2Id = Number(v2.id);
		standaloneId = Number(st.id);
		hiddenBookId = Number(hb.id);

		for (const id of [vol1Id, vol2Id, standaloneId, hiddenBookId]) {
			await db.execute(sql`
				INSERT INTO book_metadata (book_id, title) VALUES (${id}, ${`Title ${id}`})
			`);
		}

		const s = await db.execute(sql`
			INSERT INTO series (name, server_id) VALUES ('recs-it-series', ${orgId}) RETURNING id
		`);
		seriesId = Number((s.rows[0] as { id: number }).id);
		await db.execute(sql`
			INSERT INTO book_series (series_id, book_id, position) VALUES
				(${seriesId}, ${vol1Id}, 1), (${seriesId}, ${vol2Id}, 2)
		`);

		// similarity: standalone → the series; reason ref = hidden book (inaccessible check)
		await db.execute(sql`
			INSERT INTO item_similarity (server_id, seed_kind, seed_id, cand_kind, cand_id, score, components, reason, computed_at)
			VALUES (${orgId}, 'book', ${standaloneId}, 'series', ${seriesId}, 0.8, '{"author":0.8}', 'same_author', now())
		`);
		await db.execute(sql`
			INSERT INTO work_popularity (server_id, kind, item_id, score, computed_at)
			VALUES (${orgId}, 'series', ${seriesId}, 0.5, now()), (${orgId}, 'book', ${standaloneId}, 0.9, now())
		`);
		await db.execute(sql`
			INSERT INTO user_mix (server_id, user_id, mix_index, anchor_kind, anchor_id, computed_at)
			VALUES (${orgId}, ${userId}, 0, 'book', ${standaloneId}, now())
		`);
		await db.execute(sql`
			INSERT INTO user_recommendation
				(server_id, user_id, kind, item_id, mix_index, score, rank, reason, reason_kind, reason_id, components, computed_at)
			VALUES
				(${orgId}, ${userId}, 'series', ${seriesId}, 0, 0.9, 0, 'because_you_liked', 'book', ${standaloneId}, '{}', now()),
				(${orgId}, ${userId}, 'book', ${hiddenBookId}, 0, 0.7, 1, 'same_author', 'book', ${hiddenBookId}, '{}', now())
		`);
	});

	afterAll(async () => {
		if (!db) return;
		await db.execute(sql`DELETE FROM organization WHERE id = ${orgId}`);
		await db.execute(sql`DELETE FROM "user" WHERE id = ${userId}`);
	});

	test("mix items resolve the first unread volume as representative", async () => {
		const rows = await repo.listMixItems(orgId, userId, "ALL", "all", 15);
		const seriesRow = rows.find((r) => r.kind === "series");
		expect(seriesRow).toBeDefined();
		expect(Number(seriesRow?.itemId)).toBe(seriesId);
		// vol 1 (position 1), not vol 2
		expect(seriesRow?.bookFilename).toBe("series-vol1.epub");
		expect(seriesRow?.reasonTitle).not.toBeNull();
	});

	test("completed volume shifts the representative to the next unread one", async () => {
		await db.execute(sql`
			INSERT INTO reading_progress (user_id, book_id, status, created_at)
			VALUES (${userId}, ${vol1Id}, 'completed', now())
		`);
		const rows = await repo.listMixItems(orgId, userId, "ALL", "all", 15);
		const seriesRow = rows.find((r) => r.kind === "series");
		expect(seriesRow?.bookFilename).toBe("series-vol2.epub");
		await db.execute(sql`
			DELETE FROM reading_progress WHERE user_id = ${userId} AND book_id = ${vol1Id}
		`);
	});

	test("empty scope fails closed: no rows at all", async () => {
		const rows = await repo.listMixItems(orgId, userId, [], "all", 15);
		expect(rows).toEqual([]);
	});

	test("restricted scope hides inaccessible works and their reason titles", async () => {
		const rows = await repo.listMixItems(orgId, userId, [libraryId], "all", 15);
		// the hidden-library book never appears as a candidate
		expect(rows.every((r) => Number(r.itemId) !== hiddenBookId)).toBe(true);
		// and a reason pointing at it resolves to null (generic reason downstream)
		const seriesRow = rows.find((r) => r.kind === "series");
		expect(seriesRow).toBeDefined();
	});

	test("format filter drops works without a representative in that format", async () => {
		const rows = await repo.listMixItems(
			orgId,
			userId,
			"ALL",
			"audiobooks",
			15,
		);
		expect(rows).toEqual([]);
	});

	test("listSimilar orders by score with popularity tiebreak and maps the seed title", async () => {
		const work = await repo.resolveWorkForBook(
			orgId,
			(await db.execute(sql`SELECT uuid FROM book WHERE id = ${standaloneId}`))
				.rows[0]?.uuid as string,
		);
		expect(work).toEqual({ kind: "book", id: standaloneId });
		const rows = await repo.listSimilar(
			orgId,
			userId,
			"ALL",
			work as { kind: "book"; id: number },
			"all",
			10,
		);
		expect(rows.length).toBe(1);
		expect(Number(rows[0]?.itemId)).toBe(seriesId);
		expect(rows[0]?.reasonTitle).toBe(`Title ${standaloneId}`);
	});

	test("topPopular respects scope", async () => {
		const all = await repo.topPopular(orgId, userId, "ALL", "all", 10);
		expect(all.length).toBeGreaterThan(0);
		const none = await repo.topPopular(orgId, userId, [], "all", 10);
		expect(none).toEqual([]);
	});

	test("topPopular orders by score desc and honors the requested limit", async () => {
		// standalone (0.9) outranks the series (0.5)
		const rows = await repo.topPopular(orgId, userId, "ALL", "all", 10);
		const scores = rows.map((r) => r.score);
		expect(scores).toEqual([...scores].sort((a, b) => b - a));
		expect(Number(rows[0]?.itemId)).toBe(standaloneId);

		const limited = await repo.topPopular(orgId, userId, "ALL", "all", 1);
		expect(limited.length).toBe(1);
		expect(Number(limited[0]?.itemId)).toBe(standaloneId);
	});

	test("topPopular format filter survives the overscan pre-limit", async () => {
		// every seeded work is ebook-only; the pre-limit must not let an
		// audiobook-less work slip past the lateral's format filter
		const rows = await repo.topPopular(orgId, userId, "ALL", "audiobooks", 10);
		expect(rows).toEqual([]);
	});

	test("continueSeries surfaces the next volume after completing the previous one", async () => {
		await db.execute(sql`
			INSERT INTO reading_progress (user_id, book_id, status, created_at)
			VALUES (${userId}, ${vol1Id}, 'completed', now())
		`);
		try {
			const rows = await repo.listContinueSeries(
				orgId,
				userId,
				"ALL",
				"all",
				10,
			);
			expect(rows.length).toBe(1);
			expect(rows[0]?.bookFilename).toBe("series-vol2.epub");
			expect(rows[0]?.seriesName).toBe("recs-it-series");
			expect(Number(rows[0]?.nextPosition)).toBe(2);
		} finally {
			await db.execute(sql`
				DELETE FROM reading_progress WHERE user_id = ${userId} AND book_id = ${vol1Id}
			`);
		}
	});

	test("continueSeries counts a shelf 'completed' as finished, without progress rows", async () => {
		await db.execute(sql`
			INSERT INTO user_book_shelf (user_id, book_id, status)
			VALUES (${userId}, ${vol1Id}, 'completed')
		`);
		try {
			const rows = await repo.listContinueSeries(
				orgId,
				userId,
				"ALL",
				"all",
				10,
			);
			expect(rows.length).toBe(1);
			expect(rows[0]?.bookFilename).toBe("series-vol2.epub");
		} finally {
			await db.execute(sql`
				DELETE FROM user_book_shelf WHERE user_id = ${userId} AND book_id = ${vol1Id}
			`);
		}
	});

	test("a shelf placement without progress rows seeds the session boost", async () => {
		await db.execute(sql`
			INSERT INTO user_book_shelf (user_id, book_id, status)
			VALUES (${userId}, ${standaloneId}, 'completed')
		`);
		try {
			const seeds = await repo.loadRecentPositiveSeeds(orgId, userId, 10);
			expect(seeds).toEqual([
				{ kind: "book", itemId: standaloneId, atMs: expect.any(Number) },
			]);
		} finally {
			await db.execute(sql`
				DELETE FROM user_book_shelf WHERE user_id = ${userId} AND book_id = ${standaloneId}
			`);
		}
	});

	test("continueSeries hides a next volume the user already started", async () => {
		await db.execute(sql`
			INSERT INTO reading_progress (user_id, book_id, status, created_at)
			VALUES (${userId}, ${vol1Id}, 'completed', now())
		`);
		await db.execute(sql`
			INSERT INTO reading_progress (user_id, book_id, status, explored_char_count, created_at)
			VALUES (${userId}, ${vol2Id}, 'reading', 100, now())
		`);
		try {
			const rows = await repo.listContinueSeries(
				orgId,
				userId,
				"ALL",
				"all",
				10,
			);
			expect(rows).toEqual([]);
		} finally {
			await db.execute(sql`
				DELETE FROM reading_progress WHERE user_id = ${userId}
					AND book_id IN (${vol1Id}, ${vol2Id})
			`);
		}
	});

	test("continueSeries hides series marked not interested", async () => {
		await db.execute(sql`
			INSERT INTO reading_progress (user_id, book_id, status, created_at)
			VALUES (${userId}, ${vol1Id}, 'completed', now())
		`);
		await db.execute(sql`
			INSERT INTO user_recommendation_feedback (server_id, user_id, kind, item_id, type)
			VALUES (${orgId}, ${userId}, 'series', ${seriesId}, 'not_interested')
		`);
		try {
			const rows = await repo.listContinueSeries(
				orgId,
				userId,
				"ALL",
				"all",
				10,
			);
			expect(rows).toEqual([]);
		} finally {
			await db.execute(sql`
				DELETE FROM reading_progress WHERE user_id = ${userId} AND book_id = ${vol1Id}
			`);
			await db.execute(sql`
				DELETE FROM user_recommendation_feedback
				WHERE server_id = ${orgId} AND user_id = ${userId}
			`);
		}
	});

	test("continueSeries yields nothing after the final volume, and fails closed on scope", async () => {
		await db.execute(sql`
			INSERT INTO reading_progress (user_id, book_id, status, created_at)
			VALUES (${userId}, ${vol2Id}, 'completed', now())
		`);
		try {
			// vol2 is the last volume — no next to suggest
			const done = await repo.listContinueSeries(
				orgId,
				userId,
				"ALL",
				"all",
				10,
			);
			expect(done).toEqual([]);
		} finally {
			await db.execute(sql`
				DELETE FROM reading_progress WHERE user_id = ${userId} AND book_id = ${vol2Id}
			`);
		}

		await db.execute(sql`
			INSERT INTO reading_progress (user_id, book_id, status, created_at)
			VALUES (${userId}, ${vol1Id}, 'completed', now())
		`);
		try {
			const none = await repo.listContinueSeries(orgId, userId, [], "all", 10);
			expect(none).toEqual([]);
			const wrongLib = await repo.listContinueSeries(
				orgId,
				userId,
				[hiddenLibraryId],
				"all",
				10,
			);
			expect(wrongLib).toEqual([]);
		} finally {
			await db.execute(sql`
				DELETE FROM reading_progress WHERE user_id = ${userId} AND book_id = ${vol1Id}
			`);
		}
	});

	test("continueSeries format filter excludes ebook-only series from the audiobook rail", async () => {
		await db.execute(sql`
			INSERT INTO reading_progress (user_id, book_id, status, created_at)
			VALUES (${userId}, ${vol1Id}, 'completed', now())
		`);
		try {
			const rows = await repo.listContinueSeries(
				orgId,
				userId,
				"ALL",
				"audiobooks",
				10,
			);
			expect(rows).toEqual([]);
		} finally {
			await db.execute(sql`
				DELETE FROM reading_progress WHERE user_id = ${userId} AND book_id = ${vol1Id}
			`);
		}
	});

	test("topPopular hides inaccessible works after the pre-limit", async () => {
		// scope excludes the standalone's library → its popular row is dropped
		// by the lateral even though it pre-limits into x by score
		const rows = await repo.topPopular(orgId, userId, [libraryId], "all", 10);
		expect(rows.every((r) => Number(r.itemId) !== standaloneId)).toBe(false);
		const seriesOnly = await repo.topPopular(
			orgId,
			userId,
			[hiddenLibraryId],
			"all",
			10,
		);
		expect(seriesOnly.every((r) => Number(r.itemId) !== standaloneId)).toBe(
			true,
		);
	});
});
