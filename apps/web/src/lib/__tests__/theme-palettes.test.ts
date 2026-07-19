import "@/test-utils/setup-dom";
import { afterEach, describe, expect, it } from "bun:test";
import {
	applyPaletteVars,
	buildCustomPalette,
	buildGradientPalette,
	buildSeedPalette,
	checkCustomContrast,
	contrastRatio,
	DEFAULT_CUSTOM_INPUT,
	DEFAULT_GRADIENT_INPUT,
	DEFAULT_SEED_INPUT,
	type GradientThemeInput,
	getStoredPalette,
	gradientInputFromSeed,
	PALETTE_VAR_NAMES,
	previewCustomVars,
	previewGradientVars,
	previewSeedVars,
	randomGradientInput,
	type StoredPalette,
	storePalette,
} from "../theme-palettes";

const SAMPLE: StoredPalette = {
	id: "oled",
	base: "dark",
	vars: { "--background": "#000000", "--card": "#141417" },
};

const ADAPTIVE_SURFACE_VAR_NAMES = [
	"--surface-card",
	"--surface-card-hover",
	"--surface-accent",
	"--surface-accent-hover",
	"--surface-hover",
	"--control",
] as const;

const GRADIENT_SIDEBAR_VAR_NAMES = [
	"--sidebar-accent",
	"--sidebar-ring",
] as const;

const ADAPTIVE_GRADIENT_VAR_NAMES = [
	...ADAPTIVE_SURFACE_VAR_NAMES,
	...GRADIENT_SIDEBAR_VAR_NAMES,
] as const;

const EXPECTED_ADAPTIVE_SURFACE_VARS = {
	"--surface-card": "color-mix(in oklab, var(--card) 64%, transparent)",
	"--surface-card-hover": "color-mix(in oklab, var(--card) 80%, transparent)",
	"--surface-accent":
		"color-mix(in oklab, var(--primary) 14%, color-mix(in oklab, var(--card) 64%, transparent))",
	"--surface-accent-hover":
		"color-mix(in oklab, var(--primary) 22%, color-mix(in oklab, var(--card) 80%, transparent))",
	"--surface-hover": "color-mix(in oklab, var(--card) 55%, transparent)",
	"--control": "color-mix(in oklab, var(--input) 74%, transparent)",
} as const;

const expectedGradientSidebarVars = (input: GradientThemeInput) => ({
	"--sidebar-accent": `color-mix(in oklab, var(--sidebar-foreground) ${input.base === "dark" ? 15 : 10}%, transparent)`,
	"--sidebar-ring": `color-mix(in oklab, ${input.stops[0].color} 55%, var(--sidebar-foreground))`,
});

afterEach(() => {
	storePalette(null);
	applyPaletteVars(null);
});

describe("storePalette / getStoredPalette", () => {
	it("round-trips a palette through localStorage", () => {
		storePalette(SAMPLE);
		expect(getStoredPalette()).toEqual(SAMPLE);
	});

	it("round-trips a normalized gradient recipe", () => {
		const palette = buildGradientPalette(DEFAULT_GRADIENT_INPUT.dark);
		storePalette(palette);
		expect(getStoredPalette()).toEqual(palette);
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

	it("repairs malformed gradient fields and recomputes stored gradient vars", () => {
		window.localStorage.setItem(
			"theme-palette",
			JSON.stringify({
				id: "custom",
				base: "light",
				vars: {
					"--background": "#000000",
					"--surface-card": "stored-should-not-win",
					"--control": "stored-should-not-win",
					"--sidebar-accent": "stored-should-not-win",
					"--sidebar-ring": "stored-should-not-win",
					"--unknown": "red",
				},
				gradient: {
					base: "dark",
					stops: [
						{ id: "same", color: "#ABC" },
						{ id: "same", color: "123456" },
						{ id: "bad", color: "tomato" },
					],
					angle: -90,
					intensity: 140,
					radius: 9,
				},
			}),
		);

		const palette = getStoredPalette();
		expect(palette?.version).toBe(2);
		expect(palette?.gradient).toEqual({
			base: "light",
			stops: [
				{ id: "same", color: "#aabbcc" },
				{ id: "same-2", color: "#123456" },
			],
			angle: 270,
			intensity: 100,
			radius: 1.2,
		});
		expect(Object.keys(palette?.vars ?? {}).sort()).toEqual(
			[...ADAPTIVE_GRADIENT_VAR_NAMES, "--radius", "--theme-gradient"].sort(),
		);
		expect(palette?.vars).toMatchObject({
			...EXPECTED_ADAPTIVE_SURFACE_VARS,
			"--sidebar-accent":
				"color-mix(in oklab, var(--sidebar-foreground) 10%, transparent)",
			"--sidebar-ring":
				"color-mix(in oklab, #aabbcc 55%, var(--sidebar-foreground))",
		});
	});

	it("whitelists variables while preserving legacy palettes", () => {
		window.localStorage.setItem(
			"theme-palette",
			JSON.stringify({
				id: "legacy",
				base: "dark",
				vars: {
					"--background": "#101014",
					"--unknown": "url(never-applied)",
					"--card": 42,
				},
			}),
		);

		expect(getStoredPalette()).toEqual({
			id: "legacy",
			base: "dark",
			vars: { "--background": "#101014" },
		});
	});

	it("normalizes incomplete legacy editor recipes", () => {
		window.localStorage.setItem(
			"theme-palette",
			JSON.stringify({
				id: "legacy",
				base: "light",
				vars: {},
				custom: { background: "#ABC", radius: 99 },
				seed: {},
			}),
		);

		const palette = getStoredPalette();
		expect(palette?.custom).toEqual({
			...DEFAULT_CUSTOM_INPUT.light,
			background: "#aabbcc",
			radius: 1.2,
		});
		expect(palette?.seed).toEqual(DEFAULT_SEED_INPUT.light);
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

	it("applies and clears gradients while ignoring unknown variables", () => {
		applyPaletteVars({
			"--theme-gradient": "linear-gradient(red, blue)",
			"--not-a-theme-token": "red",
		});
		const style = document.documentElement.style;
		expect(style.getPropertyValue("--theme-gradient")).toBe(
			"linear-gradient(red, blue)",
		);
		expect(style.getPropertyValue("--not-a-theme-token")).toBe("");

		applyPaletteVars({ "--background": "#222222" });
		expect(style.getPropertyValue("--theme-gradient")).toBe("");
	});

	it("applies and clears every variable emitted by every palette builder", () => {
		const style = document.documentElement.style;
		for (const base of ["light", "dark"] as const) {
			const palettes = [
				buildSeedPalette(DEFAULT_SEED_INPUT[base]),
				buildGradientPalette(DEFAULT_GRADIENT_INPUT[base]),
				buildCustomPalette(DEFAULT_CUSTOM_INPUT[base]),
			];
			for (const palette of palettes) {
				applyPaletteVars(palette.vars);
				for (const name of Object.keys(palette.vars)) {
					expect(PALETTE_VAR_NAMES).toContain(name);
					expect(style.getPropertyValue(name)).not.toBe("");
				}

				applyPaletteVars(null);
				for (const name of Object.keys(palette.vars)) {
					expect(style.getPropertyValue(name)).toBe("");
				}
			}
		}
	});

	it("clears gradient surface aliases when applying a seed palette", () => {
		const style = document.documentElement.style;
		for (const base of ["light", "dark"] as const) {
			applyPaletteVars(buildGradientPalette(DEFAULT_GRADIENT_INPUT[base]).vars);
			for (const name of ADAPTIVE_SURFACE_VAR_NAMES) {
				expect(style.getPropertyValue(name)).not.toBe("");
			}

			applyPaletteVars(buildSeedPalette(DEFAULT_SEED_INPUT[base]).vars);
			for (const name of ADAPTIVE_SURFACE_VAR_NAMES) {
				expect(style.getPropertyValue(name)).toBe("");
			}
		}
	});
});

describe("buildCustomPalette", () => {
	it("keeps the editor inputs for round-tripping", () => {
		const input = { ...DEFAULT_CUSTOM_INPUT.dark, background: "#101014" };
		const palette = buildCustomPalette(input);
		expect(palette.id).toBe("custom");
		expect(palette.base).toBe("dark");
		expect(palette.version).toBe(2);
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
		expect(palette.version).toBe(2);
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

describe("gradient palettes", () => {
	const inputWithStops = (count: number): GradientThemeInput => ({
		...DEFAULT_GRADIENT_INPUT.dark,
		stops: ["#ff0000", "#00ff00", "#0000ff", "#ffff00", "#ff00ff"]
			.slice(0, count)
			.map((color, index) => ({ id: `stop-${index + 1}`, color })),
		angle: 45,
		intensity: 10,
	});

	it("supports one, three, and five normalized stops", () => {
		for (const count of [1, 3, 5]) {
			const palette = buildGradientPalette(inputWithStops(count));
			expect(palette.gradient?.stops).toHaveLength(count);
			expect(Object.keys(palette.vars).sort()).toEqual(
				[...ADAPTIVE_GRADIENT_VAR_NAMES, "--radius", "--theme-gradient"].sort(),
			);
			expect(palette.vars["--theme-gradient"]).toStartWith(
				"linear-gradient(45deg in oklab,",
			);
		}
	});

	it("places gradient stops evenly from edge to edge", () => {
		const one = buildGradientPalette(inputWithStops(1)).vars[
			"--theme-gradient"
		];
		expect(one).toContain("#ff0000 7.59%, transparent) 0%");
		expect(one).toContain("#ff0000 7.59%, transparent) 100%");

		const three = buildGradientPalette(inputWithStops(3)).vars[
			"--theme-gradient"
		];
		for (const position of [0, 50, 100]) {
			expect(three).toContain(`transparent) ${position}%`);
		}

		const five = buildGradientPalette(inputWithStops(5)).vars[
			"--theme-gradient"
		];
		for (const position of [0, 25, 50, 75, 100]) {
			expect(five).toContain(`transparent) ${position}%`);
		}
	});

	it("normalizes colors, angle, intensity, radius, and stop count", () => {
		const palette = buildGradientPalette({
			base: "dark",
			stops: [
				{ id: "a", color: "#ABC" },
				{ id: "b", color: "123456" },
				{ id: "c", color: "#654321" },
				{ id: "d", color: "#abcdef" },
				{ id: "e", color: "#fedcba" },
				{ id: "f", color: "#010203" },
			],
			angle: 721,
			intensity: 120,
			radius: -1,
		});

		expect(palette.gradient).toMatchObject({
			angle: 1,
			intensity: 100,
			radius: 0,
		});
		expect(palette.gradient?.stops).toHaveLength(5);
		expect(palette.gradient?.stops[0].color).toBe("#aabbcc");
		expect(palette.gradient?.stops[1].color).toBe("#123456");
	});

	it("emits all adaptive aliases for positive intensity on both bases", () => {
		for (const base of ["light", "dark"] as const) {
			const input = DEFAULT_GRADIENT_INPUT[base];
			const palette = buildGradientPalette(input);
			expect(palette.vars).toMatchObject({
				...EXPECTED_ADAPTIVE_SURFACE_VARS,
				...expectedGradientSidebarVars(input),
			});
		}
	});

	it("uses root surface fallbacks at zero intensity on both bases", () => {
		for (const base of ["light", "dark"] as const) {
			const input = { ...DEFAULT_GRADIENT_INPUT[base], intensity: 0 };
			const palette = buildGradientPalette(input);
			expect(palette.vars).toEqual({
				"--theme-gradient": "none",
				"--radius": `${input.radius}rem`,
			});
			for (const name of ADAPTIVE_GRADIENT_VAR_NAMES) {
				expect(palette.vars[name]).toBeUndefined();
			}
		}
	});

	it("maps the full intensity control to a contrast-safe overlay alpha", () => {
		const low = buildGradientPalette({
			...DEFAULT_GRADIENT_INPUT.dark,
			intensity: 6,
		}).vars["--theme-gradient"];
		const maximum = buildGradientPalette({
			...DEFAULT_GRADIENT_INPUT.dark,
			intensity: 100,
		}).vars["--theme-gradient"];

		expect(low).toContain(" 5.88%, transparent)");
		expect(maximum).toContain(" 24%, transparent)");
		expect(maximum).not.toContain(" 100%, transparent)");
	});

	it("migrates seed recipes without losing base, seed, or radius", () => {
		const gradient = gradientInputFromSeed({
			base: "dark",
			seed: "#88C0D0",
			radius: 0.8,
		});
		expect(gradient.base).toBe("dark");
		expect(gradient.radius).toBe(0.8);
		expect(gradient.stops).toHaveLength(3);
		expect(gradient.stops[1].color).toBe("#88c0d0");
	});

	it("generates deterministic, conservative harmonies with an injected rng", () => {
		const deterministicRng = () => {
			const values = [0.9, 0.25, 0.4, 0.75, 0.5];
			let index = 0;
			return () => values[index++ % values.length];
		};
		const source = { ...DEFAULT_GRADIENT_INPUT.dark, radius: 0.8 };
		const first = randomGradientInput(source, deterministicRng());
		const second = randomGradientInput(source, deterministicRng());

		expect(first).toEqual(second);
		expect(first.base).toBe("dark");
		expect(first.radius).toBe(0.8);
		expect(first.stops).toHaveLength(4);
		expect(first.angle).toBe(270);
		expect(first.intensity).toBeGreaterThanOrEqual(8);
		expect(first.intensity).toBeLessThanOrEqual(16);
		for (const stop of first.stops) {
			expect(stop.color).toMatch(/^#[\da-f]{6}$/);
		}
	});

	it("keeps preview and committed gradient variables in parity", () => {
		for (const base of ["light", "dark"] as const) {
			const input = DEFAULT_GRADIENT_INPUT[base];
			expect(previewGradientVars(input)).toEqual(
				buildGradientPalette(input).vars,
			);
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

	it("dark palettes also cover borders instead of inheriting fixed neutrals", () => {
		const seed = buildSeedPalette(DEFAULT_SEED_INPUT.dark);
		const custom = buildCustomPalette(DEFAULT_CUSTOM_INPUT.dark);
		for (const palette of [seed, custom]) {
			expect(palette.vars["--border"]).toBeTruthy();
			expect(palette.vars["--card-border"]).toBeTruthy();
			expect(palette.vars["--sidebar-border"]).toBeTruthy();
		}
	});
});

describe("theme-dependent decorative tokens", () => {
	it("derives chart colors and the sidebar ring for every palette mode", () => {
		for (const base of ["light", "dark"] as const) {
			for (const palette of [
				buildSeedPalette(DEFAULT_SEED_INPUT[base]),
				buildCustomPalette(DEFAULT_CUSTOM_INPUT[base]),
			]) {
				for (let index = 1; index <= 5; index += 1) {
					expect(palette.vars[`--chart-${index}`]).toBeTruthy();
				}
				expect(palette.vars["--sidebar-ring"]).toBe(palette.vars["--ring"]);
			}
		}
	});
});
