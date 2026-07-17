import "@/test-utils/setup-dom";
import { afterEach, describe, expect, it } from "bun:test";
import {
	applyPaletteVars,
	buildCustomPalette,
	buildSeedPalette,
	checkCustomContrast,
	contrastRatio,
	DEFAULT_CUSTOM_INPUT,
	DEFAULT_SEED_INPUT,
	getStoredPalette,
	previewCustomVars,
	previewSeedVars,
	type StoredPalette,
	storePalette,
} from "../theme-palettes";

const SAMPLE: StoredPalette = {
	id: "oled",
	base: "dark",
	vars: { "--background": "#000000", "--card": "#141417" },
};

afterEach(() => {
	storePalette(null);
	applyPaletteVars(null);
});

describe("storePalette / getStoredPalette", () => {
	it("round-trips a palette through localStorage", () => {
		storePalette(SAMPLE);
		expect(getStoredPalette()).toEqual(SAMPLE);
	});

	it("returns null when nothing is stored", () => {
		expect(getStoredPalette()).toBeNull();
	});

	it("clears storage when passed null", () => {
		storePalette(SAMPLE);
		storePalette(null);
		expect(getStoredPalette()).toBeNull();
	});

	it("rejects malformed stored values", () => {
		window.localStorage.setItem("theme-palette", "not json{");
		expect(getStoredPalette()).toBeNull();

		window.localStorage.setItem(
			"theme-palette",
			JSON.stringify({ id: "x", base: "purple", vars: {} }),
		);
		expect(getStoredPalette()).toBeNull();
	});
});

describe("applyPaletteVars", () => {
	it("sets overrides on <html> and clears them with null", () => {
		applyPaletteVars(SAMPLE.vars);
		const style = document.documentElement.style;
		expect(style.getPropertyValue("--background")).toBe("#000000");
		expect(style.getPropertyValue("--card")).toBe("#141417");

		applyPaletteVars(null);
		expect(style.getPropertyValue("--background")).toBe("");
		expect(style.getPropertyValue("--card")).toBe("");
	});

	it("clears vars from a previous palette when applying the next one", () => {
		applyPaletteVars({ "--sidebar": "#111111" });
		applyPaletteVars({ "--background": "#222222" });
		const style = document.documentElement.style;
		expect(style.getPropertyValue("--sidebar")).toBe("");
		expect(style.getPropertyValue("--background")).toBe("#222222");
	});
});

describe("buildCustomPalette", () => {
	it("keeps the editor inputs for round-tripping", () => {
		const input = { ...DEFAULT_CUSTOM_INPUT.dark, background: "#101014" };
		const palette = buildCustomPalette(input);
		expect(palette.id).toBe("custom");
		expect(palette.base).toBe("dark");
		expect(palette.custom).toEqual(input);
	});

	it("passes the chosen colors and radius through", () => {
		const palette = buildCustomPalette({
			base: "dark",
			background: "#0a0a0a",
			card: "#202024",
			primary: "#88c0d0",
			radius: 0.8,
		});
		expect(palette.vars["--background"]).toBe("#0a0a0a");
		expect(palette.vars["--card"]).toBe("#202024");
		expect(palette.vars["--primary"]).toBe("#88c0d0");
		expect(palette.vars["--radius"]).toBe("0.8rem");
	});

	it("picks a readable foreground for light and dark accents", () => {
		const lightAccent = buildCustomPalette({
			...DEFAULT_CUSTOM_INPUT.dark,
			primary: "#fafafa",
		});
		expect(lightAccent.vars["--primary-foreground"]).toBe("#1c1c1f");

		const darkAccent = buildCustomPalette({
			...DEFAULT_CUSTOM_INPUT.light,
			primary: "#1c1c1f",
		});
		expect(darkAccent.vars["--primary-foreground"]).toBe("#fbfbfb");
	});

	it("keeps white text on saturated mid-tone accents", () => {
		// #e5484d sits below the 0.28 luminance cutoff — white text, like Crimson.
		const palette = buildCustomPalette({
			...DEFAULT_CUSTOM_INPUT.dark,
			primary: "#e5484d",
		});
		expect(palette.vars["--primary-foreground"]).toBe("#fbfbfb");
	});

	it("mirrors the accent onto the sidebar", () => {
		const palette = buildCustomPalette({
			...DEFAULT_CUSTOM_INPUT.dark,
			primary: "#cba6f7",
		});
		expect(palette.vars["--sidebar-primary"]).toBe("#cba6f7");
		expect(palette.vars["--sidebar-primary-foreground"]).toBe(
			palette.vars["--primary-foreground"],
		);
	});
});

describe("buildSeedPalette", () => {
	it("keeps the seed input for round-tripping", () => {
		const input = { ...DEFAULT_SEED_INPUT.dark, seed: "#88c0d0" };
		const palette = buildSeedPalette(input);
		expect(palette.id).toBe("custom");
		expect(palette.base).toBe("dark");
		expect(palette.seed).toEqual(input);
		expect(palette.custom).toBeUndefined();
	});

	it("uses a readable mid-tone seed directly as the accent", () => {
		const dark = buildSeedPalette({
			...DEFAULT_SEED_INPUT.dark,
			seed: "#88c0d0",
		});
		expect(dark.vars["--primary"]).toBe("#88c0d0");

		const light = buildSeedPalette({
			...DEFAULT_SEED_INPUT.light,
			seed: "#33628a",
		});
		expect(light.vars["--primary"]).toBe("#33628a");
	});

	it("normalizes a seed that would not read against its base", () => {
		const tooDark = buildSeedPalette({
			...DEFAULT_SEED_INPUT.dark,
			seed: "#101040",
		});
		expect(tooDark.vars["--primary"]).not.toBe("#101040");

		const tooLight = buildSeedPalette({
			...DEFAULT_SEED_INPUT.light,
			seed: "#e0e8ff",
		});
		expect(tooLight.vars["--primary"]).not.toBe("#e0e8ff");
	});

	it("passes the radius through", () => {
		const palette = buildSeedPalette({
			...DEFAULT_SEED_INPUT.dark,
			radius: 0.8,
		});
		expect(palette.vars["--radius"]).toBe("0.8rem");
	});

	it("only uses variables the applier knows how to clear", () => {
		for (const base of ["light", "dark"] as const) {
			const palette = buildSeedPalette(DEFAULT_SEED_INPUT[base]);
			applyPaletteVars(palette.vars);
			applyPaletteVars(null);
			for (const name of Object.keys(palette.vars)) {
				expect(document.documentElement.style.getPropertyValue(name)).toBe("");
			}
		}
	});
});

describe("contrastRatio", () => {
	it("computes WCAG ratios", () => {
		expect(contrastRatio("#ffffff", "#000000")).toBeCloseTo(21, 0);
		expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 0);
		expect(contrastRatio("#808080", "#808080")).toBe(1);
	});

	it("accepts rgb() strings like resolveColor produces", () => {
		expect(contrastRatio("rgb(255, 255, 255)", "#000000")).toBeCloseTo(21, 0);
	});
});

describe("checkCustomContrast", () => {
	it("passes the default editor inputs", () => {
		expect(checkCustomContrast(DEFAULT_CUSTOM_INPUT.dark)).toEqual([]);
		expect(checkCustomContrast(DEFAULT_CUSTOM_INPUT.light)).toEqual([]);
	});

	it("flags a background too close to the base foreground", () => {
		const warnings = checkCustomContrast({
			...DEFAULT_CUSTOM_INPUT.dark,
			background: "#a0a0a0",
		});
		expect(warnings.map((w) => w.key)).toContain("fg_bg");
	});

	it("flags cards too close to the base foreground", () => {
		const warnings = checkCustomContrast({
			...DEFAULT_CUSTOM_INPUT.light,
			card: "#606060",
		});
		expect(warnings.map((w) => w.key)).toContain("fg_card");
	});

	it("flags an accent invisible against the background", () => {
		const warnings = checkCustomContrast({
			...DEFAULT_CUSTOM_INPUT.dark,
			primary: "#26262b",
		});
		expect(warnings.map((w) => w.key)).toContain("primary_bg");
	});

	it("reports the failing ratio", () => {
		const [warning] = checkCustomContrast({
			...DEFAULT_CUSTOM_INPUT.dark,
			background: "#e8e8ec",
		});
		expect(warning.key).toBe("fg_bg");
		expect(warning.ratio).toBeCloseTo(1, 1);
	});
});

describe("preview vars", () => {
	it("cover exactly the same variables as the committed build", () => {
		for (const base of ["light", "dark"] as const) {
			expect(
				Object.keys(previewSeedVars(DEFAULT_SEED_INPUT[base])).sort(),
			).toEqual(
				Object.keys(buildSeedPalette(DEFAULT_SEED_INPUT[base]).vars).sort(),
			);
			expect(
				Object.keys(previewCustomVars(DEFAULT_CUSTOM_INPUT[base])).sort(),
			).toEqual(
				Object.keys(buildCustomPalette(DEFAULT_CUSTOM_INPUT[base]).vars).sort(),
			);
		}
	});

	it("emit raw color-mix expressions for the CSS engine to resolve", () => {
		const vars = previewSeedVars(DEFAULT_SEED_INPUT.dark);
		expect(vars["--background"]).toStartWith("color-mix(in oklab,");
		expect(vars["--card"]).toStartWith("color-mix(in oklab,");
	});

	it("keep the accent parseable so the text color stays correct", () => {
		// A readable seed passes through as plain hex even on the preview path.
		const vars = previewSeedVars({
			...DEFAULT_SEED_INPUT.dark,
			seed: "#88c0d0",
		});
		expect(vars["--primary"]).toBe("#88c0d0");
		expect(["#1c1c1f", "#fbfbfb"]).toContain(vars["--primary-foreground"]);
	});
});

describe("form-control tokens", () => {
	// The base themes fill --input/--ring with solid neutrals, so a palette
	// that skips them leaves gray form fields over tinted surfaces.
	it("seed palettes cover input and ring on both bases", () => {
		for (const base of ["light", "dark"] as const) {
			const palette = buildSeedPalette(DEFAULT_SEED_INPUT[base]);
			expect(palette.vars["--input"]).toBeTruthy();
			expect(palette.vars["--ring"]).toBeTruthy();
		}
	});

	it("advanced palettes cover input and ring on both bases", () => {
		for (const base of ["light", "dark"] as const) {
			const palette = buildCustomPalette(DEFAULT_CUSTOM_INPUT[base]);
			expect(palette.vars["--input"]).toBeTruthy();
			expect(palette.vars["--ring"]).toBeTruthy();
		}
	});

	it("light palettes also cover the solid neutral borders", () => {
		const seed = buildSeedPalette(DEFAULT_SEED_INPUT.light);
		const custom = buildCustomPalette(DEFAULT_CUSTOM_INPUT.light);
		for (const palette of [seed, custom]) {
			expect(palette.vars["--border"]).toBeTruthy();
			expect(palette.vars["--card-border"]).toBeTruthy();
			expect(palette.vars["--sidebar-border"]).toBeTruthy();
		}
	});
});
