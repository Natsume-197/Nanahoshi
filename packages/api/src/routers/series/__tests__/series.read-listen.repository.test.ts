import { expect, mock, test } from "bun:test";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";

let executed: SQL;
mock.module("@nanahoshi-v2/db", () => ({
	db: {
		execute: async (query: SQL) => {
			executed = query;
			return { rows: [{ total: 0, items: [] }] };
		},
	},
}));
const { SeriesRepository } = await import("../series.repository");
const repo = new SeriesRepository();

test("Read & Listen scopes both publications and counts volumes without multiplying pairs", async () => {
	await repo.listReadListen("server-1", [7, 9], {
		query: "  100% ' saga  ",
		cursor: 30,
		sort: "books",
	});
	const { sql, params } = new PgDialect().sqlToQuery(executed);
	expect(sql).toContain("rp.server_id =");
	expect(sql).toContain("s.server_id =");
	expect(sql).toContain("al.server_id =");
	expect(sql).toContain("b.library_id IN");
	expect(sql).toContain("audio.library_id IN");
	expect(sql).toContain("b.duplicate_of_book_id IS NULL");
	expect(sql).toContain("audio.duplicate_of_book_id IS NULL");
	expect(sql).toContain("EXISTS (");
	expect(sql).toContain('COUNT(*) FILTER (WHERE paired)::int AS "pairedCount"');
	expect(sql).toContain("HAVING bool_or(paired)");
	expect(sql).toContain('ORDER BY "bookCount" DESC, s.name ASC, s.uuid');
	expect(sql).toContain("strpos(lower(s.name), lower(");
	expect(sql).not.toContain("100%");
	expect(params).toContain("100% ' saga");
	expect(params.slice(-2)).toEqual([30, 30]);
});

test("empty access scope fails closed for both media, and empty pages retain a total", async () => {
	expect(
		await repo.listReadListen("server-1", [], { uuid: "series-id" }),
	).toEqual({ total: 0, items: [] });
	const { sql, params } = new PgDialect().sqlToQuery(executed);
	expect(sql.match(/AND false/g)).toHaveLength(4);
	expect(sql).toContain("AND s.uuid =");
	expect(params).toContain("series-id");
	expect(sql).toContain("SELECT COUNT(*)::int FROM available");
});
