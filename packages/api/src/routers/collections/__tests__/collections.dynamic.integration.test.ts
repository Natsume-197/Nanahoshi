import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { DynamicCollectionDefinitionV1 } from "../collection-rules";

const enabled = process.env.DYNAMIC_COLLECTION_INTEGRATION === "1";

describe.skipIf(!enabled)("Dynamic Collections integration", () => {
	let db: typeof import("@nanahoshi-v2/db").db;
	let sql: typeof import("drizzle-orm").sql;
	let repository: typeof import("../collections.repository").collectionsRepository;
	const orgId = `dynamic-it-${crypto.randomUUID()}`;
	const token = `dyn${crypto.randomUUID().slice(0, 8)}`;
	let ebookLibraryId: number;
	let audioLibraryId: number;
	let firstBookId: number;

	beforeAll(async () => {
		({ db } = await import("@nanahoshi-v2/db"));
		({ sql } = await import("drizzle-orm"));
		({ collectionsRepository: repository } = await import(
			"../collections.repository"
		));
		const { runMigrations } = await import("@nanahoshi-v2/db/migrate");
		await runMigrations();
		await db.execute(
			sql`INSERT INTO organization (id, name, slug, created_at) VALUES (${orgId}, 'dynamic-it', ${orgId}, now())`,
		);
		const ebooks = await db.execute(
			sql`INSERT INTO library (name, server_id, media_type, created_at) VALUES ('ebooks', ${orgId}, 'ebook', now()) RETURNING id`,
		);
		const audio = await db.execute(
			sql`INSERT INTO library (name, server_id, media_type, created_at) VALUES ('audio', ${orgId}, 'audiobook', now()) RETURNING id`,
		);
		ebookLibraryId = Number((ebooks.rows[0] as { id: number }).id);
		audioLibraryId = Number((audio.rows[0] as { id: number }).id);
		const first = await insertBook("first.epub", ebookLibraryId, "ebook");
		firstBookId = first;
		const second = await insertBook("second.pdf", ebookLibraryId, "ebook");
		const audioBook = await insertBook(
			"third.m4b",
			audioLibraryId,
			"audiobook",
		);
		await db.execute(
			sql`INSERT INTO book_metadata (book_id, title, page_count) VALUES (${first}, ${`${token} short`}, 120), (${second}, ${`${token} long`}, 800)`,
		);
		await db.execute(
			sql`INSERT INTO audiobook_metadata (book_id, title, duration) VALUES (${audioBook}, ${`${token} audio`}, 3600)`,
		);
		const author = await db.execute(
			sql`INSERT INTO author (name, server_id) VALUES (${`${token} author`}, ${orgId}) RETURNING id`,
		);
		await db.execute(
			sql`INSERT INTO book_author (book_id, author_id) VALUES (${firstBookId}, ${Number((author.rows[0] as { id: number }).id)})`,
		);
	});

	async function insertBook(
		filename: string,
		libraryId: number,
		mediaType: string,
	) {
		const row = await db.execute(
			sql`INSERT INTO book (filename, filehash, uuid, library_id, media_type, created_at) VALUES (${filename}, ${`${token}-${filename}`}, ${crypto.randomUUID()}, ${libraryId}, ${mediaType}, now()) RETURNING id`,
		);
		return Number((row.rows[0] as { id: number }).id);
	}

	afterAll(async () => {
		if (db) await db.execute(sql`DELETE FROM organization WHERE id = ${orgId}`);
	});

	const definition: DynamicCollectionDefinitionV1 = {
		version: 1,
		root: {
			kind: "group",
			match: "all",
			children: [
				{ kind: "rule", field: "title", operator: "contains", value: token },
				{
					kind: "group",
					match: "any",
					children: [
						{ kind: "rule", field: "pageCount", operator: "lt", value: 300 },
						{
							kind: "rule",
							field: "mediaType",
							operator: "includesAny",
							value: ["audiobook"],
						},
					],
				},
			],
		},
		sort: [{ field: "title", direction: "asc" }],
	};

	test("executes nested rules across ebook and audiobook metadata", async () => {
		const rows = await repository.listDynamicItems(
			definition,
			{
				viewerId: "viewer",
				serverId: orgId,
				accessibleLibraryIds: "ALL",
				timeZone: "UTC",
			},
			{ limit: 10, offset: 0 },
		);
		expect(rows.map((row) => row.title)).toEqual([
			`${token} audio`,
			`${token} short`,
		]);
		expect(rows[0]?.totalHits).toBe(2);
	});

	test("enforces library scope before evaluating rules", async () => {
		const rows = await repository.listDynamicItems(
			definition,
			{
				viewerId: "viewer",
				serverId: orgId,
				accessibleLibraryIds: [audioLibraryId],
				timeZone: "UTC",
			},
			{ limit: 10, offset: 0 },
		);
		expect(rows.map((row) => row.title)).toEqual([`${token} audio`]);
		const empty = await repository.listDynamicItems(
			definition,
			{
				viewerId: "viewer",
				serverId: orgId,
				accessibleLibraryIds: [],
				timeZone: "UTC",
			},
			{ limit: 10, offset: 0 },
		);
		expect(empty).toEqual([]);
	});

	test("paginates deterministically with a total", async () => {
		const first = await repository.listDynamicItems(
			definition,
			{
				viewerId: "viewer",
				serverId: orgId,
				accessibleLibraryIds: "ALL",
				timeZone: "UTC",
			},
			{ limit: 1, offset: 0 },
		);
		const second = await repository.listDynamicItems(
			definition,
			{
				viewerId: "viewer",
				serverId: orgId,
				accessibleLibraryIds: "ALL",
				timeZone: "UTC",
			},
			{ limit: 1, offset: 1 },
		);
		expect(first[0]?.uuid).not.toBe(second[0]?.uuid);
		expect(first[0]?.totalHits).toBe(2);
		expect(second[0]?.totalHits).toBe(2);
	});

	test("evaluates missing personal state through joined fallback values", async () => {
		const rows = await repository.listDynamicItems(
			{
				version: 1,
				root: {
					kind: "group",
					match: "all",
					children: [
						{
							kind: "rule",
							field: "consumptionStatus",
							operator: "includesAny",
							value: ["unstarted"],
						},
						{ kind: "rule", field: "liked", operator: "isFalse" },
					],
				},
				sort: [{ field: "progressPercent", direction: "desc" }],
			},
			{
				viewerId: "viewer-without-state",
				serverId: orgId,
				accessibleLibraryIds: "ALL",
				timeZone: "UTC",
			},
			{ limit: 10, offset: 0 },
		);

		expect(rows).toHaveLength(3);
		expect(rows[0]?.totalHits).toBe(3);
	});

	test("returns only rule options backed by books in the viewer scope", async () => {
		const visible = await repository.listRuleOptions(
			"author",
			token,
			20,
			"viewer",
			orgId,
			[ebookLibraryId],
		);
		expect(visible.map((option) => option.label)).toEqual([`${token} author`]);
		const hidden = await repository.listRuleOptions(
			"author",
			token,
			20,
			"viewer",
			orgId,
			[audioLibraryId],
		);
		expect(hidden).toEqual([]);
	});
});
