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

function hsl(rgb: [number, number, number]): [number, number, number] {
	const [r, g, b] = rgb.map((channel) => channel / 255);
	const max = Math.max(r, g, b);
	const min = Math.min(r, g, b);
	const l = (max + min) / 2;
	const d = max - min;
	if (d === 0) return [0, 0, l];
	const s = d / (1 - Math.abs(2 * l - 1));
	const h =
		max === r
			? ((g - b) / d + (g < b ? 6 : 0)) * 60
			: max === g
				? ((b - r) / d + 2) * 60
				: ((r - g) / d + 4) * 60;
	return [h, s, l];
}

function fromHsl(h: number, s: number, l: number): [number, number, number] {
	const k = (n: number) => (n + h / 30) % 12;
	const a = s * Math.min(l, 1 - l);
	const f = (n: number) =>
		l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
	return [f(0), f(8), f(4)].map((value) => Math.round(value * 255)) as [
		number,
		number,
		number,
	];
}

export type AmbientScene = {
	base: string;
	glow: [number, number, number];
	accent: [number, number, number];
	/** Glow opacity: bright hues (yellow) get less so every cover lands
	 * equally lit. */
	strength: number;
};

/**
 * Samsung Now Brief's backdrop from one cover colour: a near-black base of
 * its hue and two soft glows. The glows keep the colour's own saturation
 * (darkening a gold to a fixed lightness turned it brown); only lightness is
 * clamped so near-black and near-white covers still glow. The second glow is
 * a neighbouring hue, turned away from yellow so browns don't go olive.
 */
export function ambientScene(color: string | null | undefined): AmbientScene {
	const rgb = color ? channels(color) : null;
	const [h, s, l] = rgb ? hsl(rgb) : [230, 0.25, 0.45];
	const glowL = Math.min(0.62, Math.max(0.4, l));
	// Yellow fading into black passes through olive; amber stays golden.
	const glowHue = h >= 45 && h <= 75 ? 40 : h;
	// Capped: a neon cover colour glowing at full chroma shouts over the art.
	const glowS = Math.min(0.7, s);
	const glow = fromHsl(glowHue, glowS, glowL);
	// A dark yellow reads as olive: keep the base nearly neutral there.
	const yellowish = h >= 45 && h <= 110;
	const [r, g, b] = fromHsl(h, Math.min(yellowish ? 0.12 : 0.35, s), 0.1);
	return {
		base: `rgb(${r}, ${g}, ${b})`,
		glow,
		accent: fromHsl((glowHue + 325) % 360, glowS * 0.8, glowL),
		strength: Math.min(1, 0.55 / Math.sqrt(relativeLuminance(glow) || 0.01)),
	};
}
