import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";

const executedQueries: unknown[] = [];
const mockExecute = mock((query: unknown) => {
	executedQueries.push(query);
	return Promise.resolve({ rows: [] });
});

mock.module("@nanahoshi-v2/db", () => ({
	db: { execute: mockExecute },
}));

const { RecommendationComputeRepository } = await import(
	"../recommendation-compute.repository"
);

function compile(query: unknown) {
	return new PgDialect().sqlToQuery(query as SQL);
}

function executedQueryAt(index: number): unknown {
	const query = executedQueries[index];
	if (query === undefined) throw new Error(`Missing executed query ${index}`);
	return query;
}

describe("RecommendationComputeRepository catalog key queries", () => {
	beforeEach(() => {
		executedQueries.length = 0;
		mockExecute.mockClear();
	});

	test("binds a large primary-author key set as one array", async () => {
		const repository = new RecommendationComputeRepository();
		const keys = Array.from({ length: 32_768 }, (_, index) => ({
			kind: "book" as const,
			id: index + 1,
		}));

		await repository.loadPrimaryAuthors("org-1", keys);

		expect(executedQueries).toHaveLength(1);
		const query = compile(executedQueryAt(0));
		expect(query.sql).toContain("unnest($1::bigint[])");
		expect(query.params).toHaveLength(1);
		expect(query.params[0]).toEqual(keys.map((key) => key.id));
	});

	test("binds recommendation title IDs as arrays", async () => {
		const repository = new RecommendationComputeRepository();

		await repository.loadRecommendationTitleKeys("org-1", [
			{ kind: "series", id: 10 },
			{ kind: "book", id: 20 },
			{ kind: "book", id: 21 },
		]);

		expect(executedQueries).toHaveLength(2);
		const seriesQuery = compile(executedQueryAt(0));
		const bookQuery = compile(executedQueryAt(1));
		expect(seriesQuery.sql).toContain("unnest($1::bigint[])");
		expect(seriesQuery.params).toEqual([[10], "org-1"]);
		expect(bookQuery.sql).toContain("unnest($1::bigint[])");
		expect(bookQuery.params).toEqual([[20, 21], "org-1"]);
	});
});
