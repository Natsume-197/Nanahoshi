import { env } from "@nanahoshi-v2/env/web";

const COVER_WEBP_QUALITY = 92;

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
	return `${env.VITE_SERVER_URL}/api/data/covers/${coverFilename}?width=${width}&quality=${COVER_WEBP_QUALITY}`;
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
