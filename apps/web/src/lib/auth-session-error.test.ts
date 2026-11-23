import { describe, expect, test } from "bun:test";
import {
	getSessionErrorKind,
	reachServer,
	resolveSessionLookup,
	SESSION_RATE_LIMIT_ERROR_CODE,
	SESSION_UNAVAILABLE_ERROR_CODE,
} from "./auth-session-error";

describe("session lookup errors", () => {
	test("keeps an unauthenticated success as a missing session", () => {
		expect(resolveSessionLookup({ data: null, error: null })).toBeNull();
	});

	test("preserves a 429 instead of treating it as a signed-out session", () => {
		expect(() =>
			resolveSessionLookup({ data: null, error: { status: 429 } }),
		).toThrow(SESSION_RATE_LIMIT_ERROR_CODE);
	});

	test("preserves other lookup failures as unavailable", () => {
		expect(() =>
			resolveSessionLookup({ data: null, error: { status: 503 } }),
		).toThrow(SESSION_UNAVAILABLE_ERROR_CODE);
	});

	test("recognizes serialized route errors for user feedback", () => {
		expect(
			getSessionErrorKind({ message: SESSION_RATE_LIMIT_ERROR_CODE }),
		).toBe("rate_limited");
		expect(
			getSessionErrorKind({ message: SESSION_UNAVAILABLE_ERROR_CODE }),
		).toBe("unavailable");
		expect(
			getSessionErrorKind({
				message: `Server function failed: ${SESSION_RATE_LIMIT_ERROR_CODE}`,
			}),
		).toBe("rate_limited");
		expect(getSessionErrorKind(new Error("unrelated"))).toBeNull();
	});
});

test("a server that doesn't answer is named as such, not as a fetch error", async () => {
	const error = await reachServer(() =>
		Promise.reject(new TypeError("Failed to fetch")),
	).catch((caught: unknown) => caught);
	expect(getSessionErrorKind(error)).toBe("unreachable");
	expect(await reachServer(() => Promise.resolve(42))).toBe(42);
});
