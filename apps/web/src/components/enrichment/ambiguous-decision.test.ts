import { describe, expect, test } from "bun:test";
import { resolveAmbiguousCandidates } from "./ambiguous-decision";

describe("resolveAmbiguousCandidates", () => {
	test("prefers fresh detail, removes unusable duplicates and stays bounded", () => {
		const stale = {
			kind: "ambiguous" as const,
			candidates: [{ provider: "ranobedb", providerId: "old" }],
		};
		const detail = {
			kind: "ambiguous" as const,
			candidates: [
				{ provider: "ranobedb", providerId: "1", title: "First" },
				{ provider: "ranobedb", providerId: "1", title: "Duplicate" },
				{ provider: "ranobedb", providerId: null, title: "Unusable" },
				{ provider: "ranobedb", providerId: "2", title: "Second" },
				{ provider: "ranobedb", providerId: "3", title: "Third" },
				{ provider: "amazon", providerId: "4", title: "Fourth" },
				{ provider: "amazon", providerId: "5", title: "Fifth" },
				{ provider: "amazon", providerId: "6", title: "Sixth" },
			],
		};

		const resolved = resolveAmbiguousCandidates(stale, detail);
		expect(resolved.map((candidate) => candidate.providerId)).toEqual([
			"1",
			"2",
			"3",
			"4",
			"5",
		]);
	});
});

test("an unresolved explanation replaces stale ambiguous candidates", () => {
	expect(
		resolveAmbiguousCandidates(
			{
				kind: "ambiguous",
				candidates: [{ provider: "audible", providerId: "B000000001" }],
			},
			{
				kind: "unresolved",
				reason: "identity_conflict",
				reasons: ["discriminator.part_conflict"],
				searches: 2,
				candidates: 1,
			},
		),
	).toEqual([]);
});
