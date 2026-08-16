import type { RefObject } from "react";
import type { ReaderPresentation } from "@/features/reader/presentation/reader-presentation";
import {
	type BookReaderApi,
	supportsReaderAutoScroll,
} from "@/features/reader/reader-contract";
import { useWindowEvent } from "@/hooks/use-window-event";

interface UseReaderKeybindsArgs {
	apiRef: RefObject<BookReaderApi | null>;
	presentation: ReaderPresentation;
	verticalMode: boolean;
	/** Physical page direction for visual books; independent of writing mode. */
	visualDirection?: "ltr" | "rtl";
	autoScrollMultiplier: number;
	/** Any open overlay swallows the keys (it handles its own). */
	galleryOpen: boolean;
	tocOpen: boolean;
	settingsOpen: boolean;
	/** A non-reader surface (for example the expanded player) owns input. */
	navigationBlocked?: boolean;
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
 * The Nanahoshi default keybind map (book-reader-keybind.ts + store.ts). In paginated
 * mode Nanahoshi additionally binds the arrows and A/D to page flips; in continuous
 * mode A/D adjust the auto-scroll speed.
 */
export function useReaderKeybinds({
	apiRef,
	presentation,
	verticalMode,
	visualDirection,
	autoScrollMultiplier,
	galleryOpen,
	tocOpen,
	settingsOpen,
	navigationBlocked = false,
	onCloseToc,
	onCloseSettings,
	onChangeChapter,
	onAutoScrollMultiplierChange,
}: UseReaderKeybindsArgs) {
	useWindowEvent("keydown", (event) => {
		const isPaginated =
			presentation.renderer !== "text-scroll" &&
			!(
				presentation.renderer === "visual" &&
				(presentation.visualLayout === "horizontal-strip" ||
					presentation.visualLayout === "vertical-strip")
			);
		const advancesFromLeft =
			presentation.renderer === "visual"
				? visualDirection === "rtl"
				: verticalMode;
		if (event.altKey || event.ctrlKey || event.shiftKey || event.metaKey) {
			return;
		}
		// Holding a page-flip key keeps turning pages; everything else
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
		if (galleryOpen || navigationBlocked) return; // the owning overlay handles its own keys
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
			case "PageDown":
				api.nextPage();
				break;
			case "PageUp":
				api.prevPage();
				break;
			case "Space":
				if (supportsReaderAutoScroll(api)) api.toggleAutoScroll();
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
				} else if (supportsReaderAutoScroll(api)) {
					onAutoScrollMultiplierChange(autoScrollMultiplier + 1);
				} else {
					handled = false;
				}
				break;
			case "KeyD":
				if (isPaginated) {
					if (advancesFromLeft) api.prevPage();
					else api.nextPage();
				} else if (supportsReaderAutoScroll(api)) {
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
