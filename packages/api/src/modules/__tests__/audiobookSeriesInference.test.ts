import { describe, expect, test } from "bun:test";
import { inferSeriesFromTitle } from "../audiobookSeriesInference";

describe("inferSeriesFromTitle", () => {
	test.each([
		"[28] 死物語 上 [B09DZXZ7F1]",
		"[19] ティアムーン帝国物語18 [B0G12QKTSN]",
		"[16] ティアムーン帝国物語短編集",
		"[番外編2巻] 86 Alter.2",
		"[1-3巻] Collection",
	])("does not infer an index, extra or range: %s", (title) => {
		expect(inferSeriesFromTitle(title)).toBeNull();
	});
	test("an explicit volume beats the import index", () => {
		expect(inferSeriesFromTitle("[19] [18巻] ティアムーン帝国物語18")).toEqual({
			seriesName: "ティアムーン帝国物語",
			position: 18,
		});
	});
	test("normalizes fullwidth decimal markers", () => {
		expect(inferSeriesFromTitle("［６．５巻］ 弱キャラ友崎くん")).toEqual({
			seriesName: "弱キャラ友崎くん",
			position: 6.5,
		});
	});
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
