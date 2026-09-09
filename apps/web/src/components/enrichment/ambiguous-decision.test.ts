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
			],
		};

		expect(resolveAmbiguousCandidates(stale, detail)).toEqual([
			{ provider: "ranobedb", providerId: "1", title: "First" },
			{ provider: "ranobedb", providerId: "2", title: "Second" },
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
