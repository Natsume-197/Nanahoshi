import "@/test-utils/setup-dom";
import { afterEach, describe, expect, test } from "bun:test";
import { act, cleanup, render, waitFor } from "@testing-library/react";
import { BookReaderPaginated } from "./book-reader-paginated";
import type { BookReaderApi } from "./reader-shared-props";

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
Object.defineProperty(window.Range.prototype, "getBoundingClientRect", {
	configurable: true,
	value: () => ({
		top: 0,
		right: 0,
		bottom: 0,
		left: 0,
		width: 0,
		height: 0,
		x: 0,
		y: 0,
		toJSON: () => ({}),
	}),
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

describe("BookReaderPaginated image section navigation", () => {
	test("waits for SVG artwork before landing on the last page while navigating backwards", async () => {
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
				return hasSvgArtwork && svgArtworkReady
					? viewportWidth * 2 + 40
					: viewportWidth;
			},
		});

		let readerApi: BookReaderApi | null = null;
		const view = render(
			<BookReaderPaginated
				htmlContent={`
					<div id="ttu-epub-cover"><div><p>表</p></div></div>
					<div id="ttu-epub-illustration-1">
						<div class="ttu-no-text"><svg width="1127" height="1600"><image width="1127" height="1600" href="blob:illustration-1" /></svg></div>
					</div>
					<div id="ttu-epub-illustration-2">
						<div class="ttu-no-text"><svg width="1127" height="1600"><image width="1127" height="1600" href="blob:illustration-2" /></svg></div>
					</div>
					<div id="ttu-epub-p-001"><div><p>プロローグ</p></div></div>
					<div id="ttu-epub-p-002"><div><p>次章</p></div></div>
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
						reference: "ttu-epub-cover",
						charactersWeight: 1,
						startCharacter: 0,
						characters: 1,
					},
					{
						reference: "ttu-epub-illustration-1",
						charactersWeight: 1,
						startCharacter: 1,
						characters: 1,
					},
					{
						reference: "ttu-epub-illustration-2",
						charactersWeight: 1,
						startCharacter: 2,
						characters: 1,
					},
					{
						reference: "ttu-epub-p-001",
						charactersWeight: 5,
						startCharacter: 3,
						characters: 5,
					},
					{
						reference: "ttu-epub-p-002",
						charactersWeight: 2,
						startCharacter: 8,
						characters: 2,
					},
				]}
				initialPosition={{
					exploredCharCount: 3,
					progress: 3 / 10,
					lastBookmarkModified: 1,
				}}
				initialBookmark={undefined}
				onExploredCharCountChange={() => {}}
				onSectionProgressChange={() => {}}
				apiRef={(api) => {
					readerApi = api;
				}}
			/>,
		);

		await waitFor(() => {
			expect(view.container.querySelector("#ttu-epub-p-001")).not.toBeNull();
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
	});
});
