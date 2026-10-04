import type { CSSProperties } from "react";

export interface PdfPageToneLayers {
	/** Applied to the page raster first. */
	filter: string;
	/** Stacked above the raster in order; blend modes stay GPU-composited while scrolling. */
	layers: CSSProperties[];
}

// Scans print on grey-ish paper; contrast settles it on the theme background and firms up the ink.
const NORMALIZE = "grayscale(1) contrast(1.3)";

/**
 * Maps paper to the theme background and ink to the theme text colour.
 * Light themes: screen(multiply(page, bg), fg). Dark themes invert first so
 * the dark ink becomes the light text: screen(multiply(1 − page, fg), bg).
 */
export function pdfPageToneLayers({
	dark,
	foreground,
	background,
}: {
	dark: boolean;
	foreground: string;
	background: string;
}): PdfPageToneLayers {
	const [multiply, screen] = dark
		? [foreground, background]
		: [background, foreground];
	return {
		filter: dark ? `${NORMALIZE} invert(1)` : NORMALIZE,
		layers: [
			{ backgroundColor: multiply, mixBlendMode: "multiply" },
			{ backgroundColor: screen, mixBlendMode: "screen" },
		],
	};
}

const darkness = new Map<string, boolean>();

/** Resolves any CSS colour (hex, rgb, oklch…) through a 1px canvas. */
export function isDarkCssColor(color: string): boolean {
	const cached = darkness.get(color);
	if (cached !== undefined) return cached;
	let dark = false;
	try {
		const context = document
			.createElement("canvas")
			.getContext("2d", { willReadFrequently: true });
		if (context) {
			context.fillStyle = color;
			context.fillRect(0, 0, 1, 1);
			const [r = 255, g = 255, b = 255] = context.getImageData(0, 0, 1, 1).data;
			dark = relativeLuminance(r, g, b) < 0.4;
		}
	} catch {
		// Unresolvable colours fall back to the light mapping.
	}
	darkness.set(color, dark);
	return dark;
}

export function relativeLuminance(r: number, g: number, b: number) {
	const channel = (value: number) => {
		const c = value / 255;
		return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
	};
	return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}
