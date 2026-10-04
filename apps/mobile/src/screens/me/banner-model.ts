/** Darkest the scrim over the pinned banner gets, so white text reads on it. */
const MAX_SCRIM = 0.4;
/** Half the avatar overlaps the banner; shrunk to half from its bottom edge,
 * it has just left the banner as the banner pins over the page. */
const MIN_AVATAR_SCALE = 0.5;

export type BannerFrame = {
	/** Visible banner height. */
	height: number;
	/** Pull-to-stretch scale, 1 when not overscrolled. */
	scale: number;
	/** 0 at rest → 1 once the banner is pinned under the bar. */
	progress: number;
	/** The banner has collapsed to the bar and now covers the page. */
	pinned: boolean;
	scrim: number;
	avatarScale: number;
};

/**
 * The profile banner as the page scrolls, X's way: it shrinks with the page
 * until it is the bar's height, then stays pinned behind the bar, blurring
 * and darkening on the way. Pulling past the top stretches it instead.
 */
export function bannerFrame(
	scrollY: number,
	restHeight: number,
	barBottom: number,
): BannerFrame {
	"worklet";
	if (scrollY < 0)
		return {
			height: restHeight - scrollY,
			scale: 1 - scrollY / restHeight,
			progress: 0,
			pinned: false,
			scrim: 0,
			avatarScale: 1,
		};
	const travel = Math.max(1, restHeight - barBottom);
	const progress = Math.min(1, scrollY / travel);
	return {
		height: Math.max(barBottom, restHeight - scrollY),
		scale: 1,
		progress,
		pinned: scrollY >= travel,
		scrim: progress * MAX_SCRIM,
		avatarScale: 1 - progress * (1 - MIN_AVATAR_SCALE),
	};
}
