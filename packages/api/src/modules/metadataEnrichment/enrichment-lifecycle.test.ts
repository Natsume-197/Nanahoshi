import { describe, expect, test } from "bun:test";
import {
	type EnrichmentLifecycle,
	LIFECYCLE_BUCKET,
	type LifecycleRow,
	resolveBucket,
	resolveLifecycle,
} from "./enrichment-lifecycle";

const base: LifecycleRow = {
	status: "pending",
	nextRetryAt: null,
	providerAttempts: 0,
	hasFailures: false,
	decision: null,
};

function row(overrides: Partial<LifecycleRow>): LifecycleRow {
	return { ...base, ...overrides };
}

describe("resolveLifecycle — one label per row", () => {
	test("pending with no signals is running", () => {
		expect(resolveLifecycle(row({ status: "pending" }))).toBe("running");
	});

	test("enriched is done", () => {
		expect(resolveLifecycle(row({ status: "enriched" }))).toBe("done");
	});

	test("review awaits human sign-off", () => {
		expect(resolveLifecycle(row({ status: "review" }))).toBe("review");
	});

	test("no_match needs attention", () => {
		expect(resolveLifecycle(row({ status: "no_match" }))).toBe("no_match");
	});

	test("an ambiguous no-match is presented as unresolved", () => {
		expect(
			resolveLifecycle(
				row({
					status: "no_match",
					decision: { kind: "ambiguous", candidates: [] },
				}),
			),
		).toBe("unresolved");
	});

	test("partial match is its own attention state", () => {
		expect(resolveLifecycle(row({ status: "partial" }))).toBe("partial");
	});

	test("pending with exhausted provider attempts and failures is failed", () => {
		expect(
			resolveLifecycle(
				row({ status: "pending", providerAttempts: 3, hasFailures: true }),
			),
		).toBe("failed");
	});

	test("failed requires BOTH exhausted attempts and failures", () => {
		expect(
			resolveLifecycle(
				row({ status: "pending", providerAttempts: 3, hasFailures: false }),
			),
		).toBe("running");
		expect(
			resolveLifecycle(
				row({ status: "pending", providerAttempts: 2, hasFailures: true }),
			),
		).toBe("running");
	});

	test("a scheduled retry is surfaced as scheduled", () => {
		expect(
			resolveLifecycle(
				row({ status: "pending", nextRetryAt: "2026-07-24T00:00:00Z" }),
			),
		).toBe("scheduled");
	});
});

describe("precedence — the contradiction fixes", () => {
	test("scheduled retry outranks the exhausted-failure signal", () => {
		expect(
			resolveLifecycle(
				row({
					status: "pending",
					nextRetryAt: "2026-07-24T00:00:00Z",
					providerAttempts: 3,
					hasFailures: true,
				}),
			),
		).toBe("scheduled");
	});

	test("partial with exhausted failures stays partial, not failed", () => {
		// A partial match is a real result; exhausted provider retries must not
		// mislabel it as a total failure.
		expect(
			resolveLifecycle(
				row({ status: "partial", providerAttempts: 3, hasFailures: true }),
			),
		).toBe("partial");
	});

	test("review outranks failed", () => {
		expect(
			resolveLifecycle(
				row({ status: "review", providerAttempts: 3, hasFailures: true }),
			),
		).toBe("review");
	});
});

describe("bucket mapping", () => {
	test("every lifecycle maps to a bucket", () => {
		const lifecycles: EnrichmentLifecycle[] = [
			"scheduled",
			"review",
			"unresolved",
			"no_match",
			"partial",
			"failed",
			"running",
			"done",
		];
		for (const lifecycle of lifecycles) {
			expect(LIFECYCLE_BUCKET[lifecycle]).toBeDefined();
		}
	});

	test("resolveBucket routes attention states together", () => {
		expect(resolveBucket(row({ status: "review" }))).toBe("attention");
		expect(
			resolveBucket(
				row({
					status: "no_match",
					decision: { kind: "ambiguous", candidates: [] },
				}),
			),
		).toBe("attention");
		expect(resolveBucket(row({ status: "no_match" }))).toBe("attention");
		expect(resolveBucket(row({ status: "partial" }))).toBe("attention");
		expect(
			resolveBucket(
				row({ status: "pending", providerAttempts: 3, hasFailures: true }),
			),
		).toBe("attention");
	});

	test("running and scheduled share the in_progress bucket", () => {
		expect(resolveBucket(row({ status: "pending" }))).toBe("in_progress");
		expect(
			resolveBucket(
				row({ status: "pending", nextRetryAt: "2026-07-24T00:00:00Z" }),
			),
		).toBe("in_progress");
	});

	test("completed is its own bucket", () => {
		expect(resolveBucket(row({ status: "enriched" }))).toBe("completed");
	});
});
