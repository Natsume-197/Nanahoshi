import { describe, expect, test } from "bun:test";
import {
	type AdmissionFacts,
	admit,
	isTerminalStatus,
} from "./metadata-enrichment.admission";

function facts(overrides: Partial<AdmissionFacts> = {}): AdmissionFacts {
	return {
		duplicateOfBookId: null,
		libraryPausedAt: null,
		status: null,
		nextRetryAt: null,
		retryGeneration: 0,
		...overrides,
	};
}

const AT = "2026-07-24T10:00:00.000Z";
const automatic = { trigger: "automatic" } as const;
const explicit = { trigger: "explicit" } as const;

describe("automatic trigger obeys every rule", () => {
	test("a book with no enrichment_state row yet is admitted", () => {
		expect(admit(facts(), automatic)).toEqual({ ok: true });
	});

	const denials: [string, Partial<AdmissionFacts>, string][] = [
		["hidden copy", { duplicateOfBookId: 42 }, "hidden_copy"],
		["paused library", { libraryPausedAt: AT }, "library_paused"],
		["terminal: enriched", { status: "enriched" }, "terminal"],
		["terminal: no_match", { status: "no_match" }, "terminal"],
		["terminal: review", { status: "review" }, "terminal"],
	];

	for (const [name, overrides, reason] of denials) {
		test(`denies ${name}`, () => {
			expect(admit(facts(overrides), automatic)).toEqual({ ok: false, reason });
		});
	}

	test("admits a non-terminal book still being worked on", () => {
		expect(admit(facts({ status: "pending" }), automatic)).toEqual({
			ok: true,
		});
		expect(admit(facts({ status: "partial" }), automatic)).toEqual({
			ok: true,
		});
	});
});

describe("explicit trigger overrides everything but a hidden copy", () => {
	test("a human request beats pause and terminal status", () => {
		const blocked = facts({
			libraryPausedAt: AT,
			status: "enriched",
		});
		expect(admit(blocked, explicit)).toEqual({ ok: true });
	});

	test("a hidden copy is still refused", () => {
		expect(admit(facts({ duplicateOfBookId: 42 }), explicit)).toEqual({
			ok: false,
			reason: "hidden_copy",
		});
	});
});

describe("retry generation fences stale jobs", () => {
	const scheduled = facts({
		status: "pending",
		nextRetryAt: AT,
		retryGeneration: 3,
	});

	test("admits the job belonging to the current appointment", () => {
		expect(admit(scheduled, { ...automatic, retryGeneration: 3 })).toEqual({
			ok: true,
		});
	});

	test("denies a job from a superseded generation", () => {
		expect(admit(scheduled, { ...automatic, retryGeneration: 2 })).toEqual({
			ok: false,
			reason: "stale_generation",
		});
	});

	test("denies once the appointment is gone", () => {
		const cleared = { ...scheduled, nextRetryAt: null };
		expect(admit(cleared, { ...automatic, retryGeneration: 3 })).toEqual({
			ok: false,
			reason: "stale_generation",
		});
	});

	test("denies a retry once its appointment is cancelled", () => {
		// Cancellation clears nextRetryAt and bumps the generation, so an
		// in-flight job loses on both counts.
		const cancelled = facts({
			status: "pending",
			nextRetryAt: null,
			retryGeneration: 4,
		});
		expect(admit(cancelled, { ...automatic, retryGeneration: 3 })).toEqual({
			ok: false,
			reason: "stale_generation",
		});
	});
});

describe("precedence", () => {
	test("a hidden copy outranks every other reason, for both triggers", () => {
		const everything = facts({
			duplicateOfBookId: 42,
			libraryPausedAt: AT,
			status: "enriched",
		});
		expect(admit(everything, automatic)).toEqual({
			ok: false,
			reason: "hidden_copy",
		});
		expect(admit(everything, explicit)).toEqual({
			ok: false,
			reason: "hidden_copy",
		});
	});

	test("pause is reported before terminal", () => {
		const both = facts({
			libraryPausedAt: AT,
			status: "enriched",
		});
		expect(admit(both, automatic)).toEqual({
			ok: false,
			reason: "library_paused",
		});
	});
});

describe("isTerminalStatus", () => {
	test("no row is not terminal", () => {
		expect(isTerminalStatus(null)).toBe(false);
	});

	test("pending and partial stay open", () => {
		expect(isTerminalStatus("pending")).toBe(false);
		expect(isTerminalStatus("partial")).toBe(false);
	});

	test("enriched, no_match and review are done", () => {
		expect(isTerminalStatus("enriched")).toBe(true);
		expect(isTerminalStatus("no_match")).toBe(true);
		expect(isTerminalStatus("review")).toBe(true);
	});
});
