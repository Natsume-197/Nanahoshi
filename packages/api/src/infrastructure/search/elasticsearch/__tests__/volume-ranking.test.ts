import { describe, expect, test } from "bun:test";
import { buildAudiobookSearchRequest } from "../audiobook.query";
import { buildSort, computeRelevanceSortKey } from "../query-builder.utils";
import { buildSearchRequest } from "../search.query";

const schema = async (name: string) =>
	JSON.parse(
		await Bun.file(new URL(`../${name}`, import.meta.url)).text(),
	) as Record<string, unknown>;

describe("Elasticsearch volume-aware ranking", () => {
	test("maps seriesPosition and titleVolume in ebook and audiobook indexes", async () => {
		for (const name of ["search.schema.json", "audiobooks.schema.json"]) {
			const json = JSON.stringify(await schema(name));
			expect(json).toContain('"seriesPosition":{"type":"double"}');
			expect(json).toContain('"titleVolume":{"type":"double"}');
		}
	});

	test("relevance sort applies the conditional tier before text score", () => {
		const sort = JSON.stringify(
			buildSort("relevance", true, {
				original: "konosuba",
				matchText: "konosuba",
				volume: null,
			}),
		);
		expect(sort.indexOf('"_script"')).toBeLessThan(sort.indexOf('"_score"'));
		expect(sort).toContain('"matchText":"konosuba"');
		expect(sort).toContain("seriesExact");
	});

	test("offline comparison: series intent improves random score order to reading order", () => {
		const candidates = [
			{
				id: "vol-1",
				textScore: 7,
				seriesName: "Konosuba",
				seriesPosition: 1,
			},
			{
				id: "vol-2",
				textScore: 10,
				seriesName: "Konosuba",
				seriesPosition: 2,
			},
			{
				id: "vol-3",
				textScore: 8,
				seriesName: "Konosuba",
				seriesPosition: 3,
				titleVolume: 3,
			},
		];
		const intent = {
			original: "konosuba",
			matchText: "konosuba",
			volume: null,
		};
		const before = [...candidates]
			.sort(
				(a, b) =>
					b.textScore - a.textScore ||
					(a.seriesPosition ?? Number.POSITIVE_INFINITY) -
						(b.seriesPosition ?? Number.POSITIVE_INFINITY),
			)
			.map((candidate) => candidate.id);
		const after = [...candidates]
			.sort(
				(a, b) =>
					computeRelevanceSortKey(b, intent) -
						computeRelevanceSortKey(a, intent) || b.textScore - a.textScore,
			)
			.map((candidate) => candidate.id);

		expect(before).toEqual(["vol-2", "vol-3", "vol-1"]);
		expect(after).toEqual(["vol-1", "vol-2", "vol-3"]);
	});

	test("offline comparison: explicit number promotes the requested volume", () => {
		const candidates = [
			{
				id: "vol-1",
				textScore: 7,
				seriesName: "Konosuba",
				seriesPosition: 1,
			},
			{
				id: "vol-2",
				textScore: 10,
				seriesName: "Konosuba",
				seriesPosition: 2,
			},
			{
				id: "vol-3",
				textScore: 8,
				seriesName: "Konosuba",
				seriesPosition: 4,
				titleVolume: 3,
			},
		];
		const intent = {
			original: "konosuba 3",
			matchText: "konosuba",
			volume: 3,
		};
		const before = [...candidates]
			.sort((a, b) => b.textScore - a.textScore)
			.map((candidate) => candidate.id);
		const after = [...candidates]
			.sort(
				(a, b) =>
					computeRelevanceSortKey(b, intent) -
						computeRelevanceSortKey(a, intent) || b.textScore - a.textScore,
			)
			.map((candidate) => candidate.id);

		expect(before).toEqual(["vol-2", "vol-3", "vol-1"]);
		expect(after).toEqual(["vol-3", "vol-1", "vol-2"]);
	});

	test("position does not influence unrelated matches", () => {
		const intent = {
			original: "adventure",
			matchText: "adventure",
			volume: null,
		};
		const lowPosition = {
			title: "Fantasy Chronicle",
			seriesName: "Unrelated Saga",
			seriesPosition: 1,
		};
		const highPosition = {
			title: "A Great Adventure",
			seriesName: "Another Story",
			seriesPosition: 20,
		};

		expect(computeRelevanceSortKey(lowPosition, intent)).toBe(0);
		expect(computeRelevanceSortKey(highPosition, intent)).toBe(0);
	});

	test("position only orders an exact series, not several prefix matches", () => {
		const intent = {
			original: "kono",
			matchText: "kono",
			volume: null,
		};
		const first = computeRelevanceSortKey(
			{ seriesName: "Konosuba", seriesPosition: 1 },
			intent,
		);
		const later = computeRelevanceSortKey(
			{ seriesName: "Konosuba Spinoff", seriesPosition: 20 },
			intent,
		);

		expect(first).toBe(later);
	});

	test("explicit volume does not promote an unrelated series", () => {
		const key = computeRelevanceSortKey(
			{
				title: "Unrelated Story Volume 3",
				seriesName: "Unrelated Story",
				seriesPosition: 3,
				titleVolume: 3,
			},
			{
				original: "konosuba 3",
				matchText: "konosuba",
				volume: 3,
			},
		);

		expect(key).toBe(0);
	});

	test("volume intent boosts title number above series position and recalls via stripped text", () => {
		const request = JSON.stringify(
			buildSearchRequest("books", { query: "konosuba 3" }),
		);
		// title number is ground truth (positions drift), so it outweighs position
		expect(request).toContain('"term":{"titleVolume":3}');
		expect(request).toContain('"weight":200');
		expect(request).toContain('"term":{"seriesPosition":3}');
		expect(request).toContain('"weight":100');
		// dis_max recalls both the literal query and the stripped series text
		expect(request).toContain('"query":"konosuba 3"');
		expect(request).toContain('"query":"konosuba"');
	});

	test("audiobook requests get the same volume boosts", () => {
		const request = JSON.stringify(
			buildAudiobookSearchRequest("audiobooks", { query: "konosuba 3" }),
		);
		expect(request).toContain('"term":{"titleVolume":3}');
		expect(request).toContain('"term":{"seriesPosition":3}');
		expect(request).toContain('"query":"konosuba"');
	});

	test("no volume intent leaves the query without a position boost", () => {
		const request = JSON.stringify(
			buildSearchRequest("books", { query: "konosuba" }),
		);
		expect(request).not.toContain('"term":{"seriesPosition"');
	});

	test("exactMatch disables volume intent", () => {
		const request = JSON.stringify(
			buildSearchRequest("books", { query: "konosuba 3", exactMatch: true }),
		);
		expect(request).not.toContain('"term":{"seriesPosition"');
		expect(request).toContain('\\"konosuba 3\\"');
	});
});
