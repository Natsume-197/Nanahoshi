import type { RefObject } from "react";
import type { ReaderPresentation } from "@/features/reader/presentation/reader-presentation";
import type { BookReaderApi } from "@/features/reader/reader-contract";
import { useWindowEvent } from "@/hooks/use-window-event";

interface UseReaderKeybindsArgs {
	apiRef: RefObject<BookReaderApi | null>;
	presentation: ReaderPresentation;
	verticalMode: boolean;
	/** Physical page direction for visual books; independent of writing mode. */
	visualDirection?: "ltr" | "rtl";
	/** Reader overlays that may own keyboard navigation. */
	galleryOpen: boolean;
	tocOpen: boolean;
	settingsOpen: boolean;
	/** A non-reader surface (for example the expanded player) owns input. */
	navigationBlocked?: boolean;
	onCloseToc: () => void;
	onCloseSettings: () => void;
	onChangeChapter: (offset: number) => void;
	onSaveReadingPoint?: () => void;
	onGoToReadingPoint?: () => void;
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
 * mode Nanahoshi additionally binds the arrows and A/D to page flips.
 */
export function useReaderKeybinds({
	apiRef,
	presentation,
	verticalMode,
	visualDirection,
	galleryOpen,
	tocOpen,
	settingsOpen,
	navigationBlocked = false,
	onCloseToc,
	onCloseSettings,
	onChangeChapter,
	onSaveReadingPoint,
	onGoToReadingPoint,
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
		const isPageFlipKey = isPaginated && pageFlipCodes.has(event.code);
		if (
			event.defaultPrevented ||
			event.isComposing ||
			event.altKey ||
			event.ctrlKey ||
			event.shiftKey ||
			event.metaKey
		) {
			return;
		}
		// Holding a page-flip key keeps turning pages; everything else
		// (chapter jumps)
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
				return;
			}
			// The docked settings panel remains open after changing a toggle or
			// stepper. Its buttons may keep focus, but page-turning keys should
			// continue to control a paginated reader behind it.
			if (tocOpen || !isPageFlipKey) return;
		}
		const target = event.target instanceof Element ? event.target : null;
		const isEditingTarget = target?.closest(
			'input, textarea, select, a, [contenteditable]:not([contenteditable="false"]), [role="textbox"]',
		);
		const isButtonTarget = target?.closest("button");
		const isBookmarkKey = event.code === "KeyB" || event.code === "KeyR";
		const isNavbarBookmarkKey =
			isBookmarkKey &&
			target?.closest("[data-reader-point-actions], [data-reader-header]");
		if (
			isEditingTarget ||
			(isButtonTarget &&
				!isNavbarBookmarkKey &&
				!(settingsOpen && isPageFlipKey))
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
				} else {
					handled = false;
				}
				break;
			case "KeyD":
				if (isPaginated) {
					if (advancesFromLeft) api.prevPage();
					else api.nextPage();
				} else {
					handled = false;
				}
				break;
			case "KeyB":
				if (onSaveReadingPoint) onSaveReadingPoint();
				else handled = false;
				break;
			case "KeyR":
				if (onGoToReadingPoint) onGoToReadingPoint();
				else handled = false;
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
