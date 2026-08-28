import { describe, expect, test } from "bun:test";
import { JSDOM } from "jsdom";
import { getPaginatedPageHeight } from "@/features/reader/renderers/paginated/book-reader-paginated";
import { readerColumnHeightCss } from "@/features/reader/renderers/shared/viewport";

const readerCss = await Bun.file(
	new URL("./reader.css", import.meta.url),
).text();
const readerScreen = await Bun.file(
	new URL("../../reader-screen.tsx", import.meta.url),
).text();
const quickSettings = await Bun.file(
	new URL("../settings/reader-quick-settings.tsx", import.meta.url),
).text();
const customThemeEditor = await Bun.file(
	new URL("../controls/reader-custom-theme.tsx", import.meta.url),
).text();
const paginatedReader = await Bun.file(
	new URL(
		"../../renderers/paginated/book-reader-paginated.tsx",
		import.meta.url,
	),
).text();
const continuousReader = await Bun.file(
	new URL(
		"../../renderers/continuous/book-reader-continuous.tsx",
		import.meta.url,
	),
).text();
const readerSync = await Bun.file(
	new URL("../../interaction/use-reader-sync.ts", import.meta.url),
).text();
const globalStyles = await Bun.file(
	new URL("../../../../index.css", import.meta.url),
).text();

function cssRule(selector: string) {
	const start = readerCss.indexOf(`${selector} {`);
	if (start === -1) return "";
	return readerCss.slice(start, readerCss.indexOf("}", start));
}

describe("focus mode sentence box", () => {
	test("centres the sentence on both axes", () => {
		expect(
			cssRule(".book-content--focus.book-content--writing-horizontal-tb"),
		).toContain("align-self: center");
		const box = cssRule(".book-content--focus");
		expect(box).toContain("align-items: safe center");
		expect(box).toContain("justify-content: safe center");
	});

	test("the click-wait marker takes no part in the line", () => {
		const marker = cssRule(".focus-sentence-indicator");
		expect(marker).toContain("position: absolute");
		expect(cssRule(".book-content--focus .focus-sentence-content")).toContain(
			"position: relative",
		);
		expect(marker).toContain("border-radius: 50%");
		expect(marker).toContain("border: 0.1em solid currentColor");
		expect(marker).toContain("border-right-color: transparent");
		expect(marker).toContain("focus-sentence-indicator-spin");
		expect(readerCss).toContain("@keyframes focus-sentence-indicator-spin");
		expect(cssRule("@keyframes focus-sentence-indicator-spin")).toContain(
			"rotate: 1turn",
		);
	});

	test("an illustration slide is fitted whole, not cropped", () => {
		const media = cssRule(
			".book-content--focus-media img,\n.book-content--focus-media picture,\n.book-content--focus-media svg",
		);
		expect(media).toContain("width: auto !important");
		expect(media).toContain("height: auto !important");
		expect(media).toContain("max-width: 100% !important");
		expect(media).toContain("max-height: 100% !important");
		expect(cssRule(".book-content--focus-media.book-content--focus")).toContain(
			"block-size: 100%",
		);
		expect(
			cssRule(".book-content--focus-media .focus-sentence-content"),
		).toContain("block-size: 100%");
	});

	test("hidden glyphs keep their box while the sentence is typed", () => {
		expect(cssRule(".focus-typewriter-hidden")).toContain("visibility: hidden");
	});
});

describe("reader layout", () => {
	test("does not paint browser focus frames around reader surfaces", () => {
		const renderers = [
			"text-paginated",
			"text-scroll",
			"text-focus",
			"pdf",
			"visual",
		];
		const dom = new JSDOM(`
			<style>${readerCss}</style>
			<main class="reader-route-content">
				${renderers
					.map(
						(renderer) =>
							`<section data-reader-renderer="${renderer}" tabindex="-1"></section>`,
					)
					.join("")}
				<button type="button">Reader settings</button>
			</main>
		`);

		for (const renderer of renderers) {
			const surface = dom.window.document.querySelector(
				`[data-reader-renderer="${renderer}"]`,
			) as HTMLElement;
			surface.focus();
			expect(dom.window.document.activeElement).toBe(surface);
			expect(dom.window.getComputedStyle(surface).outline).toBe("none");
		}

		const button = dom.window.document.querySelector("button") as HTMLElement;
		button.focus();
		expect(dom.window.getComputedStyle(button).outline).not.toBe("none");
	});

	test("keeps reader controls horizontal while the book writes vertically", () => {
		const dom = new JSDOM(`
			<style>${readerCss}</style>
			<html style="writing-mode: vertical-rl">
				<body style="writing-mode: horizontal-tb">
					<main class="reader-route-content">
						<button type="button">Playback speed</button>
						<article class="book-content book-content--writing-vertical-rl">本文</article>
					</main>
					<div data-slot="popover-content">Playback speed settings</div>
				</body>
			</html>
		`);
		const route = dom.window.document.querySelector(
			".reader-route-content",
		) as HTMLElement;
		const button = dom.window.document.querySelector("button") as HTMLElement;
		const book = dom.window.document.querySelector(
			".book-content",
		) as HTMLElement;
		const popover = dom.window.document.querySelector(
			'[data-slot="popover-content"]',
		) as HTMLElement;

		expect(dom.window.getComputedStyle(route).writingMode).toBe(
			"horizontal-tb",
		);
		expect(dom.window.getComputedStyle(button).writingMode).toBe(
			"horizontal-tb",
		);
		expect(dom.window.getComputedStyle(popover).writingMode).toBe(
			"horizontal-tb",
		);
		expect(dom.window.getComputedStyle(book).writingMode).toBe("vertical-rl");
	});

	test("gives synchronized narration a themed, non-color-only text treatment", () => {
		expect(readerCss).toContain(
			"var(--book-content-selection-background-color)",
		);
		expect(readerCss).toContain("text-decoration-line: underline");
		expect(readerCss).toContain("@media (forced-colors: active)");
	});

	test("keeps the end of a synchronized book clear of the persistent player", () => {
		expect(readerScreen).toContain(
			"data-read-listen-active={Boolean(readListenPairUuid)}",
		);
		expect(readerScreen).toContain(
			"h-[calc(100dvh-var(--reader-player-reserve-current))]",
		);
		expect(readerScreen).toContain("overflow-auto overscroll-none");
		expect(readerScreen).toContain("scrollContainerRef={readerSurfaceRef}");
		expect(readerScreen).toContain(
			'"--reader-player-reserve-mobile": audioPlayerBook',
		);
		expect(readerScreen).toContain(
			'"--reader-player-reserve-desktop": audioPlayerBook',
		);
	});

	test("keeps the vertical reader scrollbar above the persistent player", () => {
		expect(readerScreen).toContain(
			"reader-route-content h-[calc(100dvh-var(--reader-player-reserve-current))] w-dvw overflow-auto",
		);
	});

	test("conceals the reader scrollbar without changing its gutter", () => {
		expect(readerScreen).toMatch(
			/scrollbarGutter:\s*presentation\.renderer === "text-scroll" \? "stable" : undefined/,
		);
		expect(readerScreen).toContain(
			'document.documentElement.classList.add("reader-scrollbar-concealed")',
		);
		expect(readerScreen).not.toContain(
			'document.documentElement.style.setProperty("scrollbar-width", "none")',
		);
		expect(continuousReader).toContain(
			'scrollEl.classList.toggle("reader-scrollbar-concealed", hidden)',
		);
		expect(cssRule(".reader-scrollbar-concealed")).toContain(
			"scrollbar-color: transparent transparent",
		);
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
					<div class="nanahoshi-book-html-wrapper book-page">
						<div class="nanahoshi-book-body-wrapper chapter-body"><p>本文</p></div>
					</div>
				</section>
			</main>
		`);
		const htmlWrapper = dom.window.document.querySelector(
			".nanahoshi-book-html-wrapper",
		) as HTMLElement;
		const bodyWrapper = dom.window.document.querySelector(
			".nanahoshi-book-body-wrapper",
		) as HTMLElement;
		const htmlStyle = dom.window.getComputedStyle(htmlWrapper);
		const bodyStyle = dom.window.getComputedStyle(bodyWrapper);

		expect(htmlStyle.width).toBe("100%");
		expect(htmlStyle.maxWidth).toBe("none");
		expect(htmlStyle.marginRight).toBe("0px");
		expect(bodyStyle.width).toBe("100%");
		expect(bodyStyle.paddingRight).toBe("0px");
	});

	test("keeps EPUB page padding out of the vertical column height", () => {
		const dom = new JSDOM(`
			<style>${readerCss}</style>
			<style>
				.book-content .book-page {
					margin-top: 5%;
					padding-bottom: 2em;
				}
				.book-content .chapter-body {
					height: 95%;
					padding-top: 1em;
				}
			</style>
			<main class="book-content book-content--continuous book-content--writing-vertical-rl">
				<section>
					<div class="nanahoshi-book-html-wrapper book-page">
						<div class="nanahoshi-book-body-wrapper chapter-body"><p>本文</p></div>
					</div>
				</section>
			</main>
		`);
		const htmlWrapper = dom.window.document.querySelector(
			".nanahoshi-book-html-wrapper",
		) as HTMLElement;
		const bodyWrapper = dom.window.document.querySelector(
			".nanahoshi-book-body-wrapper",
		) as HTMLElement;
		const htmlStyle = dom.window.getComputedStyle(htmlWrapper);
		const bodyStyle = dom.window.getComputedStyle(bodyWrapper);

		expect(htmlStyle.height).toBe("100%");
		expect(htmlStyle.marginTop).toBe("0px");
		expect(htmlStyle.paddingBottom).toBe("0px");
		expect(bodyStyle.height).toBe("100%");
		expect(bodyStyle.paddingTop).toBe("0px");
	});

	test("makes zero vertical padding exact in paginated vertical text", () => {
		const dom = new JSDOM(`
			<style>${readerCss}</style>
			<style>
				.book-content .book-page {
					padding-top: 3em;
					padding-bottom: 2em;
				}
				.book-content .chapter-body {
					margin-top: 5%;
					padding-top: 1em;
				}
			</style>
			<main class="book-content book-content--paginated book-content--writing-vertical-rl">
				<div class="book-content-container">
					<section>
						<div class="nanahoshi-book-html-wrapper book-page">
							<div class="nanahoshi-book-body-wrapper chapter-body"><p>本文</p></div>
						</div>
					</section>
				</div>
			</main>
		`);
		const htmlWrapper = dom.window.document.querySelector(
			".nanahoshi-book-html-wrapper",
		) as HTMLElement;
		const bodyWrapper = dom.window.document.querySelector(
			".nanahoshi-book-body-wrapper",
		) as HTMLElement;
		const htmlStyle = dom.window.getComputedStyle(htmlWrapper);
		const bodyStyle = dom.window.getComputedStyle(bodyWrapper);

		expect(htmlStyle.paddingTop).toBe("0px");
		expect(htmlStyle.paddingBottom).toBe("0px");
		expect(bodyStyle.marginTop).toBe("0px");
		expect(bodyStyle.paddingTop).toBe("0px");
	});

	test("justifies CJK text between characters without stretching its final line", () => {
		const dom = new JSDOM(`
			<style>${readerCss}</style>
			<main
				lang="ja"
				class="book-content book-content--continuous book-content--writing-horizontal-tb nanahoshi-apply-justification"
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
		const openSettingsHandler = readerScreen.slice(
			readerScreen.indexOf("onQuickSettingsClick={() =>"),
			readerScreen.indexOf(
				"readListenAvailable=",
				readerScreen.indexOf("onQuickSettingsClick={() =>"),
			),
		);
		expect(openSettingsHandler).not.toContain("setShowHeader(false)");
		expect(readerScreen).toContain(
			"inert={(quickSettingsOpen && isMobile) || tocOpen || galleryOpen}",
		);
		expect(readerScreen).toContain(
			"settingsOpen: quickSettingsOpen && isMobile",
		);
		expect(readerScreen).toContain("(quickSettingsOpen && isMobile) ||");
	});

	test("keeps the mobile drawer and uses a desktop floating dialog", () => {
		expect(readerScreen).toContain("<ReaderQuickSettings");
		expect(readerScreen).not.toContain(
			"{quickSettingsOpen && (\n\t\t\t\t<ReaderQuickSettings",
		);
		expect(quickSettings).toContain("open={open}");
		expect(quickSettings).toContain('"--drawer-content-height": "60dvh"');
		expect(quickSettings).toContain('"--drawer-content-max-height": "60dvh"');
		expect(quickSettings.match(/modal=\{false\}/g)).toHaveLength(1);
		expect(quickSettings).toContain("reader-quick-settings-sheet");
		expect(quickSettings).toContain("reader-quick-settings-dialog");
		expect(quickSettings).toContain('"min(42rem, calc(100dvh - 2rem))"');
		expect(quickSettings).toContain('"min(36rem, calc(100vw - 2rem))"');
		expect(quickSettings).toContain("hidden={!open}");
		expect(quickSettings).toContain('role="dialog"');
		expect(quickSettings).toContain("beginDesktopDialogDrag");
		expect(quickSettings).toContain("setPointerCapture(event.pointerId)");
		expect(quickSettings).toContain("desktopDialogOffsetRef.current.x");
		expect(quickSettings).toContain("applyDesktopDialogOffset");
		expect(quickSettings).toContain('willChange: "transform"');
		expect(quickSettings).toContain("border-b px-2");
		expect(quickSettings).toContain('className="size-3.5"');
		expect(quickSettings).toContain(
			'aria-label="Move settings window. Use arrow keys to reposition; press Home to center."',
		);
		expect(quickSettings).toContain("toggleDesktopDialogCollapsed");
		expect(quickSettings).toContain("beginDesktopDialogResize");
		expect(quickSettings).toContain("resizeDesktopDialogWithKeyboard");
		expect(quickSettings).not.toContain("translate-x-full");
		expect(globalStyles).toContain(
			".reader-quick-settings-sheet[data-ending-style]",
		);
		expect(globalStyles).toContain(
			"transition-duration: var(--expanded-player-close-dur)",
		);
	});

	test("groups quick settings behind icon-labelled category buttons on every screen", () => {
		expect(quickSettings).toContain(
			"useState<QuickSettingsCategory | null>(null)",
		);
		expect(quickSettings).toContain(
			"selectedCategory === null ? categoryList : settingsContent",
		);
		expect(quickSettings).toContain("settingsCategories.map((category)");
		expect(quickSettings).toContain("setSelectedCategory(category.id)");
		expect(quickSettings).toContain('aria-label="Back to settings categories"');
		expect(quickSettings).toContain(
			"onClick={() => setSelectedCategory(null)}",
		);
		expect(quickSettings).toContain(
			'id: "profiles" as const, label: "Profiles", icon: Users',
		);
		expect(quickSettings).toContain(
			'id: "visual" as const, label: "Visual", icon: Eye',
		);
		expect(quickSettings).toContain(
			'id: "layout" as const, label: "Layout", icon: Rows',
		);
		expect(quickSettings).toContain(
			'id: "behaviour" as const, label: "Behaviour", icon: CursorClick',
		);
		expect(quickSettings).toContain('className="size-5 shrink-0"');
	});

	test("moves frequent layout and text controls to quick settings", () => {
		expect(quickSettings).not.toContain("Advanced settings");
		expect(quickSettings).not.toContain("onOpenSettings");
		expect(readerScreen).not.toContain("ReaderSettingsOverlay");
		expect(readerScreen).not.toContain("draftSettings");
		expect(quickSettings).toContain('<QuickSettingsRow label="Read as">');
		expect(quickSettings).toContain('ariaLabel="Read as"');
		expect(quickSettings).toContain(
			'<QuickSettingsRow label="Avoid page break">',
		);
		expect(quickSettings).toContain(
			'<QuickSettingsRow label="Sans font family">',
		);
		expect(quickSettings).toContain(
			'<QuickSettingsRow label="Latin character orientation">',
		);
		expect(quickSettings).toContain('<QuickSettingsRow label="Font kerning">');
		expect(quickSettings).toContain(
			'<QuickSettingsRow label="Proportional vertical metrics">',
		);
		expect(quickSettings).toContain('<QuickSettingsRow label="Columns">');
		expect(quickSettings).toContain('ariaLabel="Columns"');
		expect(quickSettings).toContain('<QuickSettingsRow label="Font weight">');
		expect(quickSettings.indexOf('label="Font"')).toBeLessThan(
			quickSettings.indexOf('label="Font weight"'),
		);
		expect(quickSettings.indexOf('label="Font weight"')).toBeLessThan(
			quickSettings.indexOf('label="Text orientation"'),
		);
		expect(quickSettings).toContain(
			'<QuickSettingsRow label="Pretty text wrap">',
		);
		expect(quickSettings).toContain(
			'<QuickSettingsRow label="Prioritize reader styles">',
		);
		expect(quickSettings).toContain(
			'<QuickSettingsRow label="Paragraph indentation">',
		);
		expect(quickSettings).toContain('aria-label="Paragraph indentation"');
		expect(quickSettings).toContain(
			'<QuickSettingsRow label="Paragraph spacing">',
		);
		expect(quickSettings).toContain('ariaLabel="Paragraph spacing"');
		expect(quickSettings).toContain(
			'<QuickSettingsRow label="Paragraph spacing size">',
		);
		expect(quickSettings).toContain('<QuickSettingsRow label="Hide furigana">');
		expect(quickSettings).toContain("settings.hideFurigana");
		expect(quickSettings).toContain(
			'<QuickSettingsRow label="Character counter">',
		);
		expect(quickSettings).toContain('<QuickSettingsRow label="Percentage">');
		expect(quickSettings).toContain(
			'<QuickSettingsRow label="Progress indicator">',
		);
		expect(quickSettings).toContain("onProfileSwitch: (id: string) => void");
		expect(quickSettings).toContain(
			"onCustomThemesChange: (next: CustomReaderThemes) => void",
		);
		expect(quickSettings).toContain(">Create theme<");
		expect(quickSettings).toContain("ReaderCustomThemeDialog");
		expect(customThemeEditor).not.toContain("Reading preview");
		expect(customThemeEditor).toContain("onPreview");
		expect(customThemeEditor).toContain("Restore");
		expect(customThemeEditor).toContain('aria-modal="true"');
		expect(customThemeEditor).toContain(
			"backgroundColor: theme.backgroundColor",
		);
		expect(customThemeEditor).toContain("saturation and brightness");
		expect(customThemeEditor).toContain("RGB value");
		expect(readerScreen).toContain("profiles={profilesStore.profiles}");
		expect(readerScreen).toContain(
			"onCustomThemesChange={handleCustomThemesChange}",
		);
		expect(readerScreen).toContain("readerSettings: settings");
	});

	test("mirrors Behaviour controls in quick settings", () => {
		expect(quickSettings).toContain('title="Behaviour"');
		expect(quickSettings).not.toContain("readingPositionMode");
		expect(quickSettings).toContain(
			'<QuickSettingsRow label="Keep position on resize">',
		);
		expect(quickSettings).toContain('ariaLabel="Keep position on resize"');
		expect(quickSettings).toContain("settings.autoPositionOnResize");
		expect(quickSettings).toContain(
			'<QuickSettingsRow label="Disable wheel navigation">',
		);
		expect(quickSettings).toContain("settings.disableWheelNavigation");
	});

	test("keeps paginated page geometry above the persistent player", () => {
		expect(readerScreen).toContain(
			"reservePlayerSpace={Boolean(audioPlayerBook)}",
		);
		expect(readerScreen).toContain(
			'presentation.renderer === "text-scroll" &&',
		);
		expect(readerCss).toContain("--reader-player-reserve-current");
		expect(paginatedReader).toContain("reservePlayerSpace");
		expect(paginatedReader).toContain("scrollEl.clientHeight");
		expect(paginatedReader).not.toContain(
			"() => contentEl.clientHeight || viewportRef.current.height",
		);
		expect(getPaginatedPageHeight(800, false)).toBe("800px");
		expect(getPaginatedPageHeight(800, true)).toBe(
			"max(0px, calc(800px - var(--reader-player-reserve-current)))",
		);
		expect(readerColumnHeightCss(800, 400, true)).toBe(
			"max(0px, calc(min(400px, 800px) - var(--reader-player-reserve-current)))",
		);
		expect(readerColumnHeightCss(800, 0, true)).toBe(
			"max(0px, calc(800px - var(--reader-player-reserve-current)))",
		);
		expect(readerSync).toContain(
			"positionSnapshot !== lastPositionSnapshotRef.current",
		);
	});

	test("does not recalculate the intended position from stale resize geometry", () => {
		const resizeHandler = readerScreen.includes('useWindowEvent("resize"')
			? "route"
			: "engine";
		expect(resizeHandler).toBe("engine");
		const continuousReader = Bun.file(
			new URL(
				"../../renderers/continuous/book-reader-continuous.tsx",
				import.meta.url,
			),
		);
		return continuousReader.text().then((source) => {
			const start = source.indexOf('useWindowEvent("resize"');
			const end = source.indexOf("// readerColumnHeight", start);
			expect(source.slice(start, end)).not.toContain(
				"calcPreciseExploredCharCount",
			);
			expect(source).toContain("readPosition(s.prevIntendedCharCount)");
			expect(source).toContain("scrollEl.clientWidth !== s.settledInnerWidth");
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
