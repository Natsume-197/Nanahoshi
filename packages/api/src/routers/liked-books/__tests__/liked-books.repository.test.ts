import { beforeEach, describe, expect, mock, test } from "bun:test";

/**
 * Unit tests for LikedBooksRepository — focused on the server-side pagination,
 * sorting, search filter, and count that back the likes page.
 *
 * We mock the Drizzle client and the author batch-loader, but use the real
 * schema/operators so the query builds without a database.
 *
 * Run with:
 *   bun test packages/api/src/routers/liked-books/__tests__/liked-books.repository.test.ts
 */

// ─── Mock: Drizzle DB ────────────────────────────────────────────────────────
// `selectResult` is what an awaited query resolves to; `captured` records the
// arguments the chain received so we can assert pagination/order wiring.

let selectResult: Array<Record<string, unknown>> = [];
const captured: {
	where: unknown;
	orderBy: unknown;
	limit: unknown;
	offset: unknown;
	orderByCalls: number;
} = { where: null, orderBy: null, limit: null, offset: null, orderByCalls: 0 };

function createSelectChain() {
	const chain = {} as Record<string, unknown> & {
		then: (resolve: (value: unknown) => unknown) => unknown;
	};
	for (const method of ["from", "innerJoin", "leftJoin"]) {
		chain[method] = mock(() => chain);
	}
	chain.where = mock((condition: unknown) => {
		captured.where = condition;
		return chain;
	});
	chain.orderBy = mock((order: unknown) => {
		captured.orderBy = order;
		captured.orderByCalls += 1;
		return chain;
	});
	chain.limit = mock((n: unknown) => {
		captured.limit = n;
		return chain;
	});
	chain.offset = mock((n: unknown) => {
		captured.offset = n;
		return chain;
	});
	// Thenable: awaiting the chain at any terminal resolves the configured rows.
	// biome-ignore lint/suspicious/noThenProperty: mock emulates Drizzle's awaitable query builder
	chain.then = (resolve: (value: unknown) => unknown) => resolve(selectResult);
	return chain;
}

const mockSelect = mock(() => createSelectChain());

mock.module("@nanahoshi-v2/db", () => ({
	db: { select: mockSelect },
}));

// Spy on `ilike` (the search filter) while keeping every other drizzle operator
// real, so we can assert exactly when the query filter is applied.
const realDrizzle = await import("drizzle-orm");
const ilikeSpy = mock(realDrizzle.ilike);
mock.module("drizzle-orm", () => ({ ...realDrizzle, ilike: ilikeSpy }));

mock.module("@nanahoshi-v2/env/server", () => ({
	env: {
		DATABASE_URL: "postgres://mock",
		NAMESPACE_UUID: "00000000-0000-0000-0000-000000000000",
	},
}));

// Author hydration is exercised separately; here it just returns a known map.
const authorsMap = new Map<
	number,
	Array<{ id: number; name: string; role: string }>
>([[1, [{ id: 10, name: "Author One", role: "Author" }]]]);
mock.module("../../_shared/batch-loaders", () => ({
	batchLoaderRepository: {
		loadEbookAuthors: mock(() => Promise.resolve(authorsMap)),
	},
}));

const { LikedBooksRepository } = await import("../liked-books.repository");

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("LikedBooksRepository.listLiked", () => {
	let repo: InstanceType<typeof LikedBooksRepository>;

	beforeEach(() => {
		repo = new LikedBooksRepository();
		selectResult = [
			{
				bookId: 1,
				createdAt: "2024-01-01T00:00:00Z",
				bookUuid: "uuid-1",
				bookFilename: "one.epub",
				title: "One",
				cover: "covers/one.jpg",
				mainColor: null,
			},
		];
		captured.where = null;
		captured.orderBy = null;
		captured.limit = null;
		captured.offset = null;
		captured.orderByCalls = 0;
		mockSelect.mockClear();
		ilikeSpy.mockClear();
	});

	test("forwards limit and offset to the query (cursor pagination)", async () => {
		await repo.listLiked("user-1", "org-1", {
			limit: 30,
			offset: 60,
			sort: "recent",
		});

		expect(captured.limit).toBe(30);
		expect(captured.offset).toBe(60);
	});

	test("attaches authors from the batch loader onto each row", async () => {
		const result = await repo.listLiked("user-1", "org-1", {
			limit: 30,
			offset: 0,
			sort: "recent",
		});

		expect(result).toHaveLength(1);
		expect(result[0].authors).toEqual([
			{ id: 10, name: "Author One", role: "Author" },
		]);
	});

	test("applies an order for every sort mode without throwing", async () => {
		for (const sort of ["recent", "title", "author"] as const) {
			captured.orderByCalls = 0;
			await repo.listLiked("user-1", "org-1", { limit: 30, offset: 0, sort });
			expect(captured.orderByCalls).toBe(1);
			expect(captured.orderBy).toBeDefined();
		}
	});

	test("applies the ilike filter when a query is provided", async () => {
		await repo.listLiked("user-1", "org-1", {
			limit: 30,
			offset: 0,
			sort: "recent",
			query: "naruto",
		});

		// Title + filename are both matched.
		expect(ilikeSpy).toHaveBeenCalledTimes(2);
		expect(ilikeSpy.mock.calls[0][1]).toBe("%naruto%");
	});

	test("does not apply the ilike filter without a query", async () => {
		await repo.listLiked("user-1", "org-1", {
			limit: 30,
			offset: 0,
			sort: "recent",
		});

		expect(ilikeSpy).not.toHaveBeenCalled();
	});

	test("treats a whitespace-only query as no filter", async () => {
		await repo.listLiked("user-1", "org-1", {
			limit: 30,
			offset: 0,
			sort: "recent",
			query: "   ",
		});

		expect(ilikeSpy).not.toHaveBeenCalled();
	});
});

describe("LikedBooksRepository.count", () => {
	let repo: InstanceType<typeof LikedBooksRepository>;

	beforeEach(() => {
		repo = new LikedBooksRepository();
		mockSelect.mockClear();
	});

	test("returns the count from the first row", async () => {
		selectResult = [{ count: 42 }];
		const total = await repo.count("user-1", "org-1");
		expect(total).toBe(42);
	});

	test("returns 0 when there are no rows", async () => {
		selectResult = [];
		const total = await repo.count("user-1", "org-1");
		expect(total).toBe(0);
	});
});
