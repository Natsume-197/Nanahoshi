// Theme palettes resolve the custom editor's gradient, legacy seed, and
// advanced recipes to CSS variable overrides applied inline on <html> over the
// light/dark base class. The resolved variables are persisted beside the
// editor recipe so the boot script in __root.tsx can restore them before the
// first paint without rebuilding the palette.

export type PaletteBase = "light" | "dark";

export interface GradientStop {
	id: string;
	color: string;
}

export interface GradientThemeInput {
	base: PaletteBase;
	stops: GradientStop[];
	/** Gradient direction in degrees. */
	angle: number;
	/** Perceptual color strength from 0 to 100. */
	intensity: number;
}

export interface StoredPalette {
	id: string;
	base: PaletteBase;
	vars: Record<string, string>;
	/** Versioned editor recipe. Missing means a legacy palette. */
	version?: 2;
	/** Editor inputs, kept for round-tripping the custom editor. */
	custom?: CustomThemeInput;
	/** Seed-mode editor input, kept for round-tripping. */
	seed?: SeedThemeInput;
	/** Ambient-gradient editor input, kept for round-tripping. */
	gradient?: GradientThemeInput;
}

export interface CustomThemeInput {
	base: PaletteBase;
	/** Hex colors (editor uses native color inputs). */
	background: string;
	card: string;
	primary: string;
}

export interface SeedThemeInput {
	base: PaletteBase;
	/** Single hex color the whole palette is derived from. */
	seed: string;
}

const STORAGE_KEY = "theme-palette";

// Every variable a palette may override; cleared before applying a new one so
// switching palettes never leaves stale overrides behind.
export const PALETTE_VAR_NAMES = [
	"--theme-gradient",
	"--surface-card",
	"--surface-card-hover",
	"--surface-accent",
	"--surface-accent-hover",
	"--surface-hover",
	"--control",
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
	"--chart-1",
	"--chart-2",
	"--chart-3",
	"--chart-4",
	"--chart-5",
	"--border",
	"--input",
	"--ring",
	"--sidebar",
	"--sidebar-foreground",
	"--sidebar-primary",
	"--sidebar-primary-foreground",
	"--sidebar-accent",
	"--sidebar-accent-foreground",
	"--sidebar-border",
	"--sidebar-ring",
];

const PALETTE_VAR_NAME_SET = new Set(PALETTE_VAR_NAMES);

export const DEFAULT_CUSTOM_INPUT: Record<PaletteBase, CustomThemeInput> = {
	dark: {
		base: "dark",
		background: "#191919",
		card: "#262626",
		primary: "#fafafa",
	},
	light: {
		base: "light",
		background: "#ffffff",
		card: "#ffffff",
		primary: "#1d1d1f",
	},
};

export const DEFAULT_GRADIENT_INPUT: Record<PaletteBase, GradientThemeInput> = {
	dark: {
		base: "dark",
		stops: [
			{ id: "violet", color: "#8b5cf6" },
			{ id: "cyan", color: "#22d3ee" },
			{ id: "rose", color: "#f472b6" },
		],
		angle: 135,
		intensity: 12,
	},
	light: {
		base: "light",
		stops: [
			{ id: "amber", color: "#f59e0b" },
			{ id: "cyan", color: "#67e8f9" },
			{ id: "violet", color: "#a78bfa" },
		],
		angle: 110,
		intensity: 9,
	},
};

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sanitizePaletteVars(value: unknown): Record<string, string> | null {
	if (!isRecord(value)) return null;
	const vars: Record<string, string> = {};
	for (const name of PALETTE_VAR_NAMES) {
		if (typeof value[name] === "string") vars[name] = value[name];
	}
	return vars;
}

function normalizeCustomInput(
	value: Record<string, unknown>,
	base: PaletteBase,
): CustomThemeInput {
	const fallback = DEFAULT_CUSTOM_INPUT[base];
	return {
		base,
		background: normalizeHex(value.background) ?? fallback.background,
		card: normalizeHex(value.card) ?? fallback.card,
		primary: normalizeHex(value.primary) ?? fallback.primary,
	};
}

function normalizeSeedInput(
	value: Record<string, unknown>,
	base: PaletteBase,
): SeedThemeInput {
	const fallback = DEFAULT_SEED_INPUT[base];
	return {
		base,
		seed: normalizeHex(value.seed) ?? fallback.seed,
	};
}

export function getStoredPalette(): StoredPalette | null {
	if (typeof window === "undefined") return null;
	try {
		const raw = window.localStorage.getItem(STORAGE_KEY);
		if (!raw) return null;
		const parsed = JSON.parse(raw) as unknown;
		if (
			!isRecord(parsed) ||
			typeof parsed.id !== "string" ||
			(parsed.base !== "light" && parsed.base !== "dark") ||
			(parsed.version !== undefined && parsed.version !== 2)
		) {
			return null;
		}

		const vars = sanitizePaletteVars(parsed.vars);
		if (!vars) return null;

		const palette: StoredPalette = {
			id: parsed.id,
			base: parsed.base,
			vars,
		};
		if (parsed.version === 2) palette.version = 2;
		if (parsed.custom !== undefined) {
			if (!isRecord(parsed.custom)) return null;
			palette.custom = normalizeCustomInput(parsed.custom, parsed.base);
		}
		if (parsed.seed !== undefined) {
			if (!isRecord(parsed.seed)) return null;
			palette.seed = normalizeSeedInput(parsed.seed, parsed.base);
		}
		if (parsed.gradient !== undefined) {
			if (!isRecord(parsed.gradient)) return null;
			const gradient = normalizeGradientInput(parsed.gradient, parsed.base);
			palette.version = 2;
			palette.gradient = gradient;
			palette.vars = gradientPaletteVars(gradient);
		}
		return palette;
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
			if (PALETTE_VAR_NAME_SET.has(name) && typeof value === "string") {
				style.setProperty(name, value);
			}
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
	dark: "#ededed",
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
	const { base, background, card, primary } = input;
	const primaryForeground = primaryForegroundFor(primary);

	const vars: Record<string, string> =
		base === "dark"
			? {
					"--background": background,
					"--card": card,
					"--card-border": mix(card, 88, "white"),
					"--popover": mix(card, 82, "black"),
					"--secondary": mix(card, 90, "black"),
					"--accent": mix(card, 90, "black"),
					"--muted": mix(card, 75, "black"),
					"--border": mix(background, 88, "white"),
					"--input": mix(background, 88, "black"),
					"--ring": mix(primary, 80, "black"),
					"--sidebar": mix(background, 70, "black"),
					"--sidebar-accent": mix(card, 90, "black"),
					"--sidebar-border": mix(background, 90, "white"),
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
	vars["--sidebar-ring"] = vars["--ring"];
	vars["--chart-1"] = primary;
	vars["--chart-2"] = mix(primary, 80, background);
	vars["--chart-3"] = mix(primary, 60, background);
	vars["--chart-4"] = mix(primary, 40, background);
	vars["--chart-5"] = mix(primary, 20, background);

	return vars;
}

export function buildCustomPalette(input: CustomThemeInput): StoredPalette {
	return {
		id: "custom",
		base: input.base,
		version: 2,
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
	dark: { base: "dark", seed: "#f0f0f0" },
	light: { base: "light", seed: "#33628a" },
};

function normalizeHex(value: unknown): string | null {
	if (typeof value !== "string") return null;
	const match = /^#?([\da-f]{3}|[\da-f]{6})$/i.exec(value.trim());
	if (!match) return null;
	const hex = match[1].toLowerCase();
	if (hex.length === 6) return `#${hex}`;
	return `#${hex
		.split("")
		.map((channel) => channel.repeat(2))
		.join("")}`;
}

function finiteNumber(value: unknown, fallback: number): number {
	return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}

function normalizedAngle(value: unknown, fallback: number): number {
	const rounded = Math.round(finiteNumber(value, fallback));
	return ((rounded % 360) + 360) % 360;
}

function normalizedGradientStops(
	value: unknown,
	base: PaletteBase,
): GradientStop[] {
	const stops: GradientStop[] = [];
	const usedIds = new Set<string>();
	if (Array.isArray(value)) {
		for (let index = 0; index < value.length && stops.length < 5; index += 1) {
			const candidate = value[index];
			if (!isRecord(candidate)) continue;
			const color = normalizeHex(candidate.color);
			if (!color) continue;

			const rawId =
				typeof candidate.id === "string" && candidate.id.trim()
					? candidate.id.trim()
					: `stop-${index + 1}`;
			let id = rawId;
			let suffix = 2;
			while (usedIds.has(id)) {
				id = `${rawId}-${suffix}`;
				suffix += 1;
			}
			usedIds.add(id);
			stops.push({ id, color });
		}
	}

	if (stops.length > 0) return stops;
	return DEFAULT_GRADIENT_INPUT[base].stops.map((stop) => ({ ...stop }));
}

/** Normalize editor and persisted recipes to the supported gradient range. */
function normalizeGradientInput(
	value: unknown,
	forcedBase?: PaletteBase,
): GradientThemeInput {
	const input = isRecord(value) ? value : {};
	const base =
		forcedBase ??
		(input.base === "light" || input.base === "dark" ? input.base : "dark");
	const fallback = DEFAULT_GRADIENT_INPUT[base];
	return {
		base,
		stops: normalizedGradientStops(input.stops, base),
		angle: normalizedAngle(input.angle, fallback.angle),
		intensity: clamp(finiteNumber(input.intensity, fallback.intensity), 0, 100),
	};
}

function formatCssNumber(value: number): string {
	return Number(value.toFixed(2)).toString();
}

// Keep low values expressive like Discord's control while capping the actual
// overlay alpha at 24%. Even at intensity 100 the semantic base remains visible,
// so foreground contrast cannot collapse into text over a solid stop color.
function gradientAlpha(intensity: number): number {
	return 24 * Math.sqrt(clamp(intensity, 0, 100) / 100);
}

function gradientPaletteVars(
	input: GradientThemeInput,
): Record<string, string> {
	const normalized = normalizeGradientInput(input);
	const vars: Record<string, string> = {
		"--theme-gradient": "none",
	};
	if (normalized.intensity === 0) return vars;
	const alpha = formatCssNumber(gradientAlpha(normalized.intensity));
	const sidebarAccentAlpha = normalized.base === "dark" ? 15 : 10;

	const colorAt = (color: string, position: number) =>
		`color-mix(in oklab, ${color} ${alpha}%, transparent) ${formatCssNumber(position)}%`;
	const stops =
		normalized.stops.length === 1
			? [
					colorAt(normalized.stops[0].color, 0),
					colorAt(normalized.stops[0].color, 100),
				]
			: normalized.stops.map((stop, index) =>
					colorAt(stop.color, (index / (normalized.stops.length - 1)) * 100),
				);
	vars["--theme-gradient"] =
		`linear-gradient(${normalized.angle}deg in oklab, ${stops.join(", ")})`;
	Object.assign(vars, {
		"--surface-card": "color-mix(in oklab, var(--card) 64%, transparent)",
		"--surface-card-hover": "color-mix(in oklab, var(--card) 80%, transparent)",
		"--surface-accent":
			"color-mix(in oklab, var(--primary) 14%, color-mix(in oklab, var(--card) 64%, transparent))",
		"--surface-accent-hover":
			"color-mix(in oklab, var(--primary) 22%, color-mix(in oklab, var(--card) 80%, transparent))",
		"--surface-hover": "color-mix(in oklab, var(--card) 55%, transparent)",
		"--control": "color-mix(in oklab, var(--input) 74%, transparent)",
		// Sidebar states sit directly over the ambient wash. A low-alpha
		// foreground modifier preserves that local color instead of covering it
		// with the solid gray accent inherited from the plain base theme.
		"--sidebar-accent": `color-mix(in oklab, var(--sidebar-foreground) ${sidebarAccentAlpha}%, transparent)`,
		"--sidebar-ring": `color-mix(in oklab, ${normalized.stops[0].color} 55%, var(--sidebar-foreground))`,
	});
	return vars;
}

/** Build a semantic-base-preserving ambient gradient palette. */
export function buildGradientPalette(input: GradientThemeInput): StoredPalette {
	const gradient = normalizeGradientInput(input);
	return {
		id: "custom",
		base: gradient.base,
		version: 2,
		vars: gradientPaletteVars(gradient),
		gradient,
	};
}

/** Gradient preview is already valid CSS, so preview and storage share output. */
export function previewGradientVars(
	input: GradientThemeInput,
): Record<string, string> {
	return gradientPaletteVars(input);
}

function hslFromHex(hex: string): [number, number, number] {
	const channels = parseRgbChannels(hex) ?? [128, 128, 128];
	const [r, g, b] = channels.map((channel) => channel / 255);
	const max = Math.max(r, g, b);
	const min = Math.min(r, g, b);
	const delta = max - min;
	const lightness = (max + min) / 2;
	if (delta === 0) return [0, 0, lightness * 100];

	const saturation = delta / (1 - Math.abs(2 * lightness - 1));
	let hue: number;
	if (max === r) hue = 60 * (((g - b) / delta) % 6);
	else if (max === g) hue = 60 * ((b - r) / delta + 2);
	else hue = 60 * ((r - g) / delta + 4);
	return [(hue + 360) % 360, saturation * 100, lightness * 100];
}

function hexFromHsl(
	hue: number,
	saturation: number,
	lightness: number,
): string {
	const h = ((hue % 360) + 360) % 360;
	const s = clamp(saturation, 0, 100) / 100;
	const l = clamp(lightness, 0, 100) / 100;
	const chroma = (1 - Math.abs(2 * l - 1)) * s;
	const section = h / 60;
	const x = chroma * (1 - Math.abs((section % 2) - 1));
	let rgb: [number, number, number];
	if (section < 1) rgb = [chroma, x, 0];
	else if (section < 2) rgb = [x, chroma, 0];
	else if (section < 3) rgb = [0, chroma, x];
	else if (section < 4) rgb = [0, x, chroma];
	else if (section < 5) rgb = [x, 0, chroma];
	else rgb = [chroma, 0, x];
	const match = l - chroma / 2;
	return `#${rgb
		.map((channel) =>
			Math.round((channel + match) * 255)
				.toString(16)
				.padStart(2, "0"),
		)
		.join("")}`;
}

/** Convert the former one-color recipe into a restrained analogous gradient. */
export function gradientInputFromSeed(
	input: SeedThemeInput,
): GradientThemeInput {
	const base = input.base === "light" ? "light" : "dark";
	const seed = normalizeHex(input.seed) ?? DEFAULT_SEED_INPUT[base].seed;
	const [hue, saturation, lightness] = hslFromHex(seed);
	const derivedSaturation = clamp(saturation, 48, 82);
	const derivedLightness =
		base === "dark" ? clamp(lightness, 48, 68) : clamp(lightness, 40, 62);
	const fallback = DEFAULT_GRADIENT_INPUT[base];
	return {
		base,
		stops: [
			{
				id: "seed-left",
				color: hexFromHsl(hue - 30, derivedSaturation, derivedLightness),
			},
			{ id: "seed", color: seed },
			{
				id: "seed-right",
				color: hexFromHsl(hue + 34, derivedSaturation, derivedLightness),
			},
		],
		angle: fallback.angle,
		intensity: fallback.intensity,
	};
}

function randomUnit(rng: () => number): number {
	const value = rng();
	if (!Number.isFinite(value)) return 0.5;
	return clamp(value, 0, 0.999999999);
}

const GRADIENT_HARMONIES = [
	[
		[-22, 22],
		[-32, 0, 32],
		[-42, -14, 14, 42],
	],
	[
		[0, 155],
		[0, 150, 210],
		[0, 30, 150, 210],
	],
	[
		[0, 120],
		[0, 120, 240],
		[0, 45, 145, 255],
	],
] as const;

/** Generate a harmonious Surprise Me recipe without relying on the DOM. */
export function randomGradientInput(
	input: GradientThemeInput,
	rng: () => number = Math.random,
): GradientThemeInput {
	const normalized = normalizeGradientInput(input);
	const count = 2 + Math.floor(randomUnit(rng) * 3);
	const hue = Math.floor(randomUnit(rng) * 360);
	const harmony = Math.floor(randomUnit(rng) * GRADIENT_HARMONIES.length);
	const angle = Math.floor(randomUnit(rng) * 360);
	const intensityUnit = randomUnit(rng);
	const intensity =
		normalized.base === "dark"
			? Math.round(8 + intensityUnit * 8)
			: Math.round(6 + intensityUnit * 6);
	const offsets = GRADIENT_HARMONIES[harmony][count - 2];
	const saturation = normalized.base === "dark" ? 72 : 68;
	const lightness = normalized.base === "dark" ? 62 : 54;

	return {
		base: normalized.base,
		stops: offsets.map((offset, index) => ({
			id: `random-${index + 1}`,
			color: hexFromHsl(hue + offset, saturation, lightness),
		})),
		angle,
		intensity,
	};
}

// Neutral background anchors the seed tint is mixed into (auto mode).
const SEED_BACKGROUND_ANCHOR: Record<PaletteBase, string> = {
	dark: "#191919",
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
		if (lum < 0.06) return mix(seed, 40, "#f5f5f5");
		if (lum < 0.2) return mix(seed, 70, "#f5f5f5");
	} else {
		if (lum > 0.55) return mix(seed, 45, "#262626");
		if (lum > 0.32) return mix(seed, 72, "#262626");
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
 * neutrals muddy. Dark anchors are pure r=g=b so the seed is the only source
 * of hue; where the base theme uses a white veil, the anchor is that veil
 * already flattened against its surface, since mix() needs a solid color.
 */
function seedPaletteVars(
	input: SeedThemeInput,
	mix: MixFn,
): Record<string, string> {
	const { base, seed } = input;
	// The accent is always probe-resolved, even on the preview path:
	// primaryForegroundFor needs a parseable color to pick the text color.
	const primary = normalizeSeedAccent(seed, base, mixResolved);
	const primaryForeground = primaryForegroundFor(primary);

	const vars: Record<string, string> =
		base === "dark"
			? {
					"--background": mix(seed, 12, SEED_BACKGROUND_ANCHOR.dark),
					"--foreground": mix(seed, 8, "#ededed"),
					"--reading": mix(seed, 6, "#e3e3e3"),
					"--card": mix(seed, 14, "#262626"),
					"--card-border": mix(seed, 10, "#3c3c3c"),
					"--card-foreground": mix(seed, 8, "#f1f1f1"),
					"--popover": mix(seed, 12, "#262626"),
					"--popover-foreground": mix(seed, 8, "#f1f1f1"),
					"--secondary": mix(seed, 15, "#313131"),
					"--secondary-foreground": mix(seed, 8, "#f1f1f1"),
					"--muted": mix(seed, 12, "#262626"),
					"--muted-foreground": mix(seed, 12, "#aaaaaa"),
					"--accent": mix(seed, 16, "#444444"),
					"--accent-foreground": mix(seed, 6, "#f4f4f4"),
					"--border": mix(seed, 10, "#303030"),
					"--input": mix(seed, 12, "#202020"),
					"--ring": mix(primary, 80, "black"),
					"--sidebar": mix(seed, 10, "#121212"),
					"--sidebar-foreground": mix(seed, 8, "#f1f1f1"),
					"--sidebar-accent": mix(seed, 14, "#2a2a2a"),
					"--sidebar-accent-foreground": mix(seed, 6, "#f4f4f4"),
					"--sidebar-border": mix(seed, 10, "#2a2a2a"),
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
					// A state fill, not another surface: at #e7e3dd it landed 1.07:1
					// against --sidebar, so the rail's active chip disappeared.
					"--sidebar-accent": mix(seed, 16, "#cbc5bb"),
					"--sidebar-accent-foreground": mix(seed, 30, "#332f38"),
					"--sidebar-border": mix(seed, 14, "#e4e1db"),
				};

	vars["--primary"] = primary;
	vars["--primary-foreground"] = primaryForeground;
	vars["--sidebar-primary"] = primary;
	vars["--sidebar-primary-foreground"] = primaryForeground;
	vars["--sidebar-ring"] = vars["--ring"];
	vars["--chart-1"] = primary;
	vars["--chart-2"] = mix(primary, 80, vars["--background"]);
	vars["--chart-3"] = mix(primary, 60, vars["--background"]);
	vars["--chart-4"] = mix(primary, 40, vars["--background"]);
	vars["--chart-5"] = mix(primary, 20, vars["--background"]);

	return vars;
}

export function buildSeedPalette(input: SeedThemeInput): StoredPalette {
	return {
		id: "custom",
		base: input.base,
		version: 2,
		vars: seedPaletteVars(input, mixResolved),
		seed: input,
	};
}

/** Unresolved (color-mix expression) vars for live preview while editing. */
export function previewSeedVars(input: SeedThemeInput): Record<string, string> {
	return seedPaletteVars(input, mixExpression);
}
