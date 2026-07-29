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

	const [r, g, b] = blend(low);
	return `rgb(${r} ${g} ${b})`;
}
