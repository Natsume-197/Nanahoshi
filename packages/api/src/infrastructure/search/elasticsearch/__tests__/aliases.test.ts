import { describe, expect, test } from "bun:test";
import { buildAudiobookSearchRequest } from "../audiobook.query";
import { buildNameQuery } from "../search.client";
import { buildSearchRequest } from "../search.query";

const schema = async (name: string) =>
	JSON.parse(
		await Bun.file(new URL(`../${name}`, import.meta.url)).text(),
	) as Record<string, unknown>;

describe("Elasticsearch series aliases", () => {
	test("maps aliases in series, ebook, and audiobook indexes", async () => {
		for (const name of [
			"series.schema.json",
			"search.schema.json",
			"audiobooks.schema.json",
		]) {
			const json = JSON.stringify(await schema(name));
			expect(json).toContain('"aliases":{"type":"text"');
		}
	});

	test("searches aliases below canonical series names", () => {
		const query = JSON.stringify(buildNameQuery("oregairu"));
		expect(query).toContain("name^10");
		expect(query).toContain("aliases^7");
		expect(query.indexOf("name^10")).toBeLessThan(query.indexOf("aliases^7"));
	});

	test("includes derived series aliases in item searches", () => {
		const books = JSON.stringify(
			buildSearchRequest("books", { query: "oregairu" }),
		);
		const audiobooks = JSON.stringify(
			buildAudiobookSearchRequest("audiobooks", { query: "oregairu" }),
		);

		expect(books).toContain("series.aliases^4");
		expect(audiobooks).toContain("series.aliases^4");
	});
});
