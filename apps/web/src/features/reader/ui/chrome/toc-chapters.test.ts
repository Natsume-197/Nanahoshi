import { describe, expect, test } from "bun:test";
import type { SectionWithProgress } from "@/features/reader/document/types";
import { tocChapters } from "./toc-chapters";

const section = (
	reference: string,
	extra: Partial<SectionWithProgress> = {},
): SectionWithProgress => ({
	reference,
	charactersWeight: 1,
	progress: 0,
	...extra,
});

describe("tocChapters", () => {
	test("hides unlabeled front matter when the book has a TOC", () => {
		const chapters = tocChapters([
			section("cover"),
			section("title-page"),
			section("prologue", { label: "プロローグ" }),
			section("prologue-2", { parentChapter: "prologue" }),
			section("chapter-1", { label: "新しい探索者" }),
		]);

		expect(chapters.map((chapter) => chapter.title)).toEqual([
			"プロローグ",
			"新しい探索者",
		]);
	});

	test("numbers sections when the book has no TOC", () => {
		const chapters = tocChapters([section("a"), section("b")]);

		expect(chapters.map((chapter) => chapter.title)).toEqual([
			"Section 1",
			"Section 2",
		]);
	});
});
