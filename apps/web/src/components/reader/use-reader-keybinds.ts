import type { RefObject } from "react";
import { useWindowEvent } from "@/hooks/use-window-event";
import type { ReaderBookmark } from "@/lib/reader/types";
import type { BookReaderApi } from "./reader-shared-props";

interface UseReaderKeybindsArgs {
	apiRef: RefObject<BookReaderApi | null>;
	bookmarkRef: RefObject<ReaderBookmark | undefined>;
	isPaginated: boolean;
	verticalMode: boolean;
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

/**
 * The ttu default keybind map (book-reader-keybind.ts + store.ts). In paginated
 * mode ttu additionally binds the arrows and A/D to page flips; in continuous
 * mode A/D adjust the auto-scroll speed.
 */
export function useReaderKeybinds({
	apiRef,
	bookmarkRef,
	isPaginated,
	verticalMode,
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
		if (
			event.altKey ||
			event.ctrlKey ||
			event.shiftKey ||
			event.metaKey ||
			event.repeat
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
			target &&
			(target.tagName === "INPUT" ||
				target.tagName === "TEXTAREA" ||
				target.isContentEditable)
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
				api.toggleAutoScroll();
				break;
			case "ArrowLeft":
				if (isPaginated) {
					if (verticalMode) api.nextPage();
					else api.prevPage();
				} else {
					handled = false;
				}
				break;
			case "ArrowRight":
				if (isPaginated) {
					if (verticalMode) api.prevPage();
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
					if (verticalMode) api.nextPage();
					else api.prevPage();
				} else {
					onAutoScrollMultiplierChange(autoScrollMultiplier + 1);
				}
				break;
			case "KeyD":
				if (isPaginated) {
					if (verticalMode) api.prevPage();
					else api.nextPage();
				} else {
					onAutoScrollMultiplierChange(Math.max(1, autoScrollMultiplier - 1));
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
