/**
 * The Rendition Ladder: which widths of a cover may exist, and which of them a
 * given Cover Master can honestly answer for.
 *
 * This module is imported by both the server and the web bundle, so it must
 * stay dependency-free.
 *
 * The load-bearing idea is that the ladder is *derived*, not declared. The
 * serve route resizes with `withoutEnlargement`, so asking for a width above
 * the master's real resolution returns fewer pixels than the request implies.
 * A client that builds `Nw` descriptors from the widths it *asked for* is
 * therefore lying to the browser's candidate selection, and every rung above
 * the master resolves to the same bytes under a different URL. Truncating the
 * ladder at the master fixes both at once — which is only possible because the
 * master's width travels inside its filename (see `cover-store.ts`).
 */

/** Requested widths snap to this set, so the unauthenticated resize cache can
 * only ever hold a bounded number of files per cover. */
export const ALLOWED_DIMS = [
	64, 128, 200, 300, 400, 600, 800, 1200, 2048,
] as const;

const MAX_COVER_DIM = 2048;

export const ALLOWED_QUALITIES = [50, 60, 75, 86, 95] as const;
const MAX_QUALITY = Math.max(...ALLOWED_QUALITIES);

/**
 * AVIF scale. Measured on real covers (RGB SSIM vs the lanczos reference):
 * q86 0.984, q95 0.994, with flat encode time across the range and no slower
 * decode — so sharpness is the only axis that moves. Past here the curve
 * breaks: q100 costs +302% bytes for +0.005, spent reproducing the source's
 * own artifacts rather than recovering detail.
 */
export const COVER_QUALITY = 95;

/**
 * The ceiling for a stored Cover Master, on its **long edge**.
 *
 * Covers are portrait, so the long edge is the height and this number does not
 * bound the axis the layout actually asks for. At 2:3 a 1600 ceiling leaves
 * 1067px of width — under the 1200 rung the detail page requests, which cost
 * 63% of the library that rung when this was 1600. 2000 clears it with room:
 * measured over 400 real covers, a 2000 ceiling fills 1200w for exactly the
 * same 65% that an unbounded store would, so the ceiling stops costing
 * resolution and only bounds outliers.
 */
export const COVER_STORE_MAX_DIM = 2000;

/**
 * Widths rendered before an ingest job is considered complete. These match the
 * image sizes used most often by the UI: 128px thumbnails, 200px small cards,
 * and 300/400px cards and detail views.
 *
 * The rest of the ladder intentionally stays out of this critical path: the
 * fallback path can serve one of these files while its exact rendition is made
 * in the background.
 */
export const WARM_WIDTHS = [128, 200, 300, 400] as const;

/**
 * Useful, but not worth delaying a newly scanned library for. The worker
 * enqueues these after the immediate warm pass with lower queue priority, so a
 * retina/detail rendition is ready soon without competing with new ingests.
 */
export const DEFERRED_WARM_WIDTHS = [600] as const;
export const WARM_QUALITY = COVER_QUALITY;

export function snapDim(n: number): number {
	if (!Number.isFinite(n) || n <= 0) return 0;
	return ALLOWED_DIMS.find((d) => d >= n) ?? MAX_COVER_DIM;
}

export function snapQuality(n: number): number {
	if (!Number.isFinite(n)) return 60;
	// Above the top bucket, clamp up: falling back to the default would answer a
	// request for *more* quality with markedly less.
	return ALLOWED_QUALITIES.find((q) => q >= n) ?? MAX_QUALITY;
}

/**
 * The master's real width, read back out of the name the ingest module gave it
 * (`<uuid>_w1350.jpg`). Returns null for anything that has not been through
 * ingest yet — those keep the full declared ladder, which is exactly the
 * behaviour they had before this module existed.
 */
export function masterWidthFromFilename(
	filename: string | null | undefined,
): number | null {
	if (!filename) return null;
	const match = /_w(\d{2,5})\.[a-z0-9]+$/i.exec(filename);
	if (!match?.[1]) return null;
	const width = Number(match[1]);
	return Number.isFinite(width) && width > 0 ? width : null;
}

/**
 * Truncates a preset's declared widths at what the master can actually deliver.
 *
 * A master that sits between two rungs becomes its own top rung, so the widest
 * candidate is exact rather than rounded up into a lie — unless it lands close
 * enough to the rung below that the two would snap into the same cache bucket
 * and duplicate the bytes.
 */
export function coverLadder(
	widths: readonly number[],
	masterWidth: number | null,
): number[] {
	if (!masterWidth) return [...widths];

	const under = widths.filter((w) => w < masterWidth);
	if (widths.includes(masterWidth)) return [...under, masterWidth];

	const top = under.at(-1);
	// 1.15x: below that the extra rung buys no visible detail and costs a second
	// encode of near-identical bytes.
	if (top !== undefined && masterWidth < top * 1.15) return under;
	return [...under, masterWidth];
}
