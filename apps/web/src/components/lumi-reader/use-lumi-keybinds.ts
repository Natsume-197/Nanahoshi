// Ported from ttu's keymap (BSD-3-Clause, ッツ Reader Authors).

import type { ReaderStore } from "@lostcoords/lumi-reader-core";
import { useWindowEvent } from "@/hooks/use-window-event";

interface LumiKeybindOptions {
	store: ReaderStore;
	vertical: boolean;
	paginated: boolean;
	overlayOpen: boolean;
	onToggleMenu: () => void;
	onEscape: () => void;
	onSetBookmark: () => void;
	onReturnBookmark: () => void;
}

function isEditable(target: EventTarget | null): boolean {
	const el = target as HTMLElement | null;
	if (!el) return false;
	const tag = el.tagName;
	return tag === "INPUT" || tag === "TEXTAREA" || el.isContentEditable;
}

/** Wires keyboard navigation (page/chapter turns, bookmark, Escape) for the reader. */
export function useLumiKeybinds(options: LumiKeybindOptions): void {
	const {
		store,
		vertical,
		paginated,
		overlayOpen,
		onToggleMenu,
		onEscape,
		onSetBookmark,
		onReturnBookmark,
	} = options;

	useWindowEvent("keydown", (event) => {
		if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey)
			return;
		if (isEditable(event.target)) return;

		if (event.code === "Escape") {
			if (overlayOpen) {
				event.preventDefault();
				onEscape();
			}
			return;
		}
		// While a panel is open, swallow the rest so paging doesn't run behind it.
		if (overlayOpen) return;

		const forward = () => (vertical ? store.prevPage() : store.nextPage());
		const backward = () => (vertical ? store.nextPage() : store.prevPage());

		switch (event.code) {
			case "PageDown":
				store.nextPage();
				break;
			case "PageUp":
				store.prevPage();
				break;
			case "ArrowRight":
			case "KeyD":
				if (paginated) forward();
				break;
			case "ArrowLeft":
			case "KeyA":
				if (paginated) backward();
				break;
			case "ArrowDown":
				if (paginated) store.nextPage();
				break;
			case "ArrowUp":
				if (paginated) store.prevPage();
				break;
			case "KeyN":
				if (vertical) store.nextChapter();
				else store.prevChapter();
				break;
			case "KeyM":
				if (vertical) store.prevChapter();
				else store.nextChapter();
				break;
			case "KeyB":
				onSetBookmark();
				break;
			case "KeyR":
				onReturnBookmark();
				break;
			case "Backquote":
				onToggleMenu();
				break;
			default:
				return;
		}
		event.preventDefault();
	});
}
