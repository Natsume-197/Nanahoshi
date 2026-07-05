import { describe, expect, test } from "bun:test";
import {
	cleanSeriesPrefix,
	commonSeriesPrefix,
	inferSeriesFromTitle,
} from "../audiobookSeriesInference";

describe("inferSeriesFromTitle", () => {
	test("Japanese bracketed volume marker", () => {
		expect(
			inferSeriesFromTitle("[1巻] ひげを剃る。そして女子高生を拾う。"),
		).toEqual({
			seriesName: "ひげを剃る。そして女子高生を拾う。",
			position: 1,
		});
	});

	test("Japanese marker plus trailing fullwidth volume number", () => {
		expect(
			inferSeriesFromTitle("[4巻] ひげを剃る。そして女子高生を拾う。４"),
		).toEqual({
			seriesName: "ひげを剃る。そして女子高生を拾う。",
			position: 4,
		});
	});

	test("第N巻 form", () => {
		expect(inferSeriesFromTitle("薬屋のひとりごと 第3巻")).toEqual({
			seriesName: "薬屋のひとりごと",
			position: 3,
		});
	});

	test("Vol. N form", () => {
		expect(inferSeriesFromTitle("Mushoku Tensei Vol. 7")).toEqual({
			seriesName: "Mushoku Tensei",
			position: 7,
		});
	});

	test("Book N form with separator cleanup", () => {
		expect(inferSeriesFromTitle("The Stormlight Archive: Book 2")).toEqual({
			seriesName: "The Stormlight Archive",
			position: 2,
		});
	});

	test("hash form", () => {
		expect(inferSeriesFromTitle("Overlord #12")).toEqual({
			seriesName: "Overlord",
			position: 12,
		});
	});

	test("decimal positions survive", () => {
		expect(inferSeriesFromTitle("Series Name Vol. 1.5")).toEqual({
			seriesName: "Series Name",
			position: 1.5,
		});
	});

	test("bare trailing numbers are not volumes", () => {
		expect(inferSeriesFromTitle("Fahrenheit 451")).toBeNull();
		expect(inferSeriesFromTitle("1984")).toBeNull();
		expect(inferSeriesFromTitle("Catch-22")).toBeNull();
	});

	test("no marker → null", () => {
		expect(inferSeriesFromTitle("A Plain Standalone Title")).toBeNull();
		expect(inferSeriesFromTitle(null)).toBeNull();
		expect(inferSeriesFromTitle("")).toBeNull();
	});

	test("marker with empty base → null", () => {
		expect(inferSeriesFromTitle("第1巻")).toBeNull();
	});

	test("compound bracket marker is fully removed", () => {
		expect(
			inferSeriesFromTitle(
				"[5巻・後編] 幼女戦記 5 Abyssus abyssum invocat 後編",
			),
		).toEqual({ seriesName: "幼女戦記", position: 5 });
	});

	test("per-volume subtitle after the number is truncated", () => {
		expect(
			inferSeriesFromTitle(
				"[7巻] フルメタル・パニック！　7　つづくオン・マイ・オウン(新装版)",
			),
		).toEqual({ seriesName: "フルメタル・パニック！", position: 7 });
	});

	test("fullwidth volume repeat with publisher noise is truncated", () => {
		expect(
			inferSeriesFromTitle(
				"[1巻] やはり俺の青春ラブコメはまちがっている。１（ガガガ文庫）: （小学館）",
			),
		).toEqual({
			seriesName: "やはり俺の青春ラブコメはまちがっている。",
			position: 1,
		});
	});

	test("volume digit inside a longer number is left alone", () => {
		expect(inferSeriesFromTitle("[6巻] 緋弾のアリア 6 絶対半径2051")).toEqual({
			seriesName: "緋弾のアリア",
			position: 6,
		});
	});

	test("padded volume numbers truncate too", () => {
		expect(inferSeriesFromTitle("[6巻] 異世界のんびり農家 06")).toEqual({
			seriesName: "異世界のんびり農家",
			position: 6,
		});
	});

	test("volume number glued to a CJK title", () => {
		expect(
			inferSeriesFromTitle("[6巻] 幼なじみが絶対に負けないラブコメ6"),
		).toEqual({ seriesName: "幼なじみが絶対に負けないラブコメ", position: 6 });
		expect(
			inferSeriesFromTitle(
				"[6巻・下・後編] オーバーロード6 王国の漢たち［下］ 後編",
			),
		).toEqual({ seriesName: "オーバーロード", position: 6 });
	});

	test("filename with extension stripped by caller works the same", () => {
		expect(
			inferSeriesFromTitle("[2巻] 青春ブタ野郎はプチデビル後輩の夢を見ない"),
		).toEqual({
			seriesName: "青春ブタ野郎はプチデビル後輩の夢を見ない",
			position: 2,
		});
	});

	test("hash-padded repeat and orphaned 第 prefix are cleaned", () => {
		expect(
			inferSeriesFromTitle(
				"[4巻] 終末なにしてますか？ もう一度だけ、会えますか？#04",
			),
		).toEqual({
			seriesName: "終末なにしてますか？ もう一度だけ、会えますか？",
			position: 4,
		});
		expect(
			inferSeriesFromTitle(
				"[4巻] 終末なにしてますか？　忙しいですか？　救ってもらっていいですか？　第4話",
			),
		).toEqual({
			seriesName:
				"終末なにしてますか？　忙しいですか？　救ってもらっていいですか？",
			position: 4,
		});
	});
});

describe("commonSeriesPrefix", () => {
	test("multi-subtitle light novel volumes share the series prefix", () => {
		expect(
			commonSeriesPrefix(
				"青春ブタ野郎はバニーガール先輩の夢を見ない",
				"青春ブタ野郎はプチデビル後輩の夢を見ない",
			),
		).toBe("青春ブタ野郎");
	});

	test("identical names return the cleaned name", () => {
		expect(commonSeriesPrefix("無職転生", "無職転生")).toBe("無職転生");
	});

	test("weak prefixes are rejected", () => {
		expect(commonSeriesPrefix("The Martian", "The Hobbit")).toBeNull();
		expect(commonSeriesPrefix("abc", "abd")).toBeNull();
	});

	test("coincidental shared Latin words never merge", () => {
		expect(commonSeriesPrefix("Dark Tower", "Dark Matter")).toBeNull();
		expect(commonSeriesPrefix("Project Hail Mary", "Project X")).toBeNull();
	});

	test("long Latin series prefixes still merge", () => {
		expect(
			commonSeriesPrefix(
				"Harry Potter and the Chamber of Secrets",
				"Harry Potter and the Goblet of Fire",
			),
		).toBe("Harry Potter and the");
	});

	test("short-vs-long ratio guard rejects coincidental overlap", () => {
		expect(
			commonSeriesPrefix("魔法科高校の劣等生", "魔法少女育成計画 限定 全部"),
		).toBeNull();
	});

	test("cleanSeriesPrefix trims particles and separators", () => {
		expect(cleanSeriesPrefix("青春ブタ野郎は")).toBe("青春ブタ野郎");
		expect(cleanSeriesPrefix("Series Name - ")).toBe("Series Name");
		expect(cleanSeriesPrefix("シリーズ（")).toBe("シリーズ");
	});
});
