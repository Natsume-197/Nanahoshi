import { describe, expect, test } from "bun:test";
import {
	isAutomaticTitleMatch,
	isTitleSimilar,
	normalizeForComparison,
} from "../title-match";

type BenchmarkCase = {
	name: string;
	inputTitle: string;
	candidateTitle: string;
	inputAuthors?: string[];
	candidateAuthors?: string[];
	expected: boolean;
};

// Fixed quality benchmark: production regressions plus representative valid
// Japanese light-novel matches. Add every future false positive/negative here
// before changing the matcher so improvements remain measurable.
const CASES: BenchmarkCase[] = [
	{
		name: "exact long title",
		inputTitle: "涼宮ハルヒの憂鬱",
		candidateTitle: "涼宮ハルヒの憂鬱",
		expected: true,
	},
	{
		name: "full-width punctuation and volume",
		inputTitle: "アクセル・ワールド１２",
		candidateTitle: "アクセル・ワールド12",
		expected: true,
	},
	{
		name: "distinctive series containment",
		inputTitle: "本好きの下剋上",
		candidateTitle: "本好きの下剋上 第一部",
		expected: true,
	},
	{
		name: "label-polluted title corroborated by author",
		inputTitle: "ガガガ文庫 やはり俺の青春ラブコメはまちがっている。9",
		candidateTitle: "やはり俺の青春ラブコメはまちがっている。9",
		inputAuthors: ["渡航"],
		candidateAuthors: ["渡 航", "Wataru Watari"],
		expected: true,
	},
	{
		name: "short exact title corroborated by author",
		inputTitle: "斜陽",
		candidateTitle: "斜陽",
		inputAuthors: ["太宰治"],
		candidateAuthors: ["太宰 治"],
		expected: true,
	},
	{
		name: "long exact title corroborated by romanized author alias",
		inputTitle: "無職転生 ～異世界行ったら本気だす～",
		candidateTitle: "無職転生 異世界行ったら本気だす",
		inputAuthors: ["理不尽な孫の手"],
		candidateAuthors: ["理不尽な孫の手", "Rifujin na Magonote"],
		expected: true,
	},
	{
		name: "same series and volume",
		inputTitle: "ソード・オラトリア3",
		candidateTitle: "ソード・オラトリア 3巻",
		expected: true,
	},
	{
		name: "斜陽 production false positive",
		inputTitle: "斜陽",
		candidateTitle: "斜陽の国のルスダン",
		inputAuthors: ["太宰治"],
		candidateAuthors: ["並木陽"],
		expected: false,
	},
	{
		name: "青年 production false positive",
		inputTitle: "青年",
		candidateTitle: "家出青年、猫ホストになる",
		inputAuthors: ["森鴎外"],
		candidateAuthors: ["水月さなぎ"],
		expected: false,
	},
	{
		name: "読書 production false positive",
		inputTitle: "読書",
		candidateTitle: "青年のための読書クラブ",
		inputAuthors: ["林田力"],
		candidateAuthors: ["桜庭一樹"],
		expected: false,
	},
	{
		name: "generic katakana containment",
		inputTitle: "スキャンダル",
		candidateTitle: "スイートスキャンダル",
		inputAuthors: ["別の著者"],
		candidateAuthors: ["碧井こなつ"],
		expected: false,
	},
	{
		name: "generic kanji containment without authors",
		inputTitle: "死化粧",
		candidateTitle: "後宮の死化粧妃",
		expected: false,
	},
	{
		name: "same ambiguous title by another author",
		inputTitle: "オセロ",
		candidateTitle: "オセロ",
		inputAuthors: ["藤原チコ"],
		candidateAuthors: ["別の著者"],
		expected: false,
	},
	{
		name: "same distinctive title by another author",
		inputTitle: "夜は短し歩けよ乙女",
		candidateTitle: "夜は短し歩けよ乙女",
		inputAuthors: ["森見登美彦"],
		candidateAuthors: ["別の著者"],
		expected: false,
	},
	{
		name: "conflicting volume",
		inputTitle: "ソード・オラトリア3",
		candidateTitle: "ソード・オラトリア15巻",
		expected: false,
	},
];

type Metrics = {
	truePositive: number;
	trueNegative: number;
	falsePositive: number;
	falseNegative: number;
	precision: number;
	recall: number;
	accuracy: number;
};

function metricsFor(predict: (entry: BenchmarkCase) => boolean): Metrics {
	let truePositive = 0;
	let trueNegative = 0;
	let falsePositive = 0;
	let falseNegative = 0;
	for (const entry of CASES) {
		const predicted = predict(entry);
		if (predicted && entry.expected) truePositive++;
		else if (!predicted && !entry.expected) trueNegative++;
		else if (predicted) falsePositive++;
		else falseNegative++;
	}
	return {
		truePositive,
		trueNegative,
		falsePositive,
		falseNegative,
		precision: truePositive / (truePositive + falsePositive || 1),
		recall: truePositive / (truePositive + falseNegative || 1),
		accuracy: (truePositive + trueNegative) / CASES.length,
	};
}

describe("automatic title-match quality benchmark", () => {
	test("improves precision without reducing recall", () => {
		const baseline = metricsFor((entry) =>
			isTitleSimilar(
				normalizeForComparison(entry.inputTitle),
				normalizeForComparison(entry.candidateTitle),
			),
		);
		const current = metricsFor((entry) => isAutomaticTitleMatch(entry));

		console.table({ baseline, current });

		expect(current.precision).toBeGreaterThan(baseline.precision);
		expect(current.accuracy).toBeGreaterThan(baseline.accuracy);
		expect(current.falsePositive).toBeLessThan(baseline.falsePositive);
		expect(current.recall).toBeGreaterThanOrEqual(baseline.recall);
	});
});
