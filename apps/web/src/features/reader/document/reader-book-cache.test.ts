import { describe, expect, test } from "bun:test";
import type { ReaderBookData } from "@/features/reader/document/types";
import { applyReaderBookFacts } from "./reader-book-cache";

const data: ReaderBookData = {
	uuid: "book-1",
	sourceFormat: "epub",
	contentForm: "text",
	title: "Book",
	cover: null,
	language: "ja",
	elementHtml: "<div></div>",
	styleSheet: "",
	blobs: {},
	characters: 42,
	sections: [
		{ reference: "chapter-1", charactersWeight: 12, characters: 12 },
		{ reference: "chapter-2", charactersWeight: 30, characters: 30 },
	],
};

describe("reader book facts", () => {
	test("restores facts for the same section order", () => {
		const facts = {
			...data,
			schemaVersion: 2 as const,
			sectionCharacterCounts: [12, 30],
		};
		const rebuilt = {
			...data,
			characters: 0,
			sections: data.sections.map((section) => ({
				...section,
				charactersWeight: 1,
				characters: undefined,
			})),
		};

		expect(applyReaderBookFacts(rebuilt, facts)).toMatchObject({
			characters: 42,
			sections: [
				{ reference: "chapter-1", charactersWeight: 12, characters: 12 },
				{ reference: "chapter-2", charactersWeight: 30, characters: 30 },
			],
		});
	});

	test("rejects facts when the source section order changed", () => {
		const facts = {
			...data,
			schemaVersion: 2 as const,
			sectionCharacterCounts: [12, 30],
		};
		expect(
			applyReaderBookFacts(
				{ ...data, sections: [...data.sections].reverse() },
				facts,
			),
		).toBeUndefined();
	});
});
