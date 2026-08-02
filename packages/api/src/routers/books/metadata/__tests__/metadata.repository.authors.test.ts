import { beforeEach, describe, expect, mock, test } from "bun:test";

/**
 * Unit tests for author identity in BookMetadataRepository: normalized-name
 * dedupe in replaceBookAuthors and the hierarchical (asin > normalized name)
 * upsertAuthor flow.
 *
 * We mock `@nanahoshi-v2/db` but import the real schema so conflict targets
 * reference actual Drizzle column objects.
 *
 * Run with:
 *   bun test packages/api/src/routers/books/metadata/__tests__/metadata.repository.authors.test.ts
 */

// ─── Mock: Drizzle DB ────────────────────────────────────────────────────────
// Per-call FIFO queues: each db.select()/insert()/update() shifts its result.

let selectResults: Array<Array<Record<string, unknown>>> = [];
let insertResults: Array<Array<Record<string, unknown>>> = [];
let updateResults: Array<Array<Record<string, unknown>>> = [];

/** Captured `values()` per insert call, in order. */
let insertedValues: unknown[] = [];
/** Captured onConflictDoUpdate config per insert call, in order. */
let conflictConfigs: unknown[] = [];

function thenableChain(result: () => unknown, methods: string[]) {
	const chain: Record<string, unknown> = {
		// biome-ignore lint/suspicious/noThenProperty: emulates Drizzle's awaitable builder
		then: (
			resolve: (v: unknown) => unknown,
			reject?: (e: unknown) => unknown,
		) => Promise.resolve().then(result).then(resolve, reject),
	};
	for (const m of methods) chain[m] = mock(() => chain);
	return chain;
}

const mockSelect = mock(() => {
	const result = selectResults.shift() ?? [];
	return thenableChain(
		() => result,
		["from", "where", "innerJoin", "leftJoin", "orderBy", "limit"],
	);
});

const mockInsert = mock(() => {
	const result = insertResults.shift() ?? [];
	const chain = thenableChain(
		() => result,
		["onConflictDoNothing", "returning"],
	) as Record<string, unknown>;
	chain.values = mock((v: unknown) => {
		insertedValues.push(v);
		return chain;
	});
	chain.onConflictDoUpdate = mock((config: unknown) => {
		conflictConfigs.push(config);
		return chain;
	});
	return chain;
});

const mockUpdate = mock(() => {
	const result = updateResults.shift() ?? [];
	return thenableChain(() => result, ["set", "where", "returning"]);
});

const mockDelete = mock(() =>
	thenableChain(() => ({ rowCount: 1 }), ["where"]),
);

mock.module("@nanahoshi-v2/db", () => ({
	db: {
		select: mockSelect,
		insert: mockInsert,
		update: mockUpdate,
		delete: mockDelete,
	},
}));

const { author } = await import("@nanahoshi-v2/db/schema/general");
const { normalizePersonName } = await import("../../../_shared/person-name");
const { bookMetadataRepository } = await import("../metadata.repository");

beforeEach(() => {
	selectResults = [];
	insertResults = [];
	updateResults = [];
	insertedValues = [];
	conflictConfigs = [];
	mockSelect.mockClear();
	mockInsert.mockClear();
	mockUpdate.mockClear();
	mockDelete.mockClear();
});

describe("upsertMetadata", () => {
	test("does not generate an empty conflict update for undefined or unknown fields", async () => {
		insertResults = [[]];
		selectResults = [[{ bookId: 41, title: null }]];

		const result = await bookMetadataRepository.upsertMetadata(41, {
			publisherId: undefined,
			providerId: "local-runtime-detail",
		});

		expect(insertedValues).toEqual([{ bookId: 41 }]);
		expect(conflictConfigs).toHaveLength(0);
		expect(result).toMatchObject({ bookId: 41 });
	});
});

describe("replaceBookAuthors", () => {
	test("spelling variants of the same person collapse to one author row", async () => {
		const normalized = normalizePersonName("入間 人間");
		selectResults = [
			[], // previous book_author links
			[], // existing authors by normalized name
		];
		insertResults = [
			[{ id: 11, nameNormalized: normalized }], // author upsert
			[], // book_author links insert
		];

		const result = await bookMetadataRepository.replaceBookAuthors(
			1,
			[{ name: "入間 人間" }, { name: "入間人間", role: "Author" }],
			"RANOBEDB",
			"server-1",
		);

		// one author row upserted for both variants
		const authorRows = insertedValues[0] as Array<Record<string, unknown>>;
		expect(authorRows).toHaveLength(1);
		expect(authorRows[0]?.serverId).toBe("server-1");
		// conflict target is the normalized identity, scoped to anonymous rows
		const config = conflictConfigs[0] as {
			target: unknown[];
			targetWhere: unknown;
		};
		expect(config.target).toEqual([author.serverId, author.nameNormalized]);
		expect(config.targetWhere).toBeDefined();
		// a single link, pointing at the single identity
		const linkRows = insertedValues[1] as Array<Record<string, unknown>>;
		expect(linkRows).toHaveLength(1);
		expect(linkRows[0]?.authorId).toBe(11);
		expect(result.authorIds).toEqual([11]);
	});

	test("existing identity is reused without inserting a new author", async () => {
		const normalized = normalizePersonName("川原 礫");
		selectResults = [
			[], // previous links
			[{ id: 7, nameNormalized: normalized }], // found by normalized name
		];
		insertResults = [
			[], // book_author links insert (no author insert happens)
		];

		const result = await bookMetadataRepository.replaceBookAuthors(
			2,
			[{ name: "川原　礫" }],
			"AMAZON",
			"server-1",
		);

		expect(result.authorIds).toEqual([7]);
		// only the links insert ran — no author insert
		expect(mockInsert).toHaveBeenCalledTimes(1);
		const linkRows = insertedValues[0] as Array<Record<string, unknown>>;
		expect(linkRows[0]?.authorId).toBe(7);
	});
});

describe("upsertAuthor", () => {
	test("asin lookup wins over name", async () => {
		selectResults = [[{ id: 3 }]]; // found by asin
		const id = await bookMetadataRepository.upsertAuthor(
			"川原 礫",
			"AMAZON",
			"server-1",
			"B00ASIN",
		);
		expect(id).toBe(3);
		expect(mockInsert).not.toHaveBeenCalled();
		expect(mockUpdate).not.toHaveBeenCalled();
	});

	test("new asin adopts the anonymous same-name row", async () => {
		selectResults = [[]]; // not found by asin
		updateResults = [[{ id: 5 }]]; // anonymous row adopted
		const id = await bookMetadataRepository.upsertAuthor(
			"入間人間",
			"AMAZON",
			"server-1",
			"B00ASIN",
		);
		expect(id).toBe(5);
		expect(mockUpdate).toHaveBeenCalledTimes(1);
		expect(mockInsert).not.toHaveBeenCalled();
	});

	test("name-only upsert attaches to any existing identity", async () => {
		selectResults = [[{ id: 9 }]]; // found by normalized name
		const id = await bookMetadataRepository.upsertAuthor(
			"入間　人間",
			"LOCAL",
			"server-1",
		);
		expect(id).toBe(9);
		expect(mockInsert).not.toHaveBeenCalled();
	});

	test("name-only upsert inserts an anonymous row when none exists", async () => {
		selectResults = [[]];
		insertResults = [[{ id: 12 }]];
		const id = await bookMetadataRepository.upsertAuthor(
			"新人作家",
			"LOCAL",
			"server-1",
		);
		expect(id).toBe(12);
		const config = conflictConfigs[0] as { target: unknown[] };
		expect(config.target).toEqual([author.serverId, author.nameNormalized]);
	});
});
