import { beforeEach, describe, expect, mock, test } from "bun:test";

/**
 * Unit tests for NarratorRepository — list mapping and the count backing the
 * narrators page header.
 *
 * Run with:
 *   bun test packages/api/src/routers/narrators/__tests__/narrator.repository.test.ts
 */

let executeResult: { rows: Array<Record<string, unknown>> } = { rows: [] };
const mockExecute = mock(() => Promise.resolve(executeResult));

mock.module("@nanahoshi-v2/db", () => ({
	db: { execute: mockExecute },
}));

mock.module("@nanahoshi-v2/env/server", () => ({
	env: {
		DATABASE_URL: "postgres://mock",
		NAMESPACE_UUID: "00000000-0000-0000-0000-000000000000",
	},
}));

const { NarratorRepository } = await import("../narrator.repository");

describe("NarratorRepository.listWithAudiobookCount", () => {
	let repo: InstanceType<typeof NarratorRepository>;

	beforeEach(() => {
		repo = new NarratorRepository();
		mockExecute.mockClear();
	});

	test("maps rows to id/name/audiobookCount", async () => {
		executeResult = {
			rows: [{ id: 5, name: "Kana Hanazawa", audiobookCount: 12 }],
		};

		const result = await repo.listWithAudiobookCount("org-1", {
			limit: 30,
			offset: 0,
			sort: "books",
		});

		expect(mockExecute).toHaveBeenCalledTimes(1);
		expect(result).toEqual([
			{ id: 5, name: "Kana Hanazawa", audiobookCount: 12 },
		]);
	});

	test("runs a single query when given a search query", async () => {
		executeResult = { rows: [] };
		await repo.listWithAudiobookCount("org-1", {
			limit: 30,
			offset: 0,
			sort: "name",
			query: "kana",
		});
		expect(mockExecute).toHaveBeenCalledTimes(1);
	});
});

describe("NarratorRepository.count", () => {
	let repo: InstanceType<typeof NarratorRepository>;

	beforeEach(() => {
		repo = new NarratorRepository();
		mockExecute.mockClear();
	});

	test("returns the count from the first row", async () => {
		executeResult = { rows: [{ count: 18 }] };
		expect(await repo.count("org-1")).toBe(18);
	});

	test("returns 0 when there are no rows", async () => {
		executeResult = { rows: [] };
		expect(await repo.count("org-1")).toBe(0);
	});
});
