import { env } from "@nanahoshi-v2/env/web";

const COVER_WEBP_QUALITY = 92;

export const coverPresets = {
	thumbnail: { widths: [40, 80, 120, 160], sizes: "80px" },
	small: {
		widths: [140, 160, 220, 320],
		sizes: "(max-width: 640px) 140px, 160px",
	},
	card: {
		widths: [160, 220, 320, 420, 500],
		sizes:
			"(max-width: 640px) 50vw, (max-width: 768px) 33vw, (max-width: 1024px) 25vw, (max-width: 1280px) 20vw, 16.7vw",
	},
	detail: {
		widths: [240, 280, 340, 420, 560],
		sizes: "(max-width: 768px) 240px, (max-width: 1280px) 280px, 340px",
	},
	banner: {
		widths: [640, 1024, 1440],
		sizes: "100vw",
	},
	activity: { widths: [54, 108, 162], sizes: "108px" },
} as const;

export type CoverPreset = (typeof coverPresets)[keyof typeof coverPresets];

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
