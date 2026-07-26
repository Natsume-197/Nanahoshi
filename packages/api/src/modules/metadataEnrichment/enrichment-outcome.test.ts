import { describe, expect, test } from "bun:test";
import { CATALOG_IDENTITY_REASONS as R } from "../catalogIdentity/types";
import {
	AUDIOBOOK_OUTCOME_POLICY,
	BOOK_OUTCOME_POLICY,
	providerUnavailableMessage,
	type RawFailure,
	resolveMatchOutcome,
	summarizeFailures,
} from "./enrichment-outcome";

const transient = (provider: string, retryAfterMs?: number): RawFailure => ({
	provider,
	phase: "discovery",
	kind: "transient",
	code: "provider_unavailable",
	...(retryAfterMs != null && { retryAfterMs }),
});

const permanent = (provider: string): RawFailure => ({
	provider,
	phase: "hydration",
	kind: "permanent",
	code: "candidate_budget_exhausted",
});

describe("summarizeFailures", () => {
	test("stamps every failure with one shared timestamp", () => {
		const { failures } = summarizeFailures([
			transient("amazon"),
			permanent("ranobedb"),
		]);
		expect(failures).toHaveLength(2);
		expect(failures[0]?.at).toBe(failures[1]?.at as string);
	});

	test("no transient failure means no retry appointment", () => {
		const summary = summarizeFailures([permanent("ranobedb")]);
		expect(summary.nextRetryAt).toBeNull();
		expect(summary.transientProviders).toEqual([]);
	});

	test("waits the longest reported cooldown", () => {
		const before = Date.now();
		const { nextRetryAt } = summarizeFailures([
			transient("amazon", 60_000),
			transient("googlebooks", 300_000),
		]);
		expect(nextRetryAt).not.toBeNull();
		const waited = (nextRetryAt as Date).getTime() - before;
		expect(waited).toBeGreaterThanOrEqual(300_000);
		expect(waited).toBeLessThan(310_000);
	});

	test("a transient failure with no hint falls back to the breaker window", () => {
		const before = Date.now();
		const { nextRetryAt } = summarizeFailures([transient("amazon")]);
		const waited = (nextRetryAt as Date).getTime() - before;
		expect(waited).toBeGreaterThan(0);
	});

	test("names each transient provider once", () => {
		const { transientProviders } = summarizeFailures([
			transient("amazon"),
			transient("amazon"),
			permanent("ranobedb"),
		]);
		expect(transientProviders).toEqual(["amazon"]);
	});
});

describe("providerUnavailableMessage", () => {
	test("agrees in number with the provider list", () => {
		expect(providerUnavailableMessage(["amazon"])).toContain("provider ");
		expect(providerUnavailableMessage(["amazon", "ranobedb"])).toContain(
			"providers ",
		);
	});
});

const identifierMatch = {
	retryable: false,
	primaryReasons: [R.IDENTIFIER_MATCH],
	primaryAmbiguous: false,
};

describe("written books", () => {
	test("a hard-identifier match is done", () => {
		expect(resolveMatchOutcome(identifierMatch, BOOK_OUTCOME_POLICY)).toEqual({
			kind: "run",
			status: "enriched",
		});
	});

	test("a judgement call goes to human review", () => {
		const fuzzy = {
			retryable: false,
			primaryReasons: [R.TITLE_MATCH],
			primaryAmbiguous: false,
		};
		expect(resolveMatchOutcome(fuzzy, BOOK_OUTCOME_POLICY)).toEqual({
			kind: "run",
			status: "review",
		});
	});

	test("an ambiguous pick goes to review even on an equivalent title", () => {
		const ambiguous = {
			retryable: false,
			primaryReasons: [R.TITLE_EQUIVALENT],
			primaryAmbiguous: true,
		};
		expect(resolveMatchOutcome(ambiguous, BOOK_OUTCOME_POLICY)).toEqual({
			kind: "run",
			status: "review",
		});
	});

	test("a transient failure mid-run outranks review and stays partial", () => {
		const interrupted = {
			retryable: true,
			primaryReasons: [R.TITLE_MATCH],
			primaryAmbiguous: false,
		};
		expect(resolveMatchOutcome(interrupted, BOOK_OUTCOME_POLICY)).toEqual({
			kind: "run",
			status: "partial",
		});
	});

	test("an author-less match is not special for written books", () => {
		expect(
			resolveMatchOutcome(identifierMatch, BOOK_OUTCOME_POLICY, {
				hasAuthors: false,
			}),
		).toEqual({ kind: "run", status: "enriched" });
	});
});

describe("Audiobook Quick Match", () => {
	test("a match with authors is done", () => {
		expect(
			resolveMatchOutcome(identifierMatch, AUDIOBOOK_OUTCOME_POLICY, {
				hasAuthors: true,
			}),
		).toEqual({ kind: "run", status: "enriched" });
	});

	test("an author-less match counts against the partial cap", () => {
		expect(
			resolveMatchOutcome(identifierMatch, AUDIOBOOK_OUTCOME_POLICY, {
				hasAuthors: false,
			}),
		).toEqual({ kind: "partial_match" });
	});

	test("a transient failure keeps it partial even with authors", () => {
		const interrupted = { ...identifierMatch, retryable: true };
		expect(
			resolveMatchOutcome(interrupted, AUDIOBOOK_OUTCOME_POLICY, {
				hasAuthors: true,
			}),
		).toEqual({ kind: "partial_match" });
	});

	// Supervision is ebook-only: audiobooks routinely lack local author and
	// duration at enrich time, so a title-only match is the norm, not a flag.
	test("a judgement call is never sent to review", () => {
		const fuzzy = {
			retryable: false,
			primaryReasons: [R.TITLE_MATCH],
			primaryAmbiguous: true,
		};
		expect(
			resolveMatchOutcome(fuzzy, AUDIOBOOK_OUTCOME_POLICY, {
				hasAuthors: true,
			}),
		).toEqual({ kind: "run", status: "enriched" });
	});
});
