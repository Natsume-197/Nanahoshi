/**
 * The welcome shelf, before there is any library to show: well-known books
 * (Open Library covers, no API key) mixed with audiobooks (Audible's square
 * art, picked without store badges), so the wall says both. Hand-picked so
 * every one reads well small. The art belongs to its publishers; a hosted
 * product should license or replace it.
 */
export type ShelfCover = { uri: string; square: boolean };

const book = (id: number): ShelfCover => ({
	uri: `https://covers.openlibrary.org/b/id/${id}-M.jpg`,
	square: false,
});
const audio = (id: string): ShelfCover => ({
	uri: `https://m.media-amazon.com/images/I/${id}._SL300_.jpg`,
	square: true,
});

const ROWS: ShelfCover[][] = [
	[
		book(11200092),
		audio("51azSAW7HcL"),
		book(13206180),
		book(8739376),
		audio("41rrXYM-wHL"),
		book(11481354),
		book(10138333),
		audio("51SnBgHWtmL"),
		book(13925598),
	],
	[
		book(10846610),
		audio("51dMWPi24NL"),
		book(14407898),
		book(11329782),
		audio("61rYqiz8yJL"),
		book(9315164),
		book(15241067),
		audio("61Csiq-T2hL"),
		book(7098465),
		book(10648686),
	],
	[
		book(11480483),
		audio("51J-2rThQ9L"),
		book(13064075),
		book(768883),
		audio("51yRFbmzBPL"),
		book(9407338),
		book(14627509),
		audio("410es2gSNRL"),
		book(15185412),
	],
];

export function welcomeCoverRows(): ShelfCover[][] {
	return ROWS;
}

/** A cover's width at a row height: books are 2:3, audiobooks square. */
export function coverWidth(cover: ShelfCover, height: number): number {
	return cover.square ? height : Math.round(height / 1.5);
}

/**
 * A row loops by sliding exactly one copy of itself, so the second copy
 * lands where the first began and the jump back is invisible.
 */
export function marqueeDistance(
	covers: ShelfCover[],
	height: number,
	gap: number,
): number {
	return covers.reduce(
		(sum, cover) => sum + coverWidth(cover, height) + gap,
		0,
	);
}
