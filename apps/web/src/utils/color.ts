const DARK_ACCENT_FOREGROUND = "oklch(0 0 0)";
const LIGHT_ACCENT_FOREGROUND = "oklch(1 0 0)";

/**
 * Returns the higher-contrast foreground for a hex accent color.
 *
 * The crossover for black and white under WCAG relative luminance is ~0.179.
 * Choosing at 0.45 made white text fail AA on a large middle band of cover
 * colors. The endpoint foregrounds keep the pair at or above AA even at the
 * crossover itself.
 */
export function getAccentForegroundColor(accentColor: string) {
	const longHexMatch = /^#([\da-f]{6})$/i.exec(accentColor.trim());
	const shortHexMatch = /^#([\da-f]{3})$/i.exec(accentColor.trim());
	const resolvedHex = shortHexMatch
		? shortHexMatch[1]
				.split("")
				.map((p) => `${p}${p}`)
				.join("")
		: longHexMatch?.[1];
	if (!resolvedHex) return LIGHT_ACCENT_FOREGROUND;
	const channels = resolvedHex.match(/.{2}/g);
	if (channels?.length !== 3) return LIGHT_ACCENT_FOREGROUND;
	const [r, g, b] = channels.map((v) => Number.parseInt(v, 16) / 255);
	const [lr, lg, lb] = [r, g, b].map((c) =>
		c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4,
	);
	const luminance = 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
	return luminance > 0.179 ? DARK_ACCENT_FOREGROUND : LIGHT_ACCENT_FOREGROUND;
}
