/**
 * Whether status bar content should be light over a reader background.
 * Reader themes send oklch(), hex or rgb() colors; anything else keeps dark
 * content, the safe default on the light default theme.
 */
export function wantsLightStatusBar(color: string): boolean {
	const value = color.trim().toLowerCase();
	const oklch = value.match(/^oklch\(\s*([\d.]+)(%?)/);
	if (oklch?.[1]) {
		const lightness = Number(oklch[1]) / (oklch[2] ? 100 : 1);
		return lightness < 0.6;
	}
	let rgb: number[] | undefined;
	const hex = value.match(/^#([\da-f]{3}|[\da-f]{6})$/);
	if (hex?.[1]) {
		const digits =
			hex[1].length === 3
				? [...hex[1]].map((d) => d + d)
				: (hex[1].match(/../g) ?? []);
		rgb = digits.map((d) => Number.parseInt(d, 16));
	}
	const fn = value.match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/);
	if (fn) rgb = [fn[1], fn[2], fn[3]].map(Number);
	if (rgb?.length !== 3) return false;
	const [r = 0, g = 0, b = 0] = rgb;
	return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 < 0.5;
}
