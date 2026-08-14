import type { CatalogIdentityEvidence } from "./types";

type RegressionCase = {
	name: string;
	left: CatalogIdentityEvidence;
	right: CatalogIdentityEvidence;
	expected: "confirmed" | "indeterminate" | "rejected";
	expectedDiscoveryTitle?: string;
};

const written = (
	title: string,
	authors: string[],
): CatalogIdentityEvidence => ({ kind: "book", title, authors });

/** Production matching mistakes that must remain fixed across providers. */
export const CATALOG_IDENTITY_REGRESSION_CORPUS = [
	{
		name: "Oregairu slash-separated local credits",
		left: written("やはり俺の青春ラブコメはまちがっている。9", [
			"渡航 / ぽんかん⑧",
		]),
		right: written("やはり俺の青春ラブコメはまちがっている。9", [
			"渡航",
			"ぽんかん⑧",
		]),
		expected: "confirmed",
	},
	{
		name: "Oregairu volume 6 with repeated Kindle imprint title",
		left: written(
			"やはり俺の青春ラブコメはまちがっている。6 ガガガ文庫 やはり俺の青春ラブコメはまちがっている",
			["渡航"],
		),
		right: written("やはり俺の青春ラブコメはまちがっている。6", ["渡航"]),
		expected: "confirmed",
		expectedDiscoveryTitle: "やはり俺の青春ラブコメはまちがっている。6",
	},
	{
		name: "Oregairu volume 7 with repeated Kindle imprint title",
		left: written(
			"やはり俺の青春ラブコメはまちがっている。7 ガガガ文庫 やはり俺の青春ラブコメはまちがっている",
			["渡航"],
		),
		right: written("やはり俺の青春ラブコメはまちがっている。7", ["渡航"]),
		expected: "confirmed",
		expectedDiscoveryTitle: "やはり俺の青春ラブコメはまちがっている。7",
	},
	{
		name: "Oregairu volume 7.5 with repeated Kindle imprint title",
		left: written(
			"やはり俺の青春ラブコメはまちがっている。7.5 ガガガ文庫 やはり俺の青春ラブコメはまちがっている",
			["渡航"],
		),
		right: written("やはり俺の青春ラブコメはまちがっている。7.5", ["渡航"]),
		expected: "confirmed",
		expectedDiscoveryTitle: "やはり俺の青春ラブコメはまちがっている。7.5",
	},
	{
		name: "Oregairu volume 8 with repeated Kindle imprint title",
		left: written(
			"やはり俺の青春ラブコメはまちがっている。8 ガガガ文庫 やはり俺の青春ラブコメはまちがっている",
			["渡航"],
		),
		right: written("やはり俺の青春ラブコメはまちがっている。8", ["渡航"]),
		expected: "confirmed",
		expectedDiscoveryTitle: "やはり俺の青春ラブコメはまちがっている。8",
	},
	{
		name: "Oregairu volume 11 with repeated illustrated-edition title",
		left: written(
			"ガガガ文庫 やはり俺の青春ラブコメはまちがっている。11（イラスト完全版） ガガガ文庫 やはり俺の青春ラブコメはまちがっている。（イラスト完全版）",
			["渡航"],
		),
		right: written("やはり俺の青春ラブコメはまちがっている。11", ["渡航"]),
		expected: "confirmed",
		expectedDiscoveryTitle: "やはり俺の青春ラブコメはまちがっている。11",
	},
	{
		name: "Oregairu anthology 1 with an omitted number boundary",
		left: written(
			"やはり俺の青春ラブコメはまちがっている。アンソロジー１　雪乃ｓｉｄｅ",
			["石川博品／さがら総／天津向／水沢夢／裕時悠示／渡航"],
		),
		right: written(
			"やはり俺の青春ラブコメはまちがっている。アンソロジー 1 雪乃side",
			["石川博品", "さがら総", "天津向", "水沢夢", "裕時悠示", "渡航"],
		),
		expected: "confirmed",
		expectedDiscoveryTitle:
			"やはり俺の青春ラブコメはまちがっている。アンソロジー 1 雪乃side",
	},
	{
		name: "Oregairu anthology 4 with an omitted number boundary",
		left: written(
			"やはり俺の青春ラブコメはまちがっている。アンソロジー４　オールスターズ",
			["石川博品／王雀孫／川岸殴魚／境田吉孝／さがら総／天津向／渡航"],
		),
		right: written(
			"やはり俺の青春ラブコメはまちがっている。アンソロジー 4 オールスターズ",
			[
				"石川博品",
				"王雀孫",
				"川岸殴魚",
				"境田吉孝",
				"さがら総",
				"天津向",
				"渡航",
			],
		),
		expected: "confirmed",
		expectedDiscoveryTitle:
			"やはり俺の青春ラブコメはまちがっている。アンソロジー 4 オールスターズ",
	},
	{
		name: "Dazai title prefix false positive",
		left: written("斜陽", ["太宰治"]),
		right: written("斜陽の国のルスダン", ["並木陽"]),
		expected: "rejected",
	},
	{
		name: "Mori title substring false positive",
		left: written("青年", ["森鴎外"]),
		right: written("家出青年、猫ホストになる", ["水月さなぎ"]),
		expected: "rejected",
	},
	{
		name: "same title with conflicting authors",
		left: written("オセロ", ["藤原チコ"]),
		right: written("オセロ", ["別の著者"]),
		expected: "rejected",
	},
] as const satisfies readonly RegressionCase[];
