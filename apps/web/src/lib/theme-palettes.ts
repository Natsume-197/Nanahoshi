// Theme palettes: the custom-theme editor (seed and advanced modes) resolves
// to a map of CSS variable overrides applied inline on <html> over the
// light/dark base class. Values are stored pre-resolved
// (hex/rgb strings) in localStorage so the boot script in __root.tsx can
// re-apply them before first paint without any color math.

export type PaletteBase = "light" | "dark";

export interface StoredPalette {
	id: string;
	base: PaletteBase;
	vars: Record<string, string>;
	/** Editor inputs, kept for round-tripping the custom editor. */
	custom?: CustomThemeInput;
	/** Seed-mode editor input, kept for round-tripping. */
	seed?: SeedThemeInput;
}

export interface CustomThemeInput {
	base: PaletteBase;
	/** Hex colors (editor uses native color inputs). */
	background: string;
	card: string;
	primary: string;
	/** Corner radius in rem. */
	radius: number;
}

export interface SeedThemeInput {
	base: PaletteBase;
	/** Single hex color the whole palette is derived from. */
	seed: string;
	/** Corner radius in rem. */
	radius: number;
}

const STORAGE_KEY = "theme-palette";

// Every variable a palette may override; cleared before applying a new one so
// switching palettes never leaves stale overrides behind.
const PALETTE_VAR_NAMES = [
	"--background",
	"--foreground",
	"--reading",
	"--card",
	"--card-border",
	"--card-foreground",
	"--popover",
	"--popover-foreground",
	"--primary",
	"--primary-foreground",
	"--secondary",
	"--secondary-foreground",
	"--muted",
	"--muted-foreground",
	"--accent",
	"--accent-foreground",
	"--border",
	"--input",
	"--ring",
	"--radius",
	"--sidebar",
	"--sidebar-foreground",
	"--sidebar-primary",
	"--sidebar-primary-foreground",
	"--sidebar-accent",
	"--sidebar-accent-foreground",
	"--sidebar-border",
];

export const DEFAULT_CUSTOM_INPUT: Record<PaletteBase, CustomThemeInput> = {
	dark: {
		base: "dark",
		background: "#1a1a1e",
		card: "#38383d",
		primary: "#fafafa",
		radius: 0.45,
	},
	light: {
		base: "light",
		background: "#f7f7f7",
		card: "#ffffff",
		primary: "#1c1c1f",
		radius: 0.45,
	},
};

export function getStoredPalette(): StoredPalette | null {
	if (typeof window === "undefined") return null;
	try {
		const raw = window.localStorage.getItem(STORAGE_KEY);
		if (!raw) return null;
		const parsed = JSON.parse(raw) as StoredPalette;
		if (
			!parsed ||
			(parsed.base !== "light" && parsed.base !== "dark") ||
			typeof parsed.vars !== "object"
		) {
			return null;
		}
		return parsed;
	} catch {
		return null;
	}
}

export function storePalette(palette: StoredPalette | null) {
	if (typeof window === "undefined") return;
	try {
		if (palette === null) window.localStorage.removeItem(STORAGE_KEY);
		else window.localStorage.setItem(STORAGE_KEY, JSON.stringify(palette));
	} catch {
		// Storage full/blocked — the palette still applies for this session.
	}
}

/** Apply (or clear, with null) palette variable overrides on <html>. */
export function applyPaletteVars(vars: Record<string, string> | null) {
	const style = document.documentElement.style;
	for (const name of PALETTE_VAR_NAMES) {
		style.removeProperty(name);
	}
	if (vars) {
		for (const [name, value] of Object.entries(vars)) {
			style.setProperty(name, value);
		}
	}
}

// Browsers won't hand back a computed color without an element to resolve it
// on; this resolves color-mix() expressions to plain rgb() for storage. The
// probe element is created once and kept attached — live preview resolves the
// accent on every frame, so per-call append/remove would be wasted churn.
let colorProbe: HTMLDivElement | null = null;
function resolveColor(color: string): string {
	if (!colorProbe?.isConnected) {
		colorProbe = document.createElement("div");
		colorProbe.style.display = "none";
		document.body.appendChild(colorProbe);
	}
	colorProbe.style.backgroundColor = "";
	colorProbe.style.backgroundColor = color;
	const resolved = window.getComputedStyle(colorProbe).backgroundColor;
	return resolved || color;
}

type MixFn = (a: string, pct: number, b: string) => string;

// Raw expression the CSS engine resolves natively — the fast path for live
// preview: zero DOM probes per variable.
const mixExpression: MixFn = (a, pct, b) =>
	`color-mix(in oklab, ${a} ${pct}%, ${b})`;

// Probe-resolved to a plain rgb() string — the storage path, so the boot
// script can re-apply values without any color math.
const mixResolved: MixFn = (a, pct, b) =>
	resolveColor(mixExpression(a, pct, b));

function parseRgbChannels(color: string): [number, number, number] | null {
	const trimmed = color.trim();
	const hex = /^#?([0-9a-f]{6})$/i.exec(trimmed);
	if (hex) {
		const int = Number.parseInt(hex[1], 16);
		return [(int >> 16) & 0xff, (int >> 8) & 0xff, int & 0xff];
	}
	const rgb = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/i.exec(trimmed);
	if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];
	return null;
}

function relativeLuminance(color: string): number {
	const channels = parseRgbChannels(color);
	if (!channels) return 0;
	const channel = (value: number) => {
		const srgb = value / 255;
		return srgb <= 0.04045 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
	};
	const [r, g, b] = channels;
	return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** WCAG contrast ratio between two colors (hex or rgb() strings). */
export function contrastRatio(a: string, b: string): number {
	const la = relativeLuminance(a);
	const lb = relativeLuminance(b);
	const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
	return (hi + 0.05) / (lo + 0.05);
}

// The 0.28 cutoff keeps white text on saturated accents (reds/oranges read
// better with it despite the WCAG formula) while never letting the white-text
// pair drop below ~3.2:1; above it, dark text always clears 4.5:1.
function primaryForegroundFor(primary: string): string {
	return relativeLuminance(primary) > 0.28 ? "#1c1c1f" : "#fbfbfb";
}

// Approximations of the base themes' --foreground (which is oklch in CSS) for
// contrast checks against editor-picked surfaces.
const BASE_FOREGROUND: Record<PaletteBase, string> = {
	dark: "#e8e8ec",
	light: "#1c1c1f",
};

export interface ContrastWarning {
	key: "fg_bg" | "fg_card" | "primary_bg";
	ratio: number;
}

/** Flag editor color combinations that would produce hard-to-read UI. */
export function checkCustomContrast(
	input: CustomThemeInput,
): ContrastWarning[] {
	const foreground = BASE_FOREGROUND[input.base];
	const warnings: ContrastWarning[] = [];
	const fgBg = contrastRatio(foreground, input.background);
	if (fgBg < 4.5) warnings.push({ key: "fg_bg", ratio: fgBg });
	const fgCard = contrastRatio(foreground, input.card);
	if (fgCard < 4.5) warnings.push({ key: "fg_card", ratio: fgCard });
	// 3:1 is the WCAG bar for non-text UI, which is what the accent mostly paints.
	const primaryBg = contrastRatio(input.primary, input.background);
	if (primaryBg < 3) warnings.push({ key: "primary_bg", ratio: primaryBg });
	return warnings;
}

/**
 * Derive a full palette from the editor's four inputs. Surface steps
 * (popover/secondary/muted/sidebar) are mixed from the chosen background and
 * card, and so are the form-control tokens (input/border/ring) — the base
 * themes fill those with solid neutrals, so left alone they'd stay gray over
 * tinted surfaces. Foregrounds stay on the base theme's values, which are
 * alpha-based and hold up over any reasonable surface.
 */
function customPaletteVars(
	input: CustomThemeInput,
	mix: MixFn,
): Record<string, string> {
	const { base, background, card, primary, radius } = input;
	const primaryForeground = primaryForegroundFor(primary);

	const vars: Record<string, string> =
		base === "dark"
			? {
					"--background": background,
					"--card": card,
					"--popover": mix(card, 82, "black"),
					"--secondary": mix(card, 90, "black"),
					"--accent": mix(card, 90, "black"),
					"--muted": mix(card, 75, "black"),
					"--input": mix(background, 88, "black"),
					"--ring": mix(primary, 80, "black"),
					"--sidebar": mix(background, 70, "black"),
					"--sidebar-accent": mix(card, 90, "black"),
				}
			: {
					"--background": background,
					"--card": card,
					"--popover": card,
					"--secondary": mix(background, 99, "black"),
					"--accent": mix(background, 96, "black"),
					"--muted": mix(background, 99, "black"),
					"--border": mix(background, 92, "black"),
					"--input": mix(background, 92, "black"),
					"--card-border": mix(background, 90, "black"),
					"--ring": mix(primary, 50, "white"),
					"--sidebar": mix(background, 97, "black"),
					"--sidebar-accent": mix(background, 95, "black"),
					"--sidebar-border": mix(background, 92, "black"),
				};

	vars["--primary"] = primary;
	vars["--primary-foreground"] = primaryForeground;
	vars["--sidebar-primary"] = primary;
	vars["--sidebar-primary-foreground"] = primaryForeground;
	vars["--radius"] = `${radius}rem`;

	return vars;
}

export function buildCustomPalette(input: CustomThemeInput): StoredPalette {
	return {
		id: "custom",
		base: input.base,
		vars: customPaletteVars(input, mixResolved),
		custom: input,
	};
}

/** Unresolved (color-mix expression) vars for live preview while editing. */
export function previewCustomVars(
	input: CustomThemeInput,
): Record<string, string> {
	return customPaletteVars(input, mixExpression);
}

export const DEFAULT_SEED_INPUT: Record<PaletteBase, SeedThemeInput> = {
	dark: { base: "dark", seed: "#8f9fd8", radius: 0.45 },
	light: { base: "light", seed: "#33628a", radius: 0.45 },
};

// Neutral background anchors the seed tint is mixed into (auto mode).
const SEED_BACKGROUND_ANCHOR: Record<PaletteBase, string> = {
	dark: "#101014",
	light: "#f7f6f3",
};

// A seed outside the readable luminance range gets lightened/darkened before
// being used as the accent, so it always reads against its base.
function normalizeSeedAccent(
	seed: string,
	base: PaletteBase,
	mix: (a: string, pct: number, b: string) => string,
): string {
	const lum = relativeLuminance(seed);
	if (base === "dark") {
		if (lum < 0.06) return mix(seed, 40, "#f5f5f7");
		if (lum < 0.2) return mix(seed, 70, "#f5f5f7");
	} else {
		if (lum > 0.55) return mix(seed, 45, "#26262b");
		if (lum > 0.32) return mix(seed, 72, "#26262b");
	}
	return seed;
}

/**
 * Derive a full palette from a single seed color. Every surface is a neutral
 * anchor (taken from the default themes' ladders) with a small percentage of
 * the seed mixed in, including the form-control tokens (input/border/ring),
 * which the base themes fill with solid neutrals. The accent is the seed
 * itself, lightened/darkened when it wouldn't read against the derived
 * background. Mixes happen in oklab: oklch or sRGB mixes turn tinted
 * neutrals muddy.
 */
function seedPaletteVars(
	input: SeedThemeInput,
	mix: MixFn,
): Record<string, string> {
	const { base, seed, radius } = input;
	// The accent is always probe-resolved, even on the preview path:
	// primaryForegroundFor needs a parseable color to pick the text color.
	const primary = normalizeSeedAccent(seed, base, mixResolved);
	const primaryForeground = primaryForegroundFor(primary);

	const vars: Record<string, string> =
		base === "dark"
			? {
					"--background": mix(seed, 12, SEED_BACKGROUND_ANCHOR.dark),
					"--foreground": mix(seed, 8, "#ececf0"),
					"--reading": mix(seed, 6, "#e2e2e8"),
					"--card": mix(seed, 14, "#1d2026"),
					"--card-foreground": mix(seed, 8, "#f1f1f4"),
					"--popover": mix(seed, 12, "#16181d"),
					"--popover-foreground": mix(seed, 8, "#f1f1f4"),
					"--secondary": mix(seed, 15, "#262a31"),
					"--secondary-foreground": mix(seed, 8, "#f1f1f4"),
					"--muted": mix(seed, 12, "#16181d"),
					"--muted-foreground": mix(seed, 12, "#9ca1ac"),
					"--accent": mix(seed, 16, "#2c3038"),
					"--accent-foreground": mix(seed, 6, "#f4f4f7"),
					"--input": mix(seed, 12, "#0d0d11"),
					"--ring": mix(primary, 80, "black"),
					"--sidebar": mix(seed, 10, "#08090c"),
					"--sidebar-foreground": mix(seed, 8, "#f1f1f4"),
					"--sidebar-accent": mix(seed, 14, "#1d2026"),
					"--sidebar-accent-foreground": mix(seed, 6, "#f4f4f7"),
				}
			: {
					"--background": mix(seed, 10, SEED_BACKGROUND_ANCHOR.light),
					"--foreground": mix(seed, 30, "#37343c"),
					"--reading": mix(seed, 24, "#403d45"),
					"--card": mix(seed, 3, "#ffffff"),
					"--card-foreground": mix(seed, 30, "#332f38"),
					"--card-border": mix(seed, 14, "#e5e2dc"),
					"--popover": mix(seed, 3, "#ffffff"),
					"--popover-foreground": mix(seed, 30, "#332f38"),
					"--secondary": mix(seed, 12, "#efede9"),
					"--secondary-foreground": mix(seed, 30, "#37343c"),
					"--muted": mix(seed, 12, "#efede9"),
					"--muted-foreground": mix(seed, 28, "#75717c"),
					"--accent": mix(seed, 16, "#eae7e1"),
					"--accent-foreground": mix(seed, 30, "#37343c"),
					"--border": mix(seed, 14, "#e4e1db"),
					"--input": mix(seed, 14, "#e4e1db"),
					"--ring": mix(primary, 50, "white"),
					"--sidebar": mix(seed, 12, "#efece7"),
					"--sidebar-foreground": mix(seed, 30, "#332f38"),
					"--sidebar-accent": mix(seed, 16, "#e7e3dd"),
					"--sidebar-accent-foreground": mix(seed, 30, "#332f38"),
					"--sidebar-border": mix(seed, 14, "#e4e1db"),
				};

	vars["--primary"] = primary;
	vars["--primary-foreground"] = primaryForeground;
	vars["--sidebar-primary"] = primary;
	vars["--sidebar-primary-foreground"] = primaryForeground;
	vars["--radius"] = `${radius}rem`;

	return vars;
}

export function buildSeedPalette(input: SeedThemeInput): StoredPalette {
	return {
		id: "custom",
		base: input.base,
		vars: seedPaletteVars(input, mixResolved),
		seed: input,
	};
}

/** Unresolved (color-mix expression) vars for live preview while editing. */
export function previewSeedVars(input: SeedThemeInput): Record<string, string> {
	return seedPaletteVars(input, mixExpression);
}
