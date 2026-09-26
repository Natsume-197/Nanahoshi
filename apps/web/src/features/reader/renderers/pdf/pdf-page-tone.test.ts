import { describe, expect, test } from "bun:test";
import { pdfPageToneLayers, relativeLuminance } from "./pdf-page-tone";

describe("pdfPageToneLayers", () => {
	test("on a light theme paper takes the background and ink the text colour", () => {
		const tone = pdfPageToneLayers({
			dark: false,
			foreground: "#222",
			background: "#f4ecd8",
		});

		expect(tone.filter).not.toContain("invert");
		expect(tone.layers).toEqual([
			{ backgroundColor: "#f4ecd8", mixBlendMode: "multiply" },
			{ backgroundColor: "#222", mixBlendMode: "screen" },
		]);
	});

	test("on a dark theme the page is inverted so ink becomes the light text", () => {
		const tone = pdfPageToneLayers({
			dark: true,
			foreground: "#ddd",
			background: "#121212",
		});

		expect(tone.filter).toContain("invert(1)");
		expect(tone.layers).toEqual([
			{ backgroundColor: "#ddd", mixBlendMode: "multiply" },
			{ backgroundColor: "#121212", mixBlendMode: "screen" },
		]);
	});
});

test("relativeLuminance tells dark reader backgrounds from light ones", () => {
	expect(relativeLuminance(18, 18, 18)).toBeLessThan(0.4);
	expect(relativeLuminance(247, 246, 235)).toBeGreaterThan(0.4);
});
