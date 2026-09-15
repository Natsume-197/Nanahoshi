import { describe, expect, test } from "bun:test";
import {
	countTextCharacters,
	countTextCharactersBeforeOffset,
	sourceOffsetForCharacterCount,
} from "./character-count";

describe("reader character coordinates", () => {
	test("counts letters and numbers across writing systems", () => {
		expect(countTextCharacters("日本語 한국어 Привет مرحبا 123!")).toBe(20);
	});

	test("converts between UTF-16 offsets and reader character counts", () => {
		const text = "A𠮟る B";
		expect(countTextCharactersBeforeOffset(text, 3)).toBe(2);
		expect(sourceOffsetForCharacterCount(text, 2)).toBe(3);
	});
});
