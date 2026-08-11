import type { RefObject } from "react";
import { useWindowEvent } from "@/hooks/use-window-event";
import type { ReaderPresentation } from "@/lib/reader/reader-presentation";
import type { ReaderBookmark } from "@/lib/reader/types";
import type { BookReaderApi } from "./reader-shared-props";

interface UseReaderKeybindsArgs {
	apiRef: RefObject<BookReaderApi | null>;
	bookmarkRef: RefObject<ReaderBookmark | undefined>;
	presentation: ReaderPresentation;
	verticalMode: boolean;
	/** Physical page direction for visual books; independent of writing mode. */
	comicDirection?: "ltr" | "rtl";
	autoScrollMultiplier: number;
	/** Any open overlay swallows the keys (it handles its own). */
	galleryOpen: boolean;
	tocOpen: boolean;
	settingsOpen: boolean;
	onBookmark: () => void;
	onCloseToc: () => void;
	onCloseSettings: () => void;
	onChangeChapter: (offset: number) => void;
	onAutoScrollMultiplierChange: (next: number) => void;
}

/** Keys that keep firing while held (OS key repeat) instead of once per press. */
const pageFlipCodes = new Set([
	"PageDown",
	"PageUp",
	"ArrowLeft",
	"ArrowRight",
	"ArrowUp",
	"ArrowDown",
	"KeyA",
	"KeyD",
]);

/**
 * The ttu default keybind map (book-reader-keybind.ts + store.ts). In paginated
 * mode ttu additionally binds the arrows and A/D to page flips; in continuous
 * mode A/D adjust the auto-scroll speed.
 */
export function useReaderKeybinds({
	apiRef,
	bookmarkRef,
	presentation,
	verticalMode,
	comicDirection,
	autoScrollMultiplier,
	galleryOpen,
	tocOpen,
	settingsOpen,
	onBookmark,
	onCloseToc,
	onCloseSettings,
	onChangeChapter,
	onAutoScrollMultiplierChange,
}: UseReaderKeybindsArgs) {
	useWindowEvent("keydown", (event) => {
		const isPaginated =
			presentation.engine !== "text-scroll" &&
			!(
				presentation.engine === "comic" &&
				(presentation.comicLayout === "horizontal-strip" ||
					presentation.comicLayout === "vertical-strip")
			);
		const advancesFromLeft =
			presentation.engine === "comic" ? comicDirection === "rtl" : verticalMode;
		if (event.altKey || event.ctrlKey || event.shiftKey || event.metaKey) {
			return;
		}
		// Holding a page-flip key keeps turning pages; everything else (bookmark,
		// auto-scroll toggle, chapter jumps, continuous-mode A/D speed steps)
		// fires once per press.
		if (
			event.repeat &&
			!(isPaginated && pageFlipCodes.has(event.code)) &&
			event.code !== "PageDown" &&
			event.code !== "PageUp"
		) {
			return;
		}
		if (galleryOpen) return; // the gallery handles its own keys
		if (tocOpen || settingsOpen) {
			if (event.key === "Escape") {
				onCloseToc();
				if (settingsOpen) onCloseSettings();
			}
			return;
		}
		const target = event.target as HTMLElement | null;
		if (
			target?.closest(
				'input, textarea, select, button, a, [contenteditable="true"]',
			)
		) {
			return;
		}

		const api = apiRef.current;
		if (!api) return;

		let handled = true;
		switch (event.code || event.key?.toLowerCase()) {
			case "KeyB":
				onBookmark();
				break;
			case "KeyR":
				if (bookmarkRef.current) api.scrollToBookmark(bookmarkRef.current);
				break;
			case "PageDown":
				api.nextPage();
				break;
			case "PageUp":
				api.prevPage();
				break;
			case "Space":
				if (api.toggleAutoScroll) api.toggleAutoScroll();
				else handled = false;
				break;
			case "ArrowLeft":
				if (isPaginated) {
					if (advancesFromLeft) api.nextPage();
					else api.prevPage();
				} else {
					handled = false;
				}
				break;
			case "ArrowRight":
				if (isPaginated) {
					if (advancesFromLeft) api.prevPage();
					else api.nextPage();
				} else {
					handled = false;
				}
				break;
			case "ArrowUp":
				if (isPaginated) api.prevPage();
				else handled = false;
				break;
			case "ArrowDown":
				if (isPaginated) api.nextPage();
				else handled = false;
				break;
			case "KeyA":
				if (isPaginated) {
					if (advancesFromLeft) api.nextPage();
					else api.prevPage();
				} else if (api.setAutoScrollMultiplier) {
					onAutoScrollMultiplierChange(autoScrollMultiplier + 1);
				} else {
					handled = false;
				}
				break;
			case "KeyD":
				if (isPaginated) {
					if (advancesFromLeft) api.prevPage();
					else api.nextPage();
				} else if (api.setAutoScrollMultiplier) {
					onAutoScrollMultiplierChange(Math.max(1, autoScrollMultiplier - 1));
				} else {
					handled = false;
				}
				break;
			case "KeyN":
				onChangeChapter(verticalMode ? 1 : -1);
				break;
			case "KeyM":
				onChangeChapter(verticalMode ? -1 : 1);
				break;
			default:
				handled = false;
				break;
		}
		if (handled) event.preventDefault();
	});
}
