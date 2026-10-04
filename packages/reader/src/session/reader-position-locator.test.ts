import { describe, expect, test } from "bun:test";
import {
	exploredCharacterForLocator,
	locatorForExploredCharacter,
} from "./reader-position";

const sections = [
	{
		reference: "chapter-1",
		charactersWeight: 10,
		startCharacter: 0,
		characters: 15,
	},
	{
		reference: "chapter-1-note",
		charactersWeight: 5,
		parentChapter: "chapter-1",
	},
	{
		reference: "chapter-2",
		charactersWeight: 12,
		startCharacter: 15,
		characters: 12,
	},
];

describe("reader position locator", () => {
	test("maps a global visible character onto its containing main section", () => {
		expect(locatorForExploredCharacter(sections, 12)).toEqual({
			sectionReference: "chapter-1",
			characterOffset: 12,
		});
	});

	test("uses the next section boundary when the previous chapter has children", () => {
		expect(locatorForExploredCharacter(sections, 15)).toEqual({
			sectionReference: "chapter-2",
			characterOffset: 0,
		});
	});

	test("restores from the chapter marker when earlier sections changed length", () => {
		const recounted = sections.map((section) => ({ ...section }));
		recounted[1] = {
			...recounted[1],
			charactersWeight: 20,
		};
		recounted[2] = {
			...recounted[2],
			startCharacter: 30,
		};

		expect(
			exploredCharacterForLocator(recounted, {
				sectionReference: "chapter-2",
				characterOffset: 4,
			}),
		).toBe(34);
	});

	test("clamps an old marker to the current chapter length", () => {
		expect(
			exploredCharacterForLocator(sections, {
				sectionReference: "chapter-2",
				characterOffset: 999,
			}),
		).toBe(27);
	});
});
