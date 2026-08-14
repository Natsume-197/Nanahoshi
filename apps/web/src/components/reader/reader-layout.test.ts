import { describe, expect, test } from "bun:test";
import { JSDOM } from "jsdom";
import { readerColumnHeightCss } from "@/lib/reader/viewport";
import { getPaginatedPageHeight } from "./book-reader-paginated";

const readerCss = await Bun.file(
	new URL("./reader.css", import.meta.url),
).text();
const readerRoute = await Bun.file(
	new URL("../../routes/reader/$uuid.tsx", import.meta.url),
).text();
const quickSettings = await Bun.file(
	new URL("./reader-quick-settings.tsx", import.meta.url),
).text();
const fullSettings = await Bun.file(
	new URL("./reader-settings.tsx", import.meta.url),
).text();
const paginatedReader = await Bun.file(
	new URL("./book-reader-paginated.tsx", import.meta.url),
).text();
const readerSync = await Bun.file(
	new URL("./use-reader-sync.ts", import.meta.url),
).text();
const globalStyles = await Bun.file(
	new URL("../../index.css", import.meta.url),
).text();

describe("reader layout", () => {
	test("gives synchronized narration a themed, non-color-only text treatment", () => {
		expect(readerCss).toContain(
			"var(--book-content-selection-background-color)",
		);
		expect(readerCss).toContain("text-decoration-line: underline");
		expect(readerCss).toContain("@media (forced-colors: active)");
	});

	test("keeps the end of a synchronized book clear of the persistent player", () => {
		expect(readerRoute).toContain(
			"data-read-listen-active={Boolean(readListenPairUuid)}",
		);
		expect(readerCss).toContain("var(--reader-player-reserve-mobile)");
		expect(readerCss).toContain("var(--reader-player-reserve-desktop)");
	});

	test("generated text wrappers fill the reading area despite EPUB page sizing", () => {
		const dom = new JSDOM(`
			<style>${readerCss}</style>
			<style>
				.book-content .book-page {
					max-width: 95%;
					margin-right: 5%;
				}
				.book-content .chapter-body {
					box-sizing: border-box;
					width: 95%;
					padding-right: 1em;
				}
			</style>
			<main class="book-content book-content--continuous book-content--writing-horizontal-tb">
				<section>
					<div class="ttu-book-html-wrapper book-page">
						<div class="ttu-book-body-wrapper chapter-body"><p>本文</p></div>
					</div>
				</section>
			</main>
		`);
		const htmlWrapper = dom.window.document.querySelector(
			".ttu-book-html-wrapper",
		) as HTMLElement;
		const bodyWrapper = dom.window.document.querySelector(
			".ttu-book-body-wrapper",
		) as HTMLElement;
		const htmlStyle = dom.window.getComputedStyle(htmlWrapper);
		const bodyStyle = dom.window.getComputedStyle(bodyWrapper);

		expect(htmlStyle.width).toBe("100%");
		expect(htmlStyle.maxWidth).toBe("none");
		expect(htmlStyle.marginRight).toBe("0px");
		expect(bodyStyle.width).toBe("100%");
		expect(bodyStyle.paddingRight).toBe("0px");
	});

	test("justifies CJK text between characters without stretching its final line", () => {
		const dom = new JSDOM(`
			<style>${readerCss}</style>
			<main
				lang="ja"
				class="book-content book-content--continuous book-content--writing-horizontal-tb ttu-apply-justification"
			>
				<p>日本語の本文</p>
			</main>
		`);
		const paragraph = dom.window.document.querySelector("p") as HTMLElement;
		const style = dom.window.getComputedStyle(paragraph);

		expect(style.textAlign).toBe("justify");
		expect(style.textJustify).toBe("inter-character");
		expect(style.textAlignLast).not.toBe("justify");
	});

	test("keeps the reader menu visible while quick settings are open", () => {
		const openSettingsHandler = readerRoute.slice(
			readerRoute.indexOf("onQuickSettingsClick={() =>"),
			readerRoute.indexOf(
				"readListenAvailable=",
				readerRoute.indexOf("onQuickSettingsClick={() =>"),
			),
		);
		expect(openSettingsHandler).not.toContain("setShowHeader(false)");
		expect(readerRoute).toContain(
			"inert={settingsOpen || quickSettingsOpen || tocOpen || galleryOpen}",
		);
	});

	test("keeps the mobile drawer mounted for its close transition and caps it at 60dvh", () => {
		expect(readerRoute).toContain("<ReaderQuickSettings");
		expect(readerRoute).not.toContain(
			"{quickSettingsOpen && (\n\t\t\t\t<ReaderQuickSettings",
		);
		expect(quickSettings).toContain("open={open}");
		expect(quickSettings).toContain('"--drawer-content-height": "60dvh"');
		expect(quickSettings).toContain('"--drawer-content-max-height": "60dvh"');
		expect(quickSettings.match(/modal=\{false\}/g)).toHaveLength(2);
		expect(quickSettings).not.toContain("DialogPrimitive.Backdrop");
		expect(quickSettings).toContain("reader-quick-settings-sheet");
		expect(globalStyles).toContain(
			".reader-quick-settings-sheet[data-ending-style]",
		);
		expect(globalStyles).toContain(
			"transition-duration: var(--expanded-player-close-dur)",
		);
	});

	test("offers columns in Layout and resume mode in Behaviour", () => {
		expect(fullSettings).toContain('key: "behaviour"');
		expect(fullSettings).toContain('label: "Behaviour"');
		expect(fullSettings).toContain('"Save reading position"');
		expect(fullSettings).toContain('"Columns"');
		expect(fullSettings).toContain('{ id: 0, text: "Auto" }');
		expect(fullSettings).toContain('{ id: 1, text: "1" }');
		expect(fullSettings).toContain('{ id: 2, text: "2" }');
		expect(readerRoute).toContain("readerSettings: settings");
	});

	test("mirrors Behaviour controls in quick settings", () => {
		expect(quickSettings).toContain('<QuickSettingsSection title="Behaviour">');
		expect(quickSettings).toContain(
			'<QuickSettingsRow label="Save reading position">',
		);
		expect(quickSettings).toContain('ariaLabel="Save reading position"');
		expect(quickSettings).toContain("settings.readingPositionMode");
		expect(quickSettings).toContain(
			'<QuickSettingsRow label="Keep position on resize">',
		);
		expect(quickSettings).toContain('ariaLabel="Keep position on resize"');
		expect(quickSettings).toContain("settings.autoPositionOnResize");
	});

	test("keeps paginated page geometry above the persistent player", () => {
		expect(readerRoute).toContain(
			"reservePlayerSpace={Boolean(audioPlayerBook)}",
		);
		expect(readerRoute).toContain('presentation.engine === "text-scroll" &&');
		expect(readerCss).toContain("--reader-player-reserve-current");
		expect(paginatedReader).toContain("reservePlayerSpace");
		expect(paginatedReader).toContain("contentEl.clientHeight");
		expect(getPaginatedPageHeight(800, false)).toBe("800px");
		expect(getPaginatedPageHeight(800, true)).toBe(
			"max(0px, calc(800px - var(--reader-player-reserve-current)))",
		);
		expect(readerColumnHeightCss(800, 400, true)).toBe(
			"min(400px, max(0px, calc(800px - var(--reader-player-reserve-current))))",
		);
		expect(readerColumnHeightCss(800, 0, true)).toBe(
			"max(0px, calc(800px - var(--reader-player-reserve-current)))",
		);
		expect(readerSync).toContain(
			"observedPositionModeRef.current !== positionMode",
		);
		expect(readerSync).toContain("positionIntentAt ?? 0");
	});

	test("does not recalculate the intended position from stale resize geometry", () => {
		const resizeHandler = readerRoute.includes('useWindowEvent("resize"')
			? "route"
			: "engine";
		expect(resizeHandler).toBe("engine");
		const continuousReader = Bun.file(
			new URL("./book-reader-continuous.tsx", import.meta.url),
		);
		return continuousReader.text().then((source) => {
			const start = source.indexOf('useWindowEvent("resize"');
			const end = source.indexOf("// readerColumnHeight", start);
			expect(source.slice(start, end)).not.toContain(
				"calcPreciseExploredCharCount",
			);
			expect(source).toContain("formatBookmarkData(s.prevIntendedCharCount)");
			expect(source).toContain("window.innerWidth !== s.settledInnerWidth");
			expect(source).toContain("s.scheduleRecalc?.(false)");
			expect(source).toContain("uncommittedUserPosition");
			expect(source).toContain(
				"autoPositionOnResize && !s.uncommittedUserPosition",
			);
			const paginatedResizeStart = paginatedReader.indexOf(
				'useWindowEvent("resize"',
			);
			expect(paginatedReader.slice(paginatedResizeStart)).not.toContain(
				"calcPreciseExploredCharCount",
			);
			expect(paginatedReader).toContain(
				"const exploredCharCount = Math.max(0, s.previousIntendedCount)",
			);
		});
	});
});
