import "@/test-utils/setup-dom";
import { describe, expect, it } from "bun:test";
import { recountBookData } from "../recount-book-data";
import { BOOK_COUNT_VERSION, type ReaderBookData } from "../types";

function bookData(
	elementHtml: string,
	sections: ReaderBookData["sections"],
): ReaderBookData {
	return {
		uuid: "u1",
		title: "t",
		language: "ja",
		elementHtml,
		styleSheet: "",
		blobs: {},
		characters: 0,
		sections,
		storedAt: 0,
	};
}

describe("recountBookData", () => {
	it("recounts an image-only book cached with characters: 0", () => {
		const data = bookData(
			'<div id="ttu-a"><img src="p1.png"/><img src="p2.png"/></div>' +
				'<div id="ttu-b"><img src="p3.png"/></div>',
			[
				{ reference: "ttu-a", charactersWeight: 1, label: "Ch 1" },
				{ reference: "ttu-b", charactersWeight: 1, parentChapter: "ttu-a" },
			],
		);

		const result = recountBookData(data, document);

		expect(result.characters).toBe(3);
		expect(result.countVersion).toBe(BOOK_COUNT_VERSION);
		expect(result.sections[0]).toMatchObject({
			reference: "ttu-a",
			charactersWeight: 2,
			startCharacter: 0,
			characters: 3,
		});
		expect(result.sections[1]).toMatchObject({
			reference: "ttu-b",
			charactersWeight: 1,
			parentChapter: "ttu-a",
		});
	});

	it("computes startCharacter as the running total of previous main chapters", () => {
		const data = bookData(
			'<div id="ttu-a"><p>ねこねこ</p></div>' +
				'<div id="ttu-b"><img src="p.png"/></div>' +
				'<div id="ttu-c"><p>いぬ</p></div>',
			[
				{ reference: "ttu-a", charactersWeight: 1, label: "Ch 1" },
				{ reference: "ttu-b", charactersWeight: 1, parentChapter: "ttu-a" },
				{ reference: "ttu-c", charactersWeight: 1, label: "Ch 2" },
			],
		);

		const result = recountBookData(data, document);

		expect(result.characters).toBe(7);
		expect(result.sections[0]).toMatchObject({
			startCharacter: 0,
			characters: 5,
		});
		expect(result.sections[2]).toMatchObject({
			startCharacter: 5,
			characters: 2,
		});
	});

	it("leaves books without sections consistent", () => {
		const data = bookData('<div id="ttu-a"><p>ねこ</p></div>', []);
		const result = recountBookData(data, document);
		expect(result.characters).toBe(2);
		expect(result.sections).toEqual([]);
	});

	it("does not mutate the input data", () => {
		const sections = [
			{ reference: "ttu-a", charactersWeight: 1, label: "Ch 1" },
		];
		const data = bookData('<div id="ttu-a"><img src="p.png"/></div>', sections);
		recountBookData(data, document);
		expect(data.characters).toBe(0);
		expect(data.sections[0].charactersWeight).toBe(1);
		expect(data.sections[0].characters).toBeUndefined();
	});
});
