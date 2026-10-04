import type { FuriganaStyle } from "../../presentation/settings";

interface ContentClickConfig {
	hideFurigana: boolean;
	furiganaStyle: FuriganaStyle;
}

/**
 * Click handler for the book content, shared by both reader modes: toggle/reveal
 * furigana on a clicked ruby, or route an internal anchor (`#id`) through
 * `navigateToSection`.
 */
export function handleReaderContentClick(
	event: MouseEvent,
	live: ContentClickConfig,
	navigateToSection: (reference: string) => void,
): boolean {
	const target = event.target as HTMLElement | null;
	if (!target) return false;

	if (
		live.hideFurigana &&
		(live.furiganaStyle === "Toggle" || live.furiganaStyle === "Full")
	) {
		const ruby = target.closest("ruby");
		if (ruby) {
			if (live.furiganaStyle === "Toggle") {
				ruby.classList.toggle("reveal-rt");
			} else {
				ruby.classList.add("reveal-rt");
			}
			return true;
		}
	}

	const anchor = target.closest("a");
	if (!anchor) return false;
	event.preventDefault();
	const href = anchor.getAttribute("href");
	if (href?.startsWith("#")) {
		navigateToSection(href.slice(1));
	}
	return true;
}

/**
 * A tap in the middle of the page on a touch screen opens the reader menu, as
 * in Kindle or Play Books. Desktop keeps ttu's behaviour (the top strip), and
 * a tap that ends a text selection never counts.
 */
export function isChromeTap({
	x,
	left,
	width,
	coarsePointer,
	selecting,
}: {
	x: number;
	left: number;
	width: number;
	coarsePointer: boolean;
	selecting: boolean;
}) {
	if (!coarsePointer || selecting || width <= 0) return false;
	const position = (x - left) / width;
	return position >= 0.3 && position <= 0.7;
}

/** Runs `toggle` when a content click that nothing else claimed is a chrome tap. */
export function toggleChromeOnTap(
	event: MouseEvent,
	toggle: (() => void) | undefined,
) {
	if (!toggle) return;
	const tap = isChromeTap({
		x: event.clientX,
		left: 0,
		width: window.innerWidth,
		coarsePointer: window.matchMedia?.("(pointer: coarse)").matches ?? false,
		selecting: !(document.getSelection()?.isCollapsed ?? true),
	});
	if (tap) toggle();
}
