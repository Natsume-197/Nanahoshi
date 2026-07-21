import { describe, expect, test } from "bun:test";
import { buildAudiobookSearchRequest } from "../audiobook.query";
import { buildSort } from "../query-builder.utils";
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

	test("relevance sort tie-breaks by seriesPosition before recency", () => {
		const sort = JSON.stringify(buildSort("relevance", true));
		const positionIdx = sort.indexOf("seriesPosition");
		expect(positionIdx).toBeGreaterThan(sort.indexOf("_score"));
		expect(positionIdx).toBeLessThan(sort.indexOf("createdAt"));
		expect(sort).toContain('"missing":"_last"');
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
