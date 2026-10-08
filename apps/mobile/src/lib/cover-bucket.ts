import { ALLOWED_DIMS } from "@nanahoshi/api/lib/cover-ladder";

// Up to this much smaller than the slot, the rung below wins: a 450–480 px
// tile then reads the 400 the server keeps warm instead of a 600 it may have
// to encode, and decodes half the pixels; at 2–3x density it doesn't show.
const UNDERSIZE = 0.8;

/** The rung to ask for a slot this many pixels wide. */
export function coverBucket(wanted: number): number {
	const index = ALLOWED_DIMS.findIndex((dim) => dim >= wanted);
	if (index === -1) return ALLOWED_DIMS[ALLOWED_DIMS.length - 1];
	const below = ALLOWED_DIMS[index - 1];
	return below !== undefined && below >= wanted * UNDERSIZE
		? below
		: ALLOWED_DIMS[index];
}
