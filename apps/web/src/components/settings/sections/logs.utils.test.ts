import { expect, test } from "bun:test";
import type { LogEntry } from "@nanahoshi-v2/api/lib/log-buffer";
import {
	filterLogEntries,
	formatLogContext,
	formatLogText,
} from "./logs.utils";

test("filters logs by local date, source, level and context, newest first", () => {
	const entry: LogEntry = {
		id: "1",
		timestamp: new Date(2026, 8, 12, 10).toISOString(),
		level: "error",
		source: "worker",
		message: "Failed to scan",
		context: { book: "Alice" },
	};
	const later = {
		...entry,
		id: "2",
		timestamp: new Date(2026, 8, 12, 11).toISOString(),
	};
	const filters = {
		query: " ALICE ",
		level: "error",
		source: "worker",
		date: "2026-09-12",
	} as const;
	expect(
		filterLogEntries([entry, later], filters).map((log) => log.id),
	).toEqual(["2", "1"]);
	expect(filterLogEntries([entry], { ...filters, date: "2026-09-11" })).toEqual(
		[],
	);
	expect(filterLogEntries([entry], { ...filters, source: "server" })).toEqual(
		[],
	);
	expect(filterLogEntries([entry], { ...filters, level: "info" })).toEqual([]);
	expect(filterLogEntries([entry], { ...filters, query: "missing" })).toEqual(
		[],
	);
});

test("renders error stacks as real lines and exports readable plain text", () => {
	const context = {
		err: {
			message: "Missing resource",
			stack: "Error: Missing resource\n    at scan (scanner.ts:10)",
		},
		count: 2,
	};
	const text = formatLogContext(context);
	expect(text).toContain("\n    at scan (scanner.ts:10)");
	expect(text).toContain("count: 2");
	expect(text).toStartWith("Error: Missing resource\n");
	expect(text).not.toContain("err:");
	expect(formatLogContext({})).toBe("");
	expect(
		formatLogText([
			{
				id: "1",
				timestamp: "2026-09-12T10:00:00Z",
				level: "error",
				source: "worker",
				message: "Failed",
				context,
			},
		]),
	).toContain("ERROR [worker] Failed\nError: Missing resource");
});
