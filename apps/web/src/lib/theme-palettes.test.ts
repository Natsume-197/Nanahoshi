import { expect, test } from "bun:test";
import {
	contrastRatio,
	DEFAULT_CUSTOM_INPUT,
	DEFAULT_GRADIENT_INPUT,
	previewCustomVars,
	previewGradientVars,
	previewSeedVars,
	randomGradientInput,
} from "./theme-palettes";

test("custom surfaces follow the chosen card and input colors", () => {
	const vars = previewCustomVars({
		...DEFAULT_CUSTOM_INPUT.light,
		card: "#e0f2fe",
	});
	expect(vars["--surface-card"]).toBe("var(--card)");
	expect(vars["--control"]).toBe("var(--input)");
});

test("random gradients explore lightness and saturation as well as hue", () => {
	const samples = [0.05, 0.5, 0.95].map((value) =>
		randomGradientInput(DEFAULT_GRADIENT_INPUT.dark, () => value),
	);
	const lightness = samples.flatMap((input) =>
		input.stops.map(({ color }) => {
			const rgb = [1, 3, 5].map((i) =>
				Number.parseInt(color.slice(i, i + 2), 16),
			);
			return (Math.max(...rgb) + Math.min(...rgb)) / 510;
		}),
	);
	expect(Math.max(...lightness) - Math.min(...lightness)).toBeGreaterThan(0.15);
	expect(Math.max(...samples.map((input) => input.intensity))).toBeGreaterThan(
		35,
	);
});

test("accent button text remains readable for saturated colors", () => {
	for (const primary of ["#ef4444", "#e87900", "#888888", "#22c55e"]) {
		const vars = previewCustomVars({ ...DEFAULT_CUSTOM_INPUT.dark, primary });
		expect(
			contrastRatio(primary, vars["--primary-foreground"]),
		).toBeGreaterThanOrEqual(4.5);
	}
});

test("seed and gradient accents stay parseable and readable at color extremes", () => {
	for (const base of ["dark", "light"] as const) {
		for (const seed of [
			"#000000",
			"#ffffff",
			"#ff0000",
			"#00ff00",
			"#0000ff",
		]) {
			const vars = previewSeedVars({ base, seed });
			expect(vars["--primary"]).toMatch(/^#[0-9a-f]{6}$/i);
			expect(
				contrastRatio(vars["--primary"], vars["--primary-foreground"]),
			).toBeGreaterThanOrEqual(4.5);
			expect(vars["--surface-card"]).toBe("var(--card)");
			const gradient = previewGradientVars({
				...DEFAULT_GRADIENT_INPUT[base],
				stops: [{ id: "one", color: seed }],
			});
			expect(
				contrastRatio(gradient["--primary"], gradient["--primary-foreground"]),
			).toBeGreaterThanOrEqual(4.5);
		}
	}
});

test("gradient colors reach detached menus, controls and sidebar surfaces", () => {
	for (const base of ["dark", "light"] as const) {
		const recipe = DEFAULT_GRADIENT_INPUT[base];
		const first = previewGradientVars(recipe);
		const second = previewGradientVars({
			...recipe,
			stops: [{ id: "green", color: "#22c55e" }],
		});
		for (const name of [
			"--popover",
			"--sidebar",
			"--accent",
			"--muted",
			"--input",
		]) {
			expect(first[name]).toBeDefined();
			expect(second[name]).not.toBe(first[name]);
		}
	}
});
