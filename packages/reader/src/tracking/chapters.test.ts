import { expect, test } from "bun:test";
import { readerChapters } from "./chapters";

test("reader chapters keep labelled top-level sections as book fractions", () => {
	expect(
		readerChapters(
			[
				{ startCharacter: 0 },
				{ label: " 第一章 ", startCharacter: 100 },
				{ label: "節", startCharacter: 150, parentChapter: "c1" },
				{ label: "第二章", startCharacter: 600 },
				{ label: "目次" },
			],
			1000,
		),
	).toEqual([
		{ title: "第一章", start: 0.1 },
		{ title: "第二章", start: 0.6 },
	]);
	expect(readerChapters([{ startCharacter: 0 }], 1000)).toBeNull();
	expect(readerChapters([{ label: "a", startCharacter: 0 }], 0)).toBeNull();
});

test("reader chapters skip tiny front matter but keep short chapters later on", () => {
	const sections = [
		{ label: "表紙", startCharacter: 0 },
		{ label: "目次", startCharacter: 2 },
		{ label: "一章", startCharacter: 40 },
		{ label: "幕間", startCharacter: 5000 },
		{ label: "二章", startCharacter: 5050 },
	];
	expect(readerChapters(sections, 10_000)?.map((c) => c.title)).toEqual([
		"一章",
		"幕間",
		"二章",
	]);
});
