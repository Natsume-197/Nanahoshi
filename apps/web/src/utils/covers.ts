import { env } from "@nanahoshi-v2/env/web";

// AVIF scale, and one of ALLOWED_QUALITIES in apps/server/src/routes/covers.ts —
// an unlisted value gets snapped there. Measured on a sample of real covers (RGB
// SSIM vs the lanczos reference): q86 0.984, q95 0.994. Encode time is flat
// across the range and q95 decodes no slower than q86, so sharpness is the
// only axis that moves. Past here the curve breaks: q100 costs +302% bytes and a
// slower decode for +0.005, and it spends those bytes reproducing the source
// JPEG's own artifacts rather than recovering detail.
const COVER_AVIF_QUALITY = 95;

/**
 * Minimum book-cover tile width (px). Single source of truth so every grid
 * renders covers at the same size as the dashboard carousels on tablet/desktop.
 * Mobile grids force two columns and may render slightly narrower tiles.
 */
export const BOOK_TILE_MIN_WIDTH = 180;

/**
 * Responsive auto-fill grid for book covers. Keep the literal in sync with
 * `BOOK_TILE_MIN_WIDTH` — Tailwind only sees static class strings, so the
 * pixel value can't be interpolated here.
 */
export const BOOK_GRID_CLASS =
	"grid grid-cols-2 gap-2 sm:grid-cols-[repeat(auto-fill,minmax(180px,1fr))]";

/**
 * Hairline edge for a cover sitting directly on a surface, so pale artwork
 * doesn't bleed into the background. Pure black/white rather than `border` —
 * that token is warm-tinted (hue 70 in light mode) and a tinted outline picks
 * up the hue and reads as dirt along the cover edge.
 */
export const COVER_EDGE =
	"outline outline-[oklch(0_0_0/0.1)] -outline-offset-1 dark:outline-[oklch(1_0_0/0.1)]";

/**
 * Every width here must be one of the server's resize buckets (`ALLOWED_DIMS` in
 * `apps/server/src/routes/covers.ts`). A request is snapped up to the next
 * bucket, so off-bucket widths make the `Nw` descriptor understate the pixels
 * actually delivered — the browser then picks against numbers that are wrong,
 * and neighbouring descriptors that snap to the same bucket become duplicate
 * candidates for a byte-identical file.
 *
 * `defaultWidth` backs the plain `src` (the no-srcSet fallback and what hover
 * preloads fetch), so it tracks the 1x slot rather than the top of the ladder.
 */
export const coverPresets = {
	thumbnail: { widths: [128, 200, 300], defaultWidth: 128, sizes: "96px" },
	// Carousels and the compact grids. Tiles start at BOOK_TILE_MIN_WIDTH and
	// stretch with the track, so the declared slot follows the stretched width —
	// declaring the minimum starves 2x/3x displays.
	small: {
		widths: [200, 300, 400, 600, 800],
		defaultWidth: 300,
		sizes: "(max-width: 640px) 180px, 240px",
	},
	card: {
		widths: [200, 300, 400, 600, 800, 1200],
		defaultWidth: 400,
		sizes: "(max-width: 640px) 50vw, 200px",
	},
	// Tracks the detail-page cover frame: max-w-[15rem], xl:17rem, 2xl:18rem.
	detail: {
		widths: [300, 400, 600, 800, 1200],
		defaultWidth: 400,
		sizes: "(max-width: 1279px) 240px, (max-width: 1535px) 272px, 288px",
	},
	banner: {
		widths: [800, 1200, 2048],
		defaultWidth: 1200,
		sizes: "100vw",
	},
	activity: { widths: [128, 200, 300], defaultWidth: 200, sizes: "128px" },
} as const;

export type CoverPreset = (typeof coverPresets)[keyof typeof coverPresets];

export function getCoverFilename(
	coverPath: string | null | undefined,
): string | null {
	if (!coverPath) return null;
	return coverPath.split("/").pop() ?? null;
}

export function getCoverUrl(coverFilename: string, width: number): string {
	return `${env.VITE_SERVER_URL}/api/data/covers/${coverFilename}?width=${width}&quality=${COVER_AVIF_QUALITY}`;
}

export function getCoverSrcSet(
	coverFilename: string,
	widths: readonly number[],
): string {
	return widths
		.map((width) => `${getCoverUrl(coverFilename, width)} ${width}w`)
		.join(", ");
}

export function getCoverPresetUrl(
	coverFilename: string,
	preset: CoverPreset,
): string {
	return getCoverUrl(coverFilename, preset.defaultWidth);
}
