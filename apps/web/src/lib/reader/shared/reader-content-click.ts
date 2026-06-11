import type { FuriganaStyle } from "@/lib/reader/settings";

interface ContentClickConfig {
	hideSpoilerImage: boolean;
	hideFurigana: boolean;
	furiganaStyle: FuriganaStyle;
}

/**
 * Click handler for the book content, shared by both reader modes. In order:
 * reveal a clicked spoiler image, toggle/reveal furigana on a clicked ruby,
 * or route an internal anchor (`#id`) through `navigateToSection`.
 *
 * `live` must be read fresh on each click (the reader does not remount when
 * these settings change), so callers pass `livePropsRef.current`.
 */
export function handleReaderContentClick(
	event: MouseEvent,
	live: ContentClickConfig,
	navigateToSection: (reference: string) => void,
) {
	const target = event.target as HTMLElement | null;
	if (!target) return;

	const spoiler = target.closest("[data-ttu-spoiler-img]");
	if (spoiler && live.hideSpoilerImage) {
		spoiler.querySelector(".spoiler-label")?.remove();
		spoiler.removeAttribute("data-ttu-spoiler-img");
		spoiler.querySelector("img,image")?.classList.add("ttu-unspoilered");
		return;
	}

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
