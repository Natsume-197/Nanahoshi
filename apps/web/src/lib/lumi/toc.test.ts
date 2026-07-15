import { describe, expect, it } from "bun:test";
import type { Book } from "@lostcoords/lumi-epub";
import { buildTocSections, positionForTocReference } from "./toc";

function testBook(): Book {
	return {
		sections: [
			{
				spineIndex: 0,
				href: "OPS/chapter-1.xhtml",
				startAtom: 0,
				endAtom: 100,
			},
			{
				spineIndex: 1,
				href: "OPS/chapter-2.xhtml",
				startAtom: 100,
				endAtom: 300,
			},
		],
		chapters: [
			{
				label: "Chapter 2, part 2",
				target: { spineIndex: 1, offset: 45 },
				children: [],
			},
		],
		totalAtoms: 300,
	} as Book;
}

describe("Lumi TOC navigation", () => {
	it("keeps chapter offsets relative to their section", () => {
		const book = testBook();
		const sections = buildTocSections(book, 150);

		expect([...sections.keys()]).toEqual(["1:45"]);
		expect(sections.get("1:45")?.startCharacter).toBe(145);

		const position = positionForTocReference(book, "1:45");
		expect(position?.locator).toEqual({
			spineIndex: 1,
			spineHref: "OPS/chapter-2.xhtml",
			atomOffset: 45,
		});
		expect(position?.progress.globalAtomOffset).toBe(145);
	});

	it("rejects malformed and out-of-range references", () => {
		const book = testBook();

		expect(positionForTocReference(book, "1")).toBeNull();
		expect(positionForTocReference(book, "1:-1")).toBeNull();
		expect(positionForTocReference(book, "2:0")).toBeNull();
	});
});
