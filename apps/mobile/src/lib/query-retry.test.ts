import { describe, expect, test } from "bun:test";
import { ORPCError } from "@orpc/client";
import { shouldRetry } from "./query-retry";

describe("shouldRetry", () => {
	test("network failures get several more tries, then stop", () => {
		const error = new TypeError("Network request failed");
		expect([0, 1, 2, 3].map((count) => shouldRetry(count, error))).toEqual([
			true,
			true,
			true,
			false,
		]);
	});

	test("a server that is down or busy is asked again", () => {
		for (const status of [502, 503, 429, 408])
			expect(shouldRetry(0, new ORPCError("X", { status }))).toBe(true);
	});

	test("what the server refused is not asked again", () => {
		for (const code of [
			"UNAUTHORIZED",
			"FORBIDDEN",
			"NOT_FOUND",
			"BAD_REQUEST",
		])
			expect(shouldRetry(0, new ORPCError(code))).toBe(false);
	});
});
