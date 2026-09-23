import { describe, expect, test } from "bun:test";
import {
	type PairStateFacts,
	resolvePairState,
} from "../read-listen-pair-state";

const facts = (overrides: Partial<PairStateFacts>): PairStateFacts => ({
	generationStatus: null,
	hasAlignment: false,
	alignmentCurrent: false,
	...overrides,
});

describe("resolvePairState", () => {
	test.each([
		["a new pair", facts({}), "no_alignment"],
		[
			"a queued generation",
			facts({ generationStatus: "queued" }),
			"generating",
		],
		[
			"a running regeneration over a stale alignment",
			facts({ generationStatus: "running", hasAlignment: true }),
			"generating",
		],
		[
			"a current alignment",
			facts({ hasAlignment: true, alignmentCurrent: true }),
			"ready",
		],
		[
			"a current alignment after a failed regeneration",
			facts({
				generationStatus: "failed",
				hasAlignment: true,
				alignmentCurrent: true,
			}),
			"ready",
		],
		[
			"a failed first generation",
			facts({ generationStatus: "failed" }),
			"failed",
		],
		[
			"a failed regeneration over a stale alignment",
			facts({ generationStatus: "failed", hasAlignment: true }),
			"failed",
		],
		[
			"an alignment whose sources changed",
			facts({ hasAlignment: true }),
			"no_alignment",
		],
		[
			"a cancelled generation",
			facts({ generationStatus: "cancelled" }),
			"no_alignment",
		],
	] as const)("%s → %s", (_label, input, expected) => {
		expect(resolvePairState(input)).toBe(expected);
	});
});
