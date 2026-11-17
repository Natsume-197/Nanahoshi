import { describe, expect, test } from "bun:test";
import { type Palette, palettes } from "./palettes";

const channel = (value: number) => {
	const c = value / 255;
	return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};
const luminance = (hex: string) => {
	const [r, g, b] = (hex.slice(1).match(/../g) ?? []).map((pair) =>
		channel(Number.parseInt(pair, 16)),
	);
	return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: string, b: string) => {
	const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
	return (hi + 0.05) / (lo + 0.05);
};

type Token = keyof Palette;
// WCAG AA for normal text: what is read, on every ground it is read on.
const AA = 4.5;
const READ_ON: [Token, Token[]][] = [
	["text", ["background", "card", "surfaceCard", "sheet", "input", "chrome"]],
	[
		"textSecondary",
		["background", "card", "surfaceCard", "sheet", "input", "chrome"],
	],
	// Destructive rows and menu items.
	["danger", ["background", "surfaceCard", "sheet"]],
	["warning", ["background", "surfaceCard", "sheet"]],
	// Tab labels and icons of the unselected tabs.
	["navInactive", ["chrome"]],
	// Labels on filled buttons.
	["onPrimary", ["primary"]],
];

describe.each(Object.entries(palettes))("%s palette", (_name, palette) => {
	for (const [ink, grounds] of READ_ON)
		test(`${ink} holds AA on ${grounds.join(", ")}`, () => {
			const below = grounds
				.map((ground) => ({
					ground,
					ratio: contrast(String(palette[ink]), String(palette[ground])),
				}))
				.filter(({ ratio }) => ratio < AA);
			expect(below).toEqual([]);
		});

	test("hints and placeholders' quieter step still reads (3:1)", () => {
		for (const ground of ["background", "surfaceCard", "sheet"] as const)
			expect(
				contrast(palette.textTertiary, palette[ground]),
			).toBeGreaterThanOrEqual(3);
	});

	test("the search field's edge shows against the field and the page", () => {
		for (const ground of ["input", "background"] as const)
			expect(
				contrast(palette.fieldBorder, palette[ground]),
			).toBeGreaterThanOrEqual(1.15);
	});

	test("raised surfaces step away from the canvas", () => {
		expect(palette.surfaceCard).not.toBe(palette.background);
		expect(palette.navIndicator).not.toBe(palette.chrome);
	});
});
