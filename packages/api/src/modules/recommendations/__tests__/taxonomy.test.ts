import { describe, expect, test } from "bun:test";
import { isGenericRecommendationTerm } from "../taxonomy";
import {
	recommendationTitleKey,
	recommendationTitlesEquivalent,
} from "../title-dedup";

describe("recommendation taxonomy", () => {
	test("filters media and store categories but keeps content genres", () => {
		expect(isGenericRecommendationTerm("Audiobook")).toBe(true);
		expect(isGenericRecommendationTerm("ライトノベル")).toBe(true);
		expect(isGenericRecommendationTerm("ライトノベル(ラノベ)")).toBe(true);
		expect(
			isGenericRecommendationTerm("文学・フィクション・ライトノベル"),
		).toBe(true);
		expect(isGenericRecommendationTerm("ティーン")).toBe(true);
		expect(isGenericRecommendationTerm("anime tie-in")).toBe(true);
		expect(isGenericRecommendationTerm("manga tie-in")).toBe(true);
		expect(isGenericRecommendationTerm("電撃文庫")).toBe(true);
		expect(
			isGenericRecommendationTerm("SF・ホラー・ファンタジー (Kindleストア)"),
		).toBe(true);
		expect(isGenericRecommendationTerm("Fiction")).toBe(true);
		expect(isGenericRecommendationTerm("フィクション")).toBe(true);
		expect(isGenericRecommendationTerm("文学・フィクション")).toBe(true);
		expect(isGenericRecommendationTerm("大衆小説")).toBe(true);
		expect(isGenericRecommendationTerm("現代文学")).toBe(true);
		expect(isGenericRecommendationTerm("キッズ／ヤングアダルト")).toBe(true);
		expect(isGenericRecommendationTerm("ヤングアダルト")).toBe(true);
		expect(isGenericRecommendationTerm("fantasy")).toBe(false);
		expect(isGenericRecommendationTerm("girls love")).toBe(false);
		expect(isGenericRecommendationTerm("science fiction")).toBe(false);
		expect(isGenericRecommendationTerm("サイエンスフィクション")).toBe(false);
	});

	test("collapses provider taglines wrapped in wave dashes", () => {
		expect(
			recommendationTitleKey(
				"本好きの下剋上 ～司書になるためには手段を選んでいられません～",
			),
		).toBe(recommendationTitleKey("本好きの下剋上"));
	});
});

describe("recommendation title deduplication", () => {
	test("normalizes width, punctuation, and whitespace", () => {
		expect(recommendationTitleKey("新装版　ロードス島戦記")).toBe(
			recommendationTitleKey("新装版 ロードス島戦記"),
		);
	});

	test("treats a sufficiently specific subtitle variant as equivalent", () => {
		expect(
			recommendationTitlesEquivalent(
				"新装版ロードス島戦記",
				"新装版ロードス島戦記灰色の魔女",
			),
		).toBe(true);
	});

	test("does not collapse an ordinary title prefix that may be a sequel", () => {
		expect(
			recommendationTitlesEquivalent(
				"この素晴らしい世界に祝福を",
				"この素晴らしい世界に祝福をよりみち",
			),
		).toBe(false);
	});
});
