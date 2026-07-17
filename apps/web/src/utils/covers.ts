import { env } from "@nanahoshi-v2/env/web";

// AVIF scale — roughly equivalent to the webp 92 this replaced.
const COVER_AVIF_QUALITY = 60;

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

export const coverPresets = {
	thumbnail: { widths: [40, 80, 120, 160, 240], sizes: "96px" },
	small: {
		widths: [140, 160, 220, 320, 480],
		sizes: "(max-width: 640px) 170px, 200px",
	},
	card: {
		widths: [160, 220, 320, 420, 500, 640, 800],
		sizes:
			"(max-width: 640px) 55vw, (max-width: 768px) 38vw, (max-width: 1024px) 30vw, (max-width: 1280px) 24vw, 20vw",
	},
	detail: {
		widths: [240, 280, 340, 420, 560, 680],
		sizes: "(max-width: 768px) 280px, (max-width: 1280px) 340px, 400px",
	},
	banner: {
		widths: [640, 1024, 1440, 1920],
		sizes: "100vw",
	},
	activity: { widths: [54, 108, 162, 216], sizes: "128px" },
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
	return getCoverUrl(coverFilename, preset.widths[preset.widths.length - 1]);
}
