import "@/test-utils/setup-dom";
import { afterEach, describe, expect, test } from "bun:test";
import { act, cleanup, render, waitFor } from "@testing-library/react";
import type { BookReaderApi } from "@/features/reader/reader-contract";
import {
	BookReaderPaginated,
	computeViewport,
	paginatedReaderFrameStyle,
	viewportCenteredTranslateX,
} from "./book-reader-paginated";

Object.defineProperty(document, "fonts", {
	configurable: true,
	value: { ready: Promise.resolve() },
});
Object.defineProperty(window, "innerWidth", {
	configurable: true,
	value: 1000,
});
Object.defineProperty(window, "innerHeight", {
	configurable: true,
	value: 700,
});
let verticalAnchorTop: number | undefined;
Object.defineProperty(window.Range.prototype, "getBoundingClientRect", {
	configurable: true,
	value: function getBoundingClientRect(this: Range) {
		const isSecondPageAnchor = this.toString() === "対";
		const left = isSecondPageAnchor ? 976 : 0;
		const top = isSecondPageAnchor ? (verticalAnchorTop ?? 0) : 0;
		const width = isSecondPageAnchor ? 10 : 0;
		return {
			top,
			right: left + width,
			bottom: top + 10,
			left,
			width,
			height: 0,
			x: left,
			y: 0,
			toJSON: () => ({}),
		};
	},
});

const originalScrollTo = HTMLElement.prototype.scrollTo;
const originalDecode = HTMLImageElement.prototype.decode;
const originalReplaceChildren = Element.prototype.replaceChildren;
const originalRequestAnimationFrame = globalThis.requestAnimationFrame;
const originalScrollWidth = Object.getOwnPropertyDescriptor(
	HTMLElement.prototype,
	"scrollWidth",
);
const originalClientHeight = Object.getOwnPropertyDescriptor(
	HTMLElement.prototype,
	"clientHeight",
);

afterEach(() => {
	cleanup();
	verticalAnchorTop = undefined;
	HTMLElement.prototype.scrollTo = originalScrollTo;
	HTMLImageElement.prototype.decode = originalDecode;
	Element.prototype.replaceChildren = originalReplaceChildren;
	globalThis.requestAnimationFrame = originalRequestAnimationFrame;
	if (originalScrollWidth) {
		Object.defineProperty(
			HTMLElement.prototype,
			"scrollWidth",
			originalScrollWidth,
		);
	}
	if (originalClientHeight) {
		Object.defineProperty(
			HTMLElement.prototype,
			"clientHeight",
			originalClientHeight,
		);
	}
});

describe("viewportCenteredTranslateX", () => {
	test("aligns an illustration with the physical viewport centre", () => {
		expect(viewportCenteredTranslateX(2560, 1144, 640)).toBe(-184);
	});
});

describe("vertical page padding", () => {
	test("applies the requested physical horizontal padding only once", () => {
		const viewport = computeViewport(
			true,
			100,
			0,
			{ width: 1000, height: 700 },
			32,
		);

		// The reader shell owns 32px on each side. The book surface should keep
		// the remaining 936px and apply its 100px padding inside that surface,
		// leaving 736px for text—not subtract the user padding here as well.
		expect(viewport).toEqual({ width: 936, height: 700 });
	});

	test("centres a capped page in the player-safe vertical area", () => {
		expect(paginatedReaderFrameStyle(32, true, 800, true)).toEqual({
			paddingLeft: "32px",
			paddingRight: "32px",
			height: "max(0px, calc(800px - var(--reader-player-reserve-current)))",
			display: "flex",
			alignItems: "center",
		});
	});
});

describe("BookReaderPaginated image section navigation", () => {
	test("aligns a Read & Listen tategaki sentence to a complete page", async () => {
		verticalAnchorTop = 540;
		HTMLElement.prototype.scrollTo = function scrollTo(options) {
			if (typeof options === "object") {
				this.scrollLeft = options.left ?? this.scrollLeft;
				this.scrollTop = options.top ?? this.scrollTop;
			}
		};
		Object.defineProperty(HTMLElement.prototype, "clientHeight", {
			configurable: true,
			get() {
				if (this.classList.contains("book-content--paginated")) return 500;
				if (this.classList.contains("book-content-container")) return 200;
				return 700;
			},
		});

		let readerApi: BookReaderApi | null = null;
		const view = render(
			<BookReaderPaginated
				htmlContent='<div id="nanahoshi-epub-p-001"><p>前前対象</p></div>'
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
				secondDimensionMaxValue={0}
				firstDimensionMargin={0}
				hideFurigana={false}
				furiganaStyle="Partial"
				disableWheelNavigation={false}
				navigationBlocked={false}
				avoidPageBreak={false}
				pageColumns={1}
				reservePlayerSpace={true}
				sections={[
					{
						reference: "nanahoshi-epub-p-001",
						charactersWeight: 4,
						startCharacter: 0,
						characters: 4,
					},
				]}
				initialPosition={undefined}
				onPositionChange={() => {}}
				onSectionProgressChange={() => {}}
				apiRef={(api) => {
					readerApi = api;
				}}
			/>,
		);

		await waitFor(() => expect(readerApi).not.toBeNull());
		readerApi?.navigateToTextAnchor?.({
			kind: "text-quote",
			sectionReference: "nanahoshi-epub-p-001",
			exact: "対象",
		});

		const scrollElement = view.container.querySelector(
			".book-content--paginated",
		) as HTMLElement;
		await waitFor(() => {
			// The visible page is 500px tall with a 40px page gap. Landing at
			// 480px would expose two adjacent pages, exactly the split seen when
			// synchronized narration crosses the page boundary.
			expect(scrollElement.scrollTop).toBe(540);
		});
	});

	test("keeps the global coordinate when mounting after another layout", async () => {
		let svgArtworkReady = false;
		let decodedSvgResources = 0;
		let imageSectionNeedsPositioning = false;
		let exposedUnpositionedImageSection = false;
		Element.prototype.replaceChildren = function replaceChildren(...nodes) {
			originalReplaceChildren.apply(this, nodes);
			if (
				this instanceof HTMLElement &&
				this.classList.contains("book-content-container") &&
				this.querySelector("svg image") &&
				(this.parentElement as HTMLElement | null)?.scrollLeft === 0
			) {
				imageSectionNeedsPositioning = true;
			}
		};
		globalThis.requestAnimationFrame = (callback) =>
			originalRequestAnimationFrame((time) => {
				if (imageSectionNeedsPositioning) {
					exposedUnpositionedImageSection = true;
				}
				callback(time);
			});
		HTMLImageElement.prototype.decode = function decode() {
			if (this.src.startsWith("blob:illustration-")) {
				decodedSvgResources += 1;
				if (decodedSvgResources === 2) svgArtworkReady = true;
			}
			return Promise.resolve();
		};
		HTMLElement.prototype.scrollTo = function scrollTo(options) {
			if (typeof options === "object") {
				this.scrollLeft = options.left ?? this.scrollLeft;
				this.scrollTop = options.top ?? this.scrollTop;
				if ((options.left ?? 0) > 0) imageSectionNeedsPositioning = false;
			}
		};
		Object.defineProperty(HTMLElement.prototype, "clientHeight", {
			configurable: true,
			get() {
				return 700;
			},
		});
		Object.defineProperty(HTMLElement.prototype, "scrollWidth", {
			configurable: true,
			get() {
				if (!this.classList.contains("book-content--paginated")) return 0;
				const viewportWidth = Number.parseFloat(this.style.maxWidth) || 936;
				const hasSvgArtwork = Boolean(
					this.querySelector(".book-content-container svg image"),
				);
				const hasSecondPageAnchor = Boolean(
					this.querySelector(".book-content-container #anchor-target"),
				);
				return hasSvgArtwork && svgArtworkReady
					? viewportWidth * 2 + 40
					: hasSecondPageAnchor
						? viewportWidth * 2 + 40
						: viewportWidth;
			},
		});

		let readerApi: BookReaderApi | null = null;
		const view = render(
			<BookReaderPaginated
				htmlContent={`
					<div id="nanahoshi-epub-cover"><div><p>表</p></div></div>
					<div id="nanahoshi-epub-illustration-1">
						<div class="nanahoshi-no-text"><svg width="1127" height="1600"><image width="1127" height="1600" href="blob:illustration-1" /></svg></div>
					</div>
					<div id="nanahoshi-epub-illustration-2">
						<div class="nanahoshi-no-text"><svg width="1127" height="1600"><image width="1127" height="1600" href="blob:illustration-2" /></svg></div>
					</div>
					<div id="nanahoshi-epub-p-001"><div><p>プロローグ</p></div></div>
					<div id="nanahoshi-epub-p-002"><div><p>次章</p><p id="anchor-target">対象</p></div></div>
				`}
				language="ja"
				verticalMode={false}
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
				secondDimensionMaxValue={0}
				firstDimensionMargin={0}
				hideFurigana={false}
				furiganaStyle="Partial"
				disableWheelNavigation={false}
				navigationBlocked={false}
				avoidPageBreak={false}
				pageColumns={1}
				reservePlayerSpace={false}
				sections={[
					{
						reference: "nanahoshi-epub-cover",
						charactersWeight: 1,
						startCharacter: 0,
						characters: 1,
					},
					{
						reference: "nanahoshi-epub-illustration-1",
						charactersWeight: 1,
						startCharacter: 1,
						characters: 1,
					},
					{
						reference: "nanahoshi-epub-illustration-2",
						charactersWeight: 1,
						startCharacter: 2,
						characters: 1,
					},
					{
						reference: "nanahoshi-epub-p-001",
						charactersWeight: 5,
						startCharacter: 3,
						characters: 5,
					},
					{
						reference: "nanahoshi-epub-p-002",
						charactersWeight: 4,
						startCharacter: 8,
						characters: 4,
					},
				]}
				initialPosition={{
					exploredCharCount: 3,
					progress: 3 / 10,
					modifiedAt: 1,
					// This locator is a deliberately stale chapter-relative value from a
					// different renderer. Layout switches must trust the shared global
					// coordinate rather than translating it through another engine's
					// section metric.
					locator: {
						sectionReference: "nanahoshi-epub-p-002",
						characterOffset: 0,
					},
				}}
				onPositionChange={() => {}}
				onSectionProgressChange={() => {}}
				apiRef={(api) => {
					readerApi = api;
				}}
			/>,
		);

		await waitFor(() => {
			expect(
				view.container.querySelector("#nanahoshi-epub-p-001"),
			).not.toBeNull();
		});
		expect(readerApi?.getPosition()).toMatchObject({
			exploredCharCount: 3,
			locator: {
				sectionReference: "nanahoshi-epub-p-001",
				characterOffset: 0,
			},
		});
		await act(async () => {
			readerApi?.prevPage();
		});

		const scrollElement = view.container.querySelector(
			".book-content--paginated",
		) as HTMLElement;
		await waitFor(() => {
			expect(scrollElement.querySelectorAll("svg image")).toHaveLength(2);
			expect(decodedSvgResources).toBe(2);
			expect(scrollElement.scrollLeft).toBe(976);
			expect(exposedUnpositionedImageSection).toBe(false);
		});

		expect(readerApi?.navigateToTextAnchor).toBeFunction();
		readerApi?.navigateToTextAnchor?.({
			kind: "text-quote",
			sectionReference: "nanahoshi-epub-p-002",
			exact: "対象",
		});
		await waitFor(() => {
			expect(scrollElement.querySelector("#anchor-target")).not.toBeNull();
			expect(scrollElement.scrollLeft).toBe(976);
		});
	});
});
