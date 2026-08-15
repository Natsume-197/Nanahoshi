import { describe, expect, test } from "bun:test";
import {
	defaultReaderSettings,
	getReaderScrollbarTrackColor,
	normalizeReaderSettings,
	READER_FONT_SIZE_MAX,
	READER_FONT_SIZE_MIN,
	READER_LINE_HEIGHT_MAX,
} from "./settings";

test("the document scrollbar track does not create a gap beside the book", () => {
	const backgroundColor = "rgba(18, 18, 18, 1)";
	expect(
		getReaderScrollbarTrackColor({
			fontColor: "white",
			backgroundColor,
			selectionFontColor: "white",
			selectionBackgroundColor: "black",
			hintFuriganaShadowColor: "black",
			hintFuriganaFontColor: "white",
			tooltipTextFontColor: "white",
		}),
	).toBe(backgroundColor);
});

describe("reader settings normalization", () => {
	test("migrates the old ragged CJK default while preserving later opt-outs", () => {
		expect(
			normalizeReaderSettings({ enableTextJustification: false })
				.enableTextJustification,
		).toBe(true);
		expect(
			normalizeReaderSettings({
				settingsVersion: 2,
				enableTextJustification: false,
			}).enableTextJustification,
		).toBe(false);
	});

	test("clamps layout values that could make the reader unusable", () => {
		const normalized = normalizeReaderSettings({
			fontSize: Number.POSITIVE_INFINITY,
			lineHeight: 99,
			firstDimensionMargin: -500,
			secondDimensionMaxValue: 99_999,
			pageColumns: 50,
			maxCachedBooks: 0,
		});

		expect(normalized.fontSize).toBe(defaultReaderSettings.fontSize);
		expect(normalized.lineHeight).toBe(READER_LINE_HEIGHT_MAX);
		expect(normalized.firstDimensionMargin).toBe(0);
		expect(normalized.secondDimensionMaxValue).toBe(10_000);
		expect(normalized.pageColumns).toBe(2);
		expect(normalized.maxCachedBooks).toBe(1);
	});

	test("keeps the public text limits stable", () => {
		expect(normalizeReaderSettings({ fontSize: -20 }).fontSize).toBe(
			READER_FONT_SIZE_MIN,
		);
		expect(normalizeReaderSettings({ fontSize: 500 }).fontSize).toBe(
			READER_FONT_SIZE_MAX,
		);
	});

	test("rejects corrupted enum and boolean values from storage", () => {
		const normalized = normalizeReaderSettings({
			writingMode: "diagonal",
			readingPositionMode: "sometimes",
			textMarginMode: "huge",
			hideFurigana: "yes",
			fontWeight: -10,
		});

		expect(normalized.writingMode).toBe(defaultReaderSettings.writingMode);
		expect(normalized.readingPositionMode).toBe(
			defaultReaderSettings.readingPositionMode,
		);
		expect(normalized.textMarginMode).toBe(
			defaultReaderSettings.textMarginMode,
		);
		expect(normalized.hideFurigana).toBe(defaultReaderSettings.hideFurigana);
		expect(normalized.fontWeight).toBe(100);
	});

	test("migrates retired Water and Gray themes to the default", () => {
		expect(normalizeReaderSettings({ theme: "water-theme" }).theme).toBe(
			defaultReaderSettings.theme,
		);
		expect(normalizeReaderSettings({ theme: "gray-theme" }).theme).toBe(
			defaultReaderSettings.theme,
		);
	});

	test("keeps automatic and bookmark resume modes explicit", () => {
		expect(
			normalizeReaderSettings({ readingPositionMode: "automatic" })
				.readingPositionMode,
		).toBe("automatic");
		expect(
			normalizeReaderSettings({ readingPositionMode: "bookmark" })
				.readingPositionMode,
		).toBe("bookmark");
	});
});
