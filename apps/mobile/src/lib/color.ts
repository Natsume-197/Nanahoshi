/**
 * Colour recipes shared with apps/web/src/utils/color.ts — same maths, so a
 * cover tints its card identically on the phone and on the web.
 */
function channels(color: string): [number, number, number] | null {
	const long = /^#([\da-f]{6})$/i.exec(color.trim());
	const short = /^#([\da-f]{3})$/i.exec(color.trim());
	const hex = short
		? short[1]
				.split("")
				.map((part) => part + part)
				.join("")
		: long?.[1];
	if (!hex) return null;
	const parts = hex.match(/.{2}/g);
	if (parts?.length !== 3) return null;
	return parts.map((value) => Number.parseInt(value, 16)) as [
		number,
		number,
		number,
	];
}

function relativeLuminance([r, g, b]: [number, number, number]) {
	const [lr, lg, lb] = [r, g, b].map((channel) => {
		const value = channel / 255;
		return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
	});
	return 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
}

/**
 * The web's getMutedAccentSurfaceColor: blend the cover colour toward
 * charcoal until white text keeps AA, then soften toward a neutral. Bright
 * yellows and pinks are pulled down instead of becoming neon plates.
 */
export function mutedAccentSurface(
	accent: string | null | undefined,
): string | null {
	if (!accent) return null;
	const rgb = channels(accent);
	if (!rgb) return null;
	const neutral: [number, number, number] = [38, 36, 42];
	const blend = (weight: number) =>
		rgb.map((channel, index) =>
			Math.round(channel * weight + neutral[index] * (1 - weight)),
		) as [number, number, number];
	let low = 0;
	let high = 0.72;
	for (let iteration = 0; iteration < 12; iteration++) {
		const middle = (low + high) / 2;
		if (relativeLuminance(blend(middle)) <= 0.16) low = middle;
		else high = middle;
	}
	const soft: [number, number, number] = [82, 80, 86];
	const [r, g, b] = blend(low).map((channel, index) =>
		Math.round(channel * 0.45 + soft[index] * 0.55),
	);
	return `rgb(${r}, ${g}, ${b})`;
}

/** Darken a hex toward black (genre tiles carry white text). */
export function shade(
	hex: string | null | undefined,
	amount = 0.55,
): string | null {
	const rgb = hex ? channels(hex) : null;
	if (!rgb) return null;
	const [r, g, b] = rgb.map((channel) => Math.round(channel * (1 - amount)));
	return `rgb(${r}, ${g}, ${b})`;
}
