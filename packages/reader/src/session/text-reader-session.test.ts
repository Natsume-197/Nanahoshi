import { describe, expect, test } from "bun:test";
import { createTextReaderSession } from "./text-reader-session";

describe("TextReaderSession", () => {
	const session = createTextReaderSession({
		sections: [
			{
				reference: "chapter-one",
				charactersWeight: 40,
				startCharacter: 0,
				characters: 40,
			},
			{
				reference: "chapter-two",
				charactersWeight: 60,
				startCharacter: 40,
				characters: 60,
			},
		],
		getCharacterCount: () => 100,
	});

	test("keeps position and chapter progress independent of a layout", () => {
		expect(session.positionFor(55).exploredCharCount).toBe(55);
		expect(
			[...session.sectionProgressFor(55).values()].map(
				(section) => section.progress,
			),
		).toEqual([100, 25]);
	});

	test("uses parsed ranges when a layout has no section character metadata", () => {
		const rangeSession = createTextReaderSession({
			sections: [{ reference: "chapter", charactersWeight: 1 }],
			getCharacterCount: () => 20,
		});

		expect(
			rangeSession
				.sectionProgressFor(
					15,
					new Map([["chapter", { startCharacter: 10, endCharacter: 20 }]]),
				)
				.get("chapter")?.progress,
		).toBe(50);
	});
});
