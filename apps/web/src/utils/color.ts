import type { CSSProperties } from "react";

const DARK_ACCENT_FOREGROUND = "oklch(0 0 0)";
const LIGHT_ACCENT_FOREGROUND = "oklch(1 0 0)";

function resolveHexChannels(color: string): [number, number, number] | null {
	const longHexMatch = /^#([\da-f]{6})$/i.exec(color.trim());
	const shortHexMatch = /^#([\da-f]{3})$/i.exec(color.trim());
	const resolvedHex = shortHexMatch
		? shortHexMatch[1]
				.split("")
				.map((part) => `${part}${part}`)
				.join("")
		: longHexMatch?.[1];
	if (!resolvedHex) return null;
	const channels = resolvedHex.match(/.{2}/g);
	if (channels?.length !== 3) return null;
	return channels.map((value) => Number.parseInt(value, 16)) as [
		number,
		number,
		number,
	];
}

function relativeLuminance([r, g, b]: [number, number, number]): number {
	const [lr, lg, lb] = [r, g, b].map((channel) => {
		const value = channel / 255;
		return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
	});
	return 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
}

/**
 * Returns the higher-contrast foreground for a hex accent color.
 *
 * The crossover for black and white under WCAG relative luminance is ~0.179.
 * Choosing at 0.45 made white text fail AA on a large middle band of cover
 * colors. The endpoint foregrounds keep the pair at or above AA even at the
 * crossover itself.
 */
export function getAccentForegroundColor(accentColor: string) {
	const channels = resolveHexChannels(accentColor);
	if (!channels) return LIGHT_ACCENT_FOREGROUND;
	const luminance = relativeLuminance(channels);
	return luminance > 0.179 ? DARK_ACCENT_FOREGROUND : LIGHT_ACCENT_FOREGROUND;
}

/**
 * Tones a cover accent down for a compact media card.
 *
 * Every result is blended toward the same charcoal and capped below the
 * luminance where white text loses AA contrast. Dark colors still retain most
 * of their hue; very bright yellows and pinks are pulled down further instead
 * of becoming neon surfaces.
 */
export function getMutedAccentSurfaceColor(accentColor: string): string | null {
	const accent = resolveHexChannels(accentColor);
	if (!accent) return null;

	const neutral: [number, number, number] = [38, 36, 42];
	const blend = (accentWeight: number): [number, number, number] =>
		accent.map((channel, index) =>
			Math.round(
				channel * accentWeight + (neutral[index] ?? 0) * (1 - accentWeight),
			),
		) as [number, number, number];

	let low = 0;
	let high = 0.72;
	for (let iteration = 0; iteration < 12; iteration++) {
		const middle = (low + high) / 2;
		if (relativeLuminance(blend(middle)) <= 0.16) {
			low = middle;
		} else {
			high = middle;
		}
	}

	// A stronger final pass toward a lighter system neutral keeps only a quiet
	// trace of the cover hue. The result feels soft and powdery while remaining
	// dark enough to support white text.
	const softNeutral: [number, number, number] = [82, 80, 86];
	const softened = blend(low).map((channel, index) =>
		Math.round(channel * 0.45 + (softNeutral[index] ?? 0) * 0.55),
	) as [number, number, number];
	const [r, g, b] = softened;
	return `rgb(${r} ${g} ${b})`;
}

// Keyed by the cover hex, of which a library has few thousand at most. The
// plate costs a 12-step binary search, and these cards live in virtualized
// grids that re-render every scroll frame — without this the search runs per
// tile per frame. Caching the object also keeps its identity stable.
const tintedCardStyles = new Map<string, CSSProperties | undefined>();
const hoverTintStyles = new Map<string, CSSProperties>();

/**
 * Hover wash for a vertical card: the artwork's own color mixed into the theme's
 * hover surface. Kept faint — the muted subtitle sits on top of it.
 */
export function getHoverTintStyle(
	tint: string | null | undefined,
): CSSProperties | undefined {
	if (!tint) return undefined;
	const cached = hoverTintStyles.get(tint);
	if (cached) return cached;
	const style: CSSProperties = {
		backgroundColor: `color-mix(in oklab, ${tint} 14%, var(--surface-hover))`,
	};
	hoverTintStyles.set(tint, style);
	return style;
}

/**
 * The whole "this card is the color of its artwork" treatment in one place:
 * the muted plate plus the foreground that survives on it. Shared by Continue,
 * Showcase, and genre/tag tiles so every tinted surface follows one recipe.
 */
export function getTintedCardStyle(
	tint: string | null | undefined,
): CSSProperties | undefined {
	if (!tint) return undefined;
	const cached = tintedCardStyles.get(tint);
	if (cached !== undefined || tintedCardStyles.has(tint)) return cached;
	const backgroundColor = getMutedAccentSurfaceColor(tint);
	const style = backgroundColor
		? { backgroundColor, color: "oklch(1 0 0)" }
		: undefined;
	tintedCardStyles.set(tint, style);
	return style;
}

function srgbToLinear(channel: number): number {
	const value = channel / 255;
	return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function linearToSrgb(value: number): number {
	const encoded =
		value <= 0.0031308 ? value * 12.92 : 1.055 * value ** (1 / 2.4) - 0.055;
	return Math.round(Math.min(1, Math.max(0, encoded)) * 255);
}

function oklchToLinearRgb(
	l: number,
	c: number,
	h: number,
): [number, number, number] {
	const a = c * Math.cos(h);
	const b = c * Math.sin(h);
	const l_ = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
	const m_ = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
	const s_ = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
	return [
		4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_,
		-1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_,
		-0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_,
	];
}

// Lightness band keeps white text above ~6:1; the chroma cap stops neon covers
// from turning the whole hero into a highlighter.
const HERO_L_MIN = 0.34;
const HERO_L_MAX = 0.48;
const HERO_C_MAX = 0.14;
const HERO_DEEP_L_DROP = 0.06;
// Darkened yellow reads as olive; amber is how a dark yellow is expected to look.
const YELLOW_HUE_MIN = (80 * Math.PI) / 180;
const YELLOW_HUE_MAX = (125 * Math.PI) / 180;
const AMBER_HUE = (68 * Math.PI) / 180;

function heroRgb(l: number, c: number, h: number): string {
	let chroma = c;
	let linear = oklchToLinearRgb(l, chroma, h);
	// Pull chroma in until the color fits sRGB instead of clipping the hue.
	while (chroma > 0 && linear.some((v) => v < 0 || v > 1)) {
		chroma = Math.max(0, chroma - 0.005);
		linear = oklchToLinearRgb(l, chroma, h);
	}
	const [r, g, b] = linear.map(linearToSrgb);
	return `rgb(${r} ${g} ${b})`;
}

/**
 * The solid field behind a detail page's hero: the cover's own color, pinned
 * into a dark band so white text always reads, whatever the theme.
 */
export function getHeroSurfaceColors(
	accentColor: string | null | undefined,
): { base: string; deep: string } | null {
	if (!accentColor) return null;
	const channels = resolveHexChannels(accentColor);
	if (!channels) return null;
	const [lr, lg, lb] = channels.map(srgbToLinear);
	const l_ = Math.cbrt(
		0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb,
	);
	const m_ = Math.cbrt(
		0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb,
	);
	const s_ = Math.cbrt(
		0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb,
	);
	const l = 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_;
	const a = 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_;
	const b = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_;
	const c = Math.min(Math.hypot(a, b), HERO_C_MAX);
	const rawH = Math.atan2(b, a);
	const h = rawH >= YELLOW_HUE_MIN && rawH <= YELLOW_HUE_MAX ? AMBER_HUE : rawH;
	const heroL = Math.min(HERO_L_MAX, Math.max(HERO_L_MIN, l));
	return {
		base: heroRgb(heroL, c, h),
		deep: heroRgb(heroL - HERO_DEEP_L_DROP, c, h),
	};
}

export function contrastAgainstWhite(rgb: string): number {
	const match = /^rgb\((\d+) (\d+) (\d+)\)$/.exec(rgb);
	if (!match) return 0;
	const lum = relativeLuminance([
		Number(match[1]),
		Number(match[2]),
		Number(match[3]),
	]);
	return 1.05 / (lum + 0.05);
}
