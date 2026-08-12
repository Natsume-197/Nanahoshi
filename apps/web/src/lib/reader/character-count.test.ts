import { describe, expect, test } from "bun:test";
import { JSDOM } from "jsdom";
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

	test("loads in the same DOM environment used by book parsing", () => {
		const dom = new JSDOM("<p>مرحبا</p>");
		expect(
			countTextCharacters(dom.window.document.body.textContent ?? ""),
		).toBe(5);
	});
});
