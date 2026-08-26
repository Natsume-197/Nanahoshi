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
		expect(extractVolume("鹿の王 ２ (角川つばさ文庫)")).toBe(2);
		expect(extractVolume("ポーション頼みで生き延びます！７")).toBe(7);
		expect(extractVolume("俺、ツインテールになります。4.5")).toBe(4.5);
		expect(extractVolume("[07] ポーション頼みで生き延びます！７.m4b")).toBe(7);
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
		expect(
			deriveMatchSearchQueries(
				"[1巻・後編] オーバーロード1 不死者の王（後編） [B012345678]",
			),
		).toContain("オーバーロード1 不死者の王");
		expect(
			deriveMatchSearchQueries("[15巻] 転生したらスライムだった件15"),
		).toContain("転生したらスライムだった件 15");
		expect(
			deriveMatchSearchQueries(
				"[短編集3巻] デスマーチからはじまる異世界狂想曲 Ex3",
			),
		).toContain("デスマーチからはじまる異世界狂想曲 Ex3");
		expect(deriveMatchSearchQueries("４．虚空の旅人")).toContain("虚空の旅人");
		expect(
			deriveMatchSearchQueries("[02] ミモザの告白 2 [B0F1ZYJN66]"),
		).toContain("ミモザの告白 2");
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
				score: 75,
				confidence: "medium",
				eligible: true,
			}),
		);
		expect(honzuki.reasons).toContain("title.exact");
		expect(honzuki.reasons).toContain("volume.match");
		expect(oregairu).toEqual(
			expect.objectContaining({
				score: 65,
				confidence: "medium",
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

	test("rejects production volume conflicts hidden by Japanese punctuation", () => {
		const cases = [
			[
				publication("鹿の王　１", {
					filename: "[1巻] 鹿の王 1.m4b",
					series: [{ name: "鹿の王", position: 1 }],
				}),
				publication("鹿の王 ２ (角川つばさ文庫)"),
			],
			[
				publication("ポーション頼みで生き延びます！７", {
					filename: "[07] ポーション頼みで生き延びます！７.m4b",
				}),
				publication("ポーション頼みで生き延びます！", {
					series: [{ name: "ポーション頼みで生き延びます！", position: 1 }],
				}),
			],
			[
				publication("俺、ツインテールになります。　13 （ガガガ文庫）", {
					series: [{ name: "俺、ツインテールになります。", position: 13 }],
				}),
				publication("俺、ツインテールになります。4.5", {
					series: [{ name: "俺、ツインテールになります。", position: 13 }],
				}),
			],
		] as const;

		for (const [audiobook, ebook] of cases) {
			const result = scoreReadListenMatch(audiobook, ebook);
			expect(result.eligible).toBe(false);
			expect(result.warnings).toContain("volume.conflict");
		}
	});

	test("does not call an uncorroborated base-title match high confidence", () => {
		const result = scoreReadListenMatch(
			publication("教場２", { authors: [] }),
			publication("教場", { authors: [] }),
		);

		expect(result).toEqual(
			expect.objectContaining({
				score: 65,
				confidence: "medium",
				eligible: false,
			}),
		);
		expect(result.warnings).toContain("volume.conflict");
	});

	test("does not turn one-sided filename or series volume evidence into a conflict", () => {
		const filenameIndex = scoreReadListenMatch(
			publication("レーエンデ国物語 夜明け前", {
				filename: "[04] レーエンデ国物語 夜明け前.m4b",
			}),
			publication("レーエンデ国物語 夜明け前"),
		);
		const seriesIndex = scoreReadListenMatch(
			publication("終物語 下", { authors: [], series: [] }),
			publication("終物語（下）", {
				authors: [],
				series: [{ name: "〈物語〉シリーズ", position: 18 }],
			}),
		);

		expect(filenameIndex.eligible).toBe(true);
		expect(filenameIndex.warnings).not.toContain("volume.conflict");
		expect(seriesIndex.eligible).toBe(true);
		expect(seriesIndex.warnings).not.toContain("volume.conflict");
	});

	test("treats a one-sided leading catalog index as secondary evidence", () => {
		const result = scoreReadListenMatch(
			publication("[3巻] バチカン奇跡調査官 闇の黄金"),
			publication("バチカン奇跡調査官 闇の黄金"),
		);

		expect(result.eligible).toBe(true);
		expect(result.warnings).not.toContain("volume.conflict");
	});

	test("prefers a volume corroborated by filename and series over an internal arc number", () => {
		const result = scoreReadListenMatch(
			publication("[23巻] 本好きの下剋上～第五部「女神の化身2」", {
				filename: "[23] 本好きの下剋上 女神の化身2.m4b",
				series: [{ name: "本好きの下剋上", position: 23 }],
			}),
			publication("本好きの下剋上 第五部 女神の化身Ⅱ", {
				filename: "1518896677648334868__23.epub",
				series: [{ name: "本好きの下剋上", position: 23 }],
			}),
		);

		expect(result.eligible).toBe(true);
		expect(result.reasons).toContain("volume.match");
		expect(result.warnings).not.toContain("volume.conflict");
	});

	test("recognizes the same inline volume when only one side has a leading volume tag", () => {
		const result = scoreReadListenMatch(
			publication("[17巻] デート・ア・ライブ17 狂三ラグナロク"),
			publication("デート・ア・ライブ17 狂三ラグナロク"),
		);

		expect(result.eligible).toBe(true);
		expect(result.reasons).toContain("volume.match");
		expect(result.warnings).not.toContain("volume.conflict");
	});

	test("recognizes a Roman title volume despite a conflicting catalog position", () => {
		const result = scoreReadListenMatch(
			publication("[4巻] リビルドワールドIV 現世界と旧世界の闘争"),
			publication("リビルドワールドIV 現世界と旧世界の闘争", {
				series: [{ name: "リビルドワールド", position: 7 }],
			}),
		);

		expect(result.eligible).toBe(true);
		expect(result.reasons).toContain("volume.match");
		expect(result.warnings).not.toContain("volume.conflict");
	});

	test("does not let conflicting catalog indices veto an exact work title", () => {
		const result = scoreReadListenMatch(
			publication("死物語 下", { filename: "[29] 死物語 下.m4b" }),
			publication("死物語 下", {
				filename: "1519049698521124944__30.epub",
				series: [{ name: "〈物語〉シリーズ", position: 30 }],
			}),
		);

		expect(result.eligible).toBe(true);
		expect(result.warnings).not.toContain("volume.conflict");
	});

	test("ignores conflicting file indices when titles differ only by publisher noise", () => {
		const result = scoreReadListenMatch(
			publication("世界の終りとハードボイルド・ワンダーランド（上）", {
				filename: "[01] 世界の終りとハードボイルド・ワンダーランド（上）.m4b",
			}),
			publication(
				"世界の終りとハードボイルド・ワンダーランド（上）（新潮文庫）",
				{ filename: "-_2.epub" },
			),
		);

		expect(result.eligible).toBe(true);
		expect(result.warnings).not.toContain("volume.conflict");
	});

	test("prefers equal title volumes over a different catalog position", () => {
		const result = scoreReadListenMatch(
			publication("本好きの下剋上 神殿の巫女見習い3", {
				filename: "[6巻] 本好きの下剋上 神殿の巫女見習い3.m4b",
			}),
			publication("本好きの下剋上 神殿の巫女見習いIII", {
				filename: "【小説6巻】本好きの下剋上 神殿の巫女見習いIII.epub",
				series: [{ name: "本好きの下剋上", position: 6 }],
			}),
		);

		expect(result.eligible).toBe(true);
		expect(result.reasons).toContain("volume.match");
		expect(result.warnings).not.toContain("volume.conflict");
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

	test("allows an audiobook playback half to match the same structural ebook part", () => {
		const result = scoreReadListenMatch(
			publication("オーバーロード13 聖王国の聖騎士［下］（前編）"),
			publication("オーバーロード13 聖王国の聖騎士［下］"),
		);

		expect(result.eligible).toBe(true);
		expect(result.warnings).not.toContain("part.conflict");
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

	test("lets a matching explicit volume outrank conflicting catalog order", () => {
		const result = scoreReadListenMatch(
			publication("[2巻・下] リビルドワールドII〈下〉 死後報復依頼", {
				authors: [],
				series: [{ name: "リビルドワールド", position: 2 }],
			}),
			publication("リビルドワールドII〈下〉 死後報復依頼", {
				authors: [],
				series: [{ name: "リビルドワールド", position: 4 }],
			}),
		);

		expect(result.eligible).toBe(true);
		expect(result.score).toBeGreaterThanOrEqual(65);
		expect(result.reasons).toContain("volume.match");
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

	test("recognizes EX as the same special release marker as 外伝", () => {
		const result = scoreReadListenMatch(
			publication("[外伝] 終末なにしてますか？ EX"),
			publication("終末なにしてますか？ #EX"),
		);

		expect(result.eligible).toBe(true);
		expect(result.reasons).toContain("edition.special.match");
		expect(result.warnings).not.toContain("edition.special.conflict");
	});

	test("ignores bracketed electronic-edition extras when matching titles", () => {
		const result = scoreReadListenMatch(
			publication("魔法少女育成計画"),
			publication("魔法少女育成計画【電子版あとがき付】"),
		);

		expect(result.eligible).toBe(true);
		expect(result.score).toBeGreaterThanOrEqual(65);
		expect(result.reasons).toContain("title.exact");
	});

	test("ignores Japanese imprint labels when matching titles", () => {
		const result = scoreReadListenMatch(
			publication("[15巻] 転生したらスライムだった件15"),
			publication("転生したらスライムだった件 15 (GCノベルズ)"),
		);

		expect(result.eligible).toBe(true);
		expect(result.score).toBeGreaterThanOrEqual(65);
		expect(result.reasons).toContain("title.exact");
	});

	test("ignores a known author embedded before the work title", () => {
		const author = [{ name: "宮部 みゆき" }];
		const result = scoreReadListenMatch(
			publication("模倣犯 2", { authors: author }),
			publication("[宮部みゆき] 模倣犯2", { authors: author }),
		);

		expect(result.eligible).toBe(true);
		expect(result.score).toBeGreaterThanOrEqual(65);
		expect(result.reasons).toContain("title.exact");
	});

	test("ignores a known author embedded in a series name", () => {
		const author = [{ name: "西尾 維新" }];
		const result = scoreReadListenMatch(
			publication("クビシメロマンチスト 人間失格", {
				authors: author,
				series: [{ name: "[西尾 維新] 戯言シリーズ", position: 2 }],
			}),
			publication("クビシメロマンチスト 人間失格 戯言", {
				authors: author,
				series: [{ name: "戯言シリーズ", position: 2 }],
			}),
		);

		expect(result.reasons).toContain("series.match");
		expect(result.reasons).toContain("series.position.match");
	});
});
