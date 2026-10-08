const RENDERED_ICON =
	/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.png$/;
const UNPACKED_FONT = /\/ExponentAsset-[0-9a-f]+\.ttf$/;
// The symbol fonts still load at runtime; only the old 6 MB UI fonts go.
const BIG_FONT = 1_000_000;

/** Whether a cache file is a leftover of older builds: a tab icon rendered on
 * every launch (now kept in tab-icons-v1) or a UI font unpacked at runtime
 * (now embedded in the app). */
export function isLeftover(uri: string, size: number) {
	return (
		RENDERED_ICON.test(uri) || (UNPACKED_FONT.test(uri) && size > BIG_FONT)
	);
}
