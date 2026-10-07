import { describe, expect, mock, test } from "bun:test";
import type { ReadListenPairing } from "@nanahoshi/api/routers/read-listen/read-listen.service";

mock.module("expo-localization", () => ({
	getLocales: () => [{ languageCode: "en" }],
}));
mock.module("expo-secure-store", () => ({
	getItem: () => null,
	setItem: () => undefined,
}));

const { sortPairings } = await import("./model");

const pair = (id: string, title: string, author: string, createdAt: string) =>
	({
		id,
		createdAt,
		audiobook: { title, authors: [{ name: author }] },
		ebook: { title: `${title} (ebook)`, authors: [] },
	}) as unknown as ReadListenPairing;

const pairs = [
	pair("a", "Kino", "Shigusawa", "2026-01-02T00:00:00.000Z"),
	pair("b", "Accel World", "Kawahara", "2026-03-01T00:00:00.000Z"),
	pair("c", "Haruhi", "Tanigawa", "2026-02-01T00:00:00.000Z"),
];

describe("sortPairings", () => {
	test("recent puts the newest pairing first", () => {
		expect(sortPairings(pairs, "recent").map((p) => p.id)).toEqual([
			"b",
			"c",
			"a",
		]);
	});

	test("title orders by the audiobook's title", () => {
		expect(sortPairings(pairs, "title").map((p) => p.id)).toEqual([
			"b",
			"c",
			"a",
		]);
	});

	test("author orders by the audiobook's authors", () => {
		expect(sortPairings(pairs, "author").map((p) => p.id)).toEqual([
			"b",
			"a",
			"c",
		]);
	});

	test("leaves the loaded pages untouched", () => {
		sortPairings(pairs, "title");
		expect(pairs.map((p) => p.id)).toEqual(["a", "b", "c"]);
	});
});
