import "@/test-utils/setup-dom";

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { cleanup, render, waitFor } from "@testing-library/react";
import type { BookReaderApi } from "@/features/reader/reader-contract";
import { BookReaderContinuous } from "./book-reader-continuous";

let htmlPrototype: typeof HTMLElement.prototype;
let rangePrototype: typeof window.Range.prototype;
let originalClientHeight: PropertyDescriptor | undefined;
let originalClientWidth: PropertyDescriptor | undefined;
let originalScrollTo: typeof HTMLElement.prototype.scrollTo;
let originalRangeRect: typeof window.Range.prototype.getBoundingClientRect;
let originalFonts: PropertyDescriptor | undefined;
let originalMatchMedia: PropertyDescriptor | undefined;

beforeEach(() => {
	htmlPrototype = HTMLElement.prototype;
	rangePrototype = window.Range.prototype;
	originalClientHeight = Object.getOwnPropertyDescriptor(
		htmlPrototype,
		"clientHeight",
	);
	originalClientWidth = Object.getOwnPropertyDescriptor(
		htmlPrototype,
		"clientWidth",
	);
	originalScrollTo = htmlPrototype.scrollTo;
	originalRangeRect = rangePrototype.getBoundingClientRect;
	originalFonts = Object.getOwnPropertyDescriptor(document, "fonts");
	originalMatchMedia = Object.getOwnPropertyDescriptor(window, "matchMedia");

	Object.defineProperty(htmlPrototype, "clientHeight", {
		configurable: true,
		get: () => 700,
	});
	Object.defineProperty(htmlPrototype, "clientWidth", {
		configurable: true,
		get: () => 1000,
	});
	htmlPrototype.scrollTo = function scrollTo(options) {
		if (typeof options === "object") {
			this.scrollLeft = options.left ?? this.scrollLeft;
			this.scrollTop = options.top ?? this.scrollTop;
		}
	};
	Object.defineProperty(rangePrototype, "getBoundingClientRect", {
		configurable: true,
		value: () => ({
			top: 0,
			right: 10,
			bottom: 10,
			left: 0,
			width: 10,
			height: 10,
			x: 0,
			y: 0,
			toJSON: () => ({}),
		}),
	});
	Object.defineProperty(document, "fonts", {
		configurable: true,
		value: { ready: Promise.resolve() },
	});
	Object.defineProperty(window, "matchMedia", {
		configurable: true,
		value: () => ({ matches: false }),
	});
});

afterEach(() => {
	cleanup();
	if (originalClientHeight) {
		Object.defineProperty(htmlPrototype, "clientHeight", originalClientHeight);
	} else Reflect.deleteProperty(htmlPrototype, "clientHeight");
	if (originalClientWidth) {
		Object.defineProperty(htmlPrototype, "clientWidth", originalClientWidth);
	} else Reflect.deleteProperty(htmlPrototype, "clientWidth");
	htmlPrototype.scrollTo = originalScrollTo;
	if (originalRangeRect) {
		Object.defineProperty(rangePrototype, "getBoundingClientRect", {
			configurable: true,
			value: originalRangeRect,
		});
	} else Reflect.deleteProperty(rangePrototype, "getBoundingClientRect");
	if (originalFonts) Object.defineProperty(document, "fonts", originalFonts);
	else Reflect.deleteProperty(document, "fonts");
	if (originalMatchMedia) {
		Object.defineProperty(window, "matchMedia", originalMatchMedia);
	} else {
		Reflect.deleteProperty(window, "matchMedia");
	}
});

describe("BookReaderContinuous vertical padding", () => {
	test("centres a capped player-safe column and expands it at zero padding", async () => {
		let readerApi: BookReaderApi | null = null;
		const scrollContainerRef = { current: document.documentElement };
		const position = {
			exploredCharCount: 3,
			progress: 3 / 5,
			modifiedAt: 1,
			locator: { sectionReference: "section-1", characterOffset: 3 },
		};
		const reader = (secondDimensionMaxValue: number) => (
			<BookReaderContinuous
				htmlContent='<div id="section-1"><p>本文です。</p></div>'
				language="ja"
				verticalMode={true}
				theme={{
					id: "test",
					fontColor: "black",
					backgroundColor: "white",
					selectionFontColor: "white",
					selectionBackgroundColor: "black",
					hintFuriganaShadowColor: "transparent",
					hintFuriganaFontColor: "black",
					tooltipTextFontColor: "black",
				}}
				fontFamilyGroupOne="serif"
				fontFamilyGroupTwo="sans-serif"
				fontWeight={null}
				fontSize={28}
				lineHeight={1.6}
				textIndentation={0}
				textMarginMode="auto"
				textMarginValue={0}
				verticalTextOrientation="mixed"
				enableFontKerning={false}
				enableFontVPAL={false}
				prioritizeReaderStyles={false}
				enableTextJustification={false}
				enableTextWrapPretty={false}
				secondDimensionMaxValue={secondDimensionMaxValue}
				firstDimensionMargin={0}
				hideFurigana={false}
				furiganaStyle="Partial"
				disableWheelNavigation={false}
				navigationBlocked={false}
				autoPositionOnResize={true}
				reservePlayerSpace={true}
				scrollContainerRef={scrollContainerRef}
				sections={[
					{
						reference: "section-1",
						charactersWeight: 5,
						startCharacter: 0,
						characters: 5,
					},
				]}
				initialPosition={position}
				onPositionChange={() => {}}
				onSectionProgressChange={() => {}}
				apiRef={(api) => {
					readerApi = api;
				}}
			/>
		);

		const view = render(reader(500));
		const surface = view.container.querySelector(
			".book-content--continuous",
		) as HTMLElement;
		await waitFor(() => expect(surface.style.height).toBe("500px"));
		expect(surface.style.marginTop).toBe("100px");
		expect(surface.style.marginBottom).toBe("100px");
		const api = readerApi as unknown as BookReaderApi;
		expect(api.getPosition?.()?.exploredCharCount).toBe(3);

		view.rerender(reader(0));
		api.relayout?.(position);

		await waitFor(() => expect(surface.style.height).toBe("700px"));
		expect(surface.style.marginTop).toBe("0px");
		expect(surface.style.marginBottom).toBe("0px");
		expect(api.getPosition?.()?.exploredCharCount).toBe(3);
	});
});
