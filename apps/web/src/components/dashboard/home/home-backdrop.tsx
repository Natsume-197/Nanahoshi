import type { JSX } from "react";
import { useHomeBackdrop } from "@/hooks/books/use-home-backdrop";
import { useMountEffect } from "@/hooks/use-mount-effect";
import { setHeroBackdrop } from "@/lib/hero-backdrop-store";
import {
	coverPresets,
	getCoverFilename,
	getCoverPresetUrl,
	getCoverSrcSet,
} from "@/utils/covers";

/**
 * Keeps the navbar wash on the home without a hero card: hands the top
 * in-progress title's color + cover to the layout's shared backdrop surface
 * (the same one the book detail page paints). Renders nothing visible. Keyed by
 * uuid so it republishes when the leading title changes and clears on unmount.
 */
export function HomeBackdrop(): JSX.Element | null {
	const backdrop = useHomeBackdrop();
	if (!backdrop) return null;
	return <HomeBackdropPublisher key={backdrop.uuid} {...backdrop} />;
}

function HomeBackdropPublisher({
	cover,
	mainColor,
}: {
	cover: string | null;
	mainColor: string | null;
}): null {
	const filename = getCoverFilename(cover);
	const coverUrl = filename
		? getCoverPresetUrl(filename, coverPresets.small)
		: null;
	const coverSrcSet = filename
		? getCoverSrcSet(filename, coverPresets.small.widths)
		: undefined;

	useMountEffect(() => {
		setHeroBackdrop({ accent: mainColor, coverUrl, coverSrcSet });
		return () => setHeroBackdrop(null);
	});
	return null;
}
