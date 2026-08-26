import { describe, expect, test } from "bun:test";
import {
	deriveMatchSearchQueries,
	extractVolume,
	normalizeMatchText,
	scoreReadListenMatch,
} from "../read-listen-matcher";

function publication(title: string, overrides: Record<string, unknown> = {}) {
	return {
		title,
		filename: title,
		authors: [{ name: "川原 礫" }],
		series: [],
		...overrides,
	};
}

describe("read-listen matcher", () => {
	test("normalizes full-width forms and audiobook edition labels", () => {
		expect(normalizeMatchText("ＳＡＯ【オーディオブック】")).toBe("sao");
	});

	test("extracts Arabic, Roman, full-width, and kanji volumes", () => {
		expect(extractVolume("作品 第12巻")).toBe(12);
		expect(extractVolume("Work Vol. IV")).toBe(4);
		expect(extractVolume("作品 １２巻")).toBe(12);
		expect(extractVolume("作品 第十二巻")).toBe(12);
		expect(extractVolume("弱キャラ友崎くん Lv.10")).toBe(10);
		expect(extractVolume("異世界のんびり農家(9)")).toBe(9);
		expect(extractVolume("七つの魔剣が支配するXIII (電撃文庫)")).toBe(13);
		expect(extractVolume("神殿の巫女見習い3」")).toBe(3);
		expect(extractVolume("デスマーチからはじまる異世界狂想曲 Ex3")).toBe(3);
	});

	test("derives searchable Japanese title projections without publisher noise", () => {
		expect(
			deriveMatchSearchQueries(
				"[1巻] やはり俺の青春ラブコメはまちがっている。１（ガガガ文庫）: （小学館）: （小学館）",
			),
		).toContain("やはり俺の青春ラブコメはまちがっている");
		expect(
			deriveMatchSearchQueries(
				"本好きの下剋上～司書になるためには手段を選んでいられません～第二部「神殿の巫女見習い3」",
			),
		).toContain(
			"本好きの下剋上 司書になるためには手段を選んでいられません 第二部 神殿の巫女見習い 3",
		);
	});

	test("matches the local Japanese audiobook title variants", () => {
		const honzuki = scoreReadListenMatch(
			publication(
				"本好きの下剋上～司書になるためには手段を選んでいられません～第二部「神殿の巫女見習い3」",
				{ authors: [] },
			),
			publication(
				"本好きの下剋上 〜司書になるためには手段を選んでいられません〜 第二部　神殿の巫女見習いIII",
				{ authors: [] },
			),
		);
		const oregairu = scoreReadListenMatch(
			publication(
				"[1巻] やはり俺の青春ラブコメはまちがっている。１（ガガガ文庫）: （小学館）: （小学館）",
				{ authors: [] },
			),
			publication("やはり俺の青春ラブコメはまちがっている。", {
				authors: [],
			}),
		);

		expect(honzuki).toEqual(
			expect.objectContaining({
				score: 95,
				confidence: "high",
				eligible: true,
			}),
		);
		expect(honzuki.reasons).toContain("title.exact");
		expect(honzuki.reasons).toContain("volume.match");
		expect(oregairu).toEqual(
			expect.objectContaining({
				score: 85,
				confidence: "high",
				eligible: true,
			}),
		);
		expect(oregairu.reasons).toContain("title.exact");
	});

	test("gives an explainable high-confidence result for matching metadata", () => {
		const result = scoreReadListenMatch(
			publication("ソードアート・オンライン 第12巻", {
				series: [{ name: "ソードアート・オンライン", position: 12 }],
			}),
			publication("ソードアートオンライン 12巻", {
				series: [{ name: "ソードアートオンライン", position: 12 }],
			}),
		);

		expect(result).toEqual({
			score: 100,
			confidence: "high",
			reasons: [
				"title.exact",
				"author.match",
				"series.match",
				"series.position.match",
				"volume.match",
			],
			warnings: [],
			eligible: true,
		});
	});

	test("treats a volume mismatch as a hard conflict", () => {
		const result = scoreReadListenMatch(
			publication("ソードアート・オンライン 第12巻"),
			publication("ソードアート・オンライン 第13巻"),
		);

		expect(result.eligible).toBe(false);
		expect(result.warnings).toContain("volume.conflict");
	});

	test("rejects an explicit later volume against an unnumbered first-volume record", () => {
		const result = scoreReadListenMatch(
			publication("安達としまむら3", { authors: [], series: [] }),
			publication("安達としまむら", {
				authors: [{ name: "入間人間" }],
				series: [{ name: "安達としまむら", position: 1 }],
			}),
		);

		expect(result.eligible).toBe(false);
		expect(result.warnings).toContain("volume.conflict");
	});

	test("uses filenames when embedded metadata is generic", () => {
		const result = scoreReadListenMatch(
			publication("Track 01", {
				filename: "狼と香辛料 第3巻.m4b",
			}),
			publication("Untitled", {
				filename: "狼と香辛料 3巻.epub",
			}),
		);

		expect(result.eligible).toBe(true);
		expect(result.reasons).toContain("filename.exact");
		expect(result.reasons).toContain("volume.match");
	});

	test("treats upper and lower parts as incompatible", () => {
		const result = scoreReadListenMatch(
			publication("物語上巻"),
			publication("物語下巻"),
		);

		expect(result.eligible).toBe(false);
		expect(result.warnings).toContain("part.conflict");
	});

	test("penalizes conflicting series ordinals without vetoing explicit title evidence", () => {
		const result = scoreReadListenMatch(
			publication("デスマーチからはじまる異世界狂想曲 Ex3", {
				series: [{ name: "デスマーチからはじまる異世界狂想曲", position: 3 }],
			}),
			publication("デスマーチからはじまる異世界狂想曲 Ex3", {
				series: [{ name: "デスマーチからはじまる異世界狂想曲", position: 34 }],
			}),
		);

		expect(result.eligible).toBe(true);
		expect(result.warnings).toContain("series.position.conflict");
	});

	test("does not confuse a short-story volume with the main-series volume", () => {
		const result = scoreReadListenMatch(
			publication("[短編集3巻] デスマーチからはじまる異世界狂想曲 Ex3"),
			publication("デスマーチからはじまる異世界狂想曲 3"),
		);

		expect(result.eligible).toBe(false);
		expect(result.warnings).toContain("edition.special.conflict");
	});
});
