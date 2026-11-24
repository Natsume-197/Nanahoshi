import { describe, expect, test } from "bun:test";
import { classifyMigrations } from "./migration-state";

describe("classifyMigrations", () => {
	const journal = [100, 200, 300];

	test("an empty database is fresh", () => {
		expect(classifyMigrations(journal, null)).toEqual({
			status: "fresh",
			pending: 3,
		});
	});

	test("counts what this release brings", () => {
		expect(classifyMigrations(journal, 100)).toEqual({
			status: "pending",
			pending: 2,
		});
		expect(classifyMigrations(journal, 300)).toEqual({
			status: "current",
			pending: 0,
		});
	});

	test("a database a newer release migrated is newer", () => {
		expect(classifyMigrations(journal, 400)).toEqual({
			status: "newer",
			pending: 0,
		});
	});
});
