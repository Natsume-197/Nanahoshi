import type { CatalogIdentityEvidence } from "./types";

type RegressionCase = {
	name: string;
	left: CatalogIdentityEvidence;
	right: CatalogIdentityEvidence;
	expected: "confirmed" | "indeterminate" | "rejected";
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
