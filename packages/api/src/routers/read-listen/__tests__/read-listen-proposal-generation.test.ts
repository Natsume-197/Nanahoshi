import { describe, expect, test } from "bun:test";
import {
	deriveReadListenDiscoveryQueries,
	selectReadListenProposalCandidates,
} from "../read-listen-proposal-generation";

function candidate(id: number, score: number, eligible = true) {
	return {
		ebook: { id },
		result: {
			score,
			confidence: score >= 85 ? ("high" as const) : ("medium" as const),
			reasons: [],
			warnings: [],
			eligible,
		},
	};
}

describe("selectReadListenProposalCandidates", () => {
	test("keeps only candidates close enough to the strongest result", () => {
		const selected = selectReadListenProposalCandidates(
			[candidate(1, 100), candidate(2, 85), candidate(3, 65)],
			5,
		);

		expect(selected.map(({ ebook }) => ebook.id)).toEqual([1]);
	});

	test("bounds genuinely competing alternatives to two", () => {
		const selected = selectReadListenProposalCandidates(
			[candidate(1, 85), candidate(2, 85), candidate(3, 85)],
			5,
		);

		expect(selected.map(({ ebook }) => ebook.id)).toEqual([1, 2]);
	});

	test("drops ineligible and below-threshold candidates", () => {
		const selected = selectReadListenProposalCandidates(
			[candidate(1, 85, false), candidate(2, 64), candidate(3, 65)],
			5,
		);

		expect(selected.map(({ ebook }) => ebook.id)).toEqual([3]);
	});
});

describe("deriveReadListenDiscoveryQueries", () => {
	test("reserves discovery queries for cleaned metadata and series", () => {
		const queries = deriveReadListenDiscoveryQueries({
			title: "ミモザの告白 ２ ガガガ文庫",
			filename: "[02] ミモザの告白 2 [B0F1ZYJN66].m4b",
			series: [{ name: "ミモザの告白", position: 2 }],
		});

		expect(queries).toHaveLength(4);
		expect(queries).toContain("ミモザの告白 2");
		expect(queries).toContain("ミモザの告白");
	});
});
