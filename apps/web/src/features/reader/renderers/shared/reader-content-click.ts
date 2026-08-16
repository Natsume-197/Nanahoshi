import type { FuriganaStyle } from "@/features/reader/presentation/settings";

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
) {
	const target = event.target as HTMLElement | null;
	if (!target) return;

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
			return;
		}
	}

	const anchor = target.closest("a");
	if (anchor) {
		event.preventDefault();
		const href = anchor.getAttribute("href");
		if (href?.startsWith("#")) {
			navigateToSection(href.slice(1));
		}
	}
}
