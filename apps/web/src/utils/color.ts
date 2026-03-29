/**
 * Returns an appropriate foreground color (light or dark) for a given hex accent color,
 * based on WCAG relative luminance contrast.
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
	if (!resolvedHex) return "oklch(0.97 0.01 80)";
	const channels = resolvedHex.match(/.{2}/g);
	if (!channels || channels.length !== 3) return "oklch(0.97 0.01 80)";
	const [r, g, b] = channels.map((v) => Number.parseInt(v, 16) / 255);
	const [lr, lg, lb] = [r, g, b].map((c) =>
		c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4,
	);
	const luminance = 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
	return luminance > 0.45 ? "oklch(0.2 0.012 55)" : "oklch(0.97 0.01 80)";
}
