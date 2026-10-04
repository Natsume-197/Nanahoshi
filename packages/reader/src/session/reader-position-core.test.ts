import { describe, expect, test } from "bun:test";
import { createReaderPositionCore } from "./reader-position";

const sections = [
	{
		reference: "chapter-1",
		charactersWeight: 10,
		startCharacter: 0,
		characters: 20,
	},
	{
		reference: "chapter-2",
		charactersWeight: 10,
		startCharacter: 20,
		characters: 30,
	},
];

describe("reader position core", () => {
	test("creates the canonical position shared by both reader engines", () => {
		const core = createReaderPositionCore({
			sections,
			getCharacterCount: () => 50,
			now: () => 123,
		});

		expect(core.positionFor(24, { scrollY: 640 })).toEqual({
			exploredCharCount: 24,
			progress: 0.48,
			scrollY: 640,
			modifiedAt: 123,
			locator: { sectionReference: "chapter-2", characterOffset: 4 },
		});
	});

	test("keeps a valid exact coordinate instead of degrading an image position", () => {
		const core = createReaderPositionCore({
			sections,
			getCharacterCount: () => 50,
		});

		expect(
			core.planRestore(
				{
					exploredCharCount: 24,
					progress: 0.48,
					modifiedAt: 1,
					locator: { sectionReference: "chapter-1", characterOffset: 2 },
				},
				true,
			),
		).toEqual({ exploredCharCount: 24, useExactCoordinate: true });
	});

	test("falls back to the chapter marker when the exact coordinate is stale", () => {
		const core = createReaderPositionCore({
			sections,
			getCharacterCount: () => 50,
		});

		expect(
			core.planRestore(
				{
					exploredCharCount: 6,
					progress: 0.12,
					modifiedAt: 1,
					locator: { sectionReference: "chapter-2", characterOffset: 4 },
				},
				false,
			),
		).toEqual({ exploredCharCount: 24, useExactCoordinate: false });
	});

	test("clamps a coordinate to the measured document", () => {
		const core = createReaderPositionCore({
			sections,
			getCharacterCount: () => 50,
		});

		expect(core.positionFor(99).exploredCharCount).toBe(50);
	});
});
