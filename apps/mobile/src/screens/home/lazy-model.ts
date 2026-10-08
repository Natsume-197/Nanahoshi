/** One screen of lookahead below the viewport. */
const LOOKAHEAD_SCREENS = 1;

/** Whether the bottom of what Home has drawn is close enough to the
 * viewport that the next section should mount. */
export function shouldRevealMore(
	scrollY: number,
	viewport: number,
	contentHeight: number,
): boolean {
	"worklet";
	return scrollY + viewport * (1 + LOOKAHEAD_SCREENS) >= contentHeight;
}
