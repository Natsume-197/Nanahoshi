import { beforeEach, describe, expect, mock, test } from "bun:test";

/**
 * Unit tests for SeriesRepository.rename — the server-scoped edit state machine
 * (ok / not_found / conflict) and that the UPDATE only fires on "ok".
 *
 * The Drizzle client is mocked: db.transaction runs the callback with a `tx`
 * whose two sequential selects resolve to `existingRows` then `clashRows`, and
 * whose update records whether it ran. Real schema/operators are used.
 *
 * Run with:
 *   bun test packages/api/src/routers/series/__tests__/series.repository.rename.test.ts
 */

let existingRows: Array<Record<string, unknown>> = [];
let clashRows: Array<Record<string, unknown>> = [];
let selectCall = 0;
let updateRan = false;

function makeSelectChain() {
	const idx = selectCall++;
	const chain = {} as Record<string, unknown> & {
		then: (resolve: (value: unknown) => unknown) => unknown;
	};
	chain.from = mock(() => chain);
	chain.where = mock(() => chain);
	chain.limit = mock(() => chain);
	// biome-ignore lint/suspicious/noThenProperty: emulates Drizzle's awaitable builder
	chain.then = (resolve: (value: unknown) => unknown) =>
		resolve(idx === 0 ? existingRows : clashRows);
	return chain;
}

function makeUpdateChain() {
	const chain = {} as Record<string, unknown>;
	chain.set = mock(() => chain);
	chain.where = mock(() => {
		updateRan = true;
		return Promise.resolve();
	});
	return chain;
}

const tx = { select: mock(makeSelectChain), update: mock(makeUpdateChain) };

mock.module("@nanahoshi-v2/db", () => ({
	db: { transaction: (cb: (t: typeof tx) => unknown) => cb(tx) },
}));

mock.module("@nanahoshi-v2/env/server", () => ({
	env: {
		DATABASE_URL: "postgres://mock",
		NAMESPACE_UUID: "00000000-0000-0000-0000-000000000000",
	},
}));

const { seriesRepository } = await import("../series.repository");

describe("SeriesRepository.rename", () => {
	beforeEach(() => {
		existingRows = [];
		clashRows = [];
		selectCall = 0;
		updateRan = false;
	});

	test("returns not_found when the series isn't in this server", async () => {
		existingRows = [];
		const result = await seriesRepository.rename(1, "server-1", "New Name");
		expect(result).toBe("not_found");
		expect(updateRan).toBe(false);
	});

	test("returns conflict when another series in the server has that name", async () => {
		existingRows = [{ id: 1 }];
		clashRows = [{ id: 2 }];
		const result = await seriesRepository.rename(1, "server-1", "Taken");
		expect(result).toBe("conflict");
		expect(updateRan).toBe(false);
	});

	test("renames and returns ok when found and no name clash", async () => {
		existingRows = [{ id: 1 }];
		clashRows = [];
		const result = await seriesRepository.rename(1, "server-1", "Fresh Name");
		expect(result).toBe("ok");
		expect(updateRan).toBe(true);
	});
});
