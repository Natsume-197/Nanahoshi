import { useCallback, useEffect, useState } from "react";

export type Theme =
	| "dark"
	| "claude"
	| "hyperbeam"
	| "anilist"
	| "cyberpunk"
	| "custom"
	| `saved:${string}`;

export interface CustomColors {
	background: string;
	primary: string;
	sidebar: string;
	header: string;
}

export interface SavedTheme {
	id: string;
	name: string;
	colors: CustomColors;
}

const PRESET_THEMES = [
	"dark",
	"claude",
	"hyperbeam",
	"anilist",
	"cyberpunk",
] as const;

function isValidTheme(t: string): t is Theme {
	return (
		PRESET_THEMES.includes(t as (typeof PRESET_THEMES)[number]) ||
		t === "custom" ||
		t.startsWith("saved:")
	);
}

function getStoredTheme(): Theme {
	if (typeof window === "undefined") return "dark";
	const stored = localStorage.getItem("theme") ?? "";
	return isValidTheme(stored) ? stored : "dark";
}

const DEFAULT_COLORS: CustomColors = {
	background: "#1a1a1a",
	primary: "#7cc55a",
	sidebar: "#161616",
	header: "#1a1a1a",
};

function parseColors(raw: unknown): CustomColors {
	const parsed = raw as Record<string, string>;
	return {
		background: parsed?.background ?? DEFAULT_COLORS.background,
		primary: parsed?.primary ?? DEFAULT_COLORS.primary,
		sidebar: parsed?.sidebar ?? DEFAULT_COLORS.sidebar,
		header: parsed?.header ?? parsed?.background ?? DEFAULT_COLORS.header,
	};
}

export function getStoredCustomColors(): CustomColors {
	if (typeof window === "undefined") return DEFAULT_COLORS;
	try {
		const raw = localStorage.getItem("theme-custom-colors");
		if (raw) return parseColors(JSON.parse(raw));
	} catch {}
	return DEFAULT_COLORS;
}

export function saveCustomColors(colors: CustomColors) {
	localStorage.setItem("theme-custom-colors", JSON.stringify(colors));
}

// --- Saved themes ---

export function getSavedThemes(): SavedTheme[] {
	if (typeof window === "undefined") return [];
	try {
		const raw = localStorage.getItem("theme-saved");
		if (raw) return JSON.parse(raw);
	} catch {}
	return [];
}

export function saveTheme(name: string, colors: CustomColors): SavedTheme {
	const themes = getSavedThemes();
	const id = crypto.randomUUID().slice(0, 8);
	const theme: SavedTheme = { id, name, colors };
	themes.push(theme);
	localStorage.setItem("theme-saved", JSON.stringify(themes));
	return theme;
}

export function deleteSavedTheme(id: string) {
	const themes = getSavedThemes().filter((t) => t.id !== id);
	localStorage.setItem("theme-saved", JSON.stringify(themes));
}

function getColorsForTheme(theme: Theme): CustomColors | null {
	if (theme === "custom") return getStoredCustomColors();
	if (theme.startsWith("saved:")) {
		const id = theme.slice(6);
		const saved = getSavedThemes().find((t) => t.id === id);
		return saved ? saved.colors : null;
	}
	return null;
}

// --- Color derivation ---

function hexToRgb(hex: string) {
	const n = Number.parseInt(hex.slice(1), 16);
	return [(n >> 16) & 255, (n >> 8) & 255, n & 255] as const;
}

function rgbToHex(r: number, g: number, b: number) {
	return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

function adjustLightness(hex: string, factor: number) {
	const [r, g, b] = hexToRgb(hex);
	const clamp = (v: number) => Math.min(255, Math.max(0, Math.round(v)));
	return rgbToHex(
		clamp(r + (factor > 0 ? (255 - r) * factor : r * factor)),
		clamp(g + (factor > 0 ? (255 - g) * factor : g * factor)),
		clamp(b + (factor > 0 ? (255 - b) * factor : b * factor)),
	);
}

function luminance(hex: string) {
	const [r, g, b] = hexToRgb(hex);
	return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

export function deriveCustomThemeVars(
	colors: CustomColors,
): Record<string, string> {
	const { background: bg, primary, sidebar, header } = colors;
	const fg = adjustLightness(bg, 0.95);
	const card = adjustLightness(bg, -0.12);
	const muted = adjustLightness(bg, -0.08);
	const mutedFg = adjustLightness(bg, 0.65);
	const secondary = adjustLightness(bg, 0.06);
	const border = adjustLightness(bg, 0.15);
	const input = adjustLightness(bg, 0.2);
	const primaryFg = luminance(primary) > 0.5 ? "#1a1a1a" : "#f5f5f5";
	const sidebarAccent = adjustLightness(sidebar, -0.15);
	const sidebarBorder = adjustLightness(sidebar, 0.15);

	return {
		"--background": bg,
		"--header": header,
		"--foreground": fg,
		"--card": card,
		"--card-foreground": fg,
		"--popover": card,
		"--popover-foreground": fg,
		"--primary": primary,
		"--primary-foreground": primaryFg,
		"--secondary": secondary,
		"--secondary-foreground": fg,
		"--muted": muted,
		"--muted-foreground": mutedFg,
		"--accent": secondary,
		"--accent-foreground": fg,
		"--destructive": "#e5484d",
		"--border": border,
		"--input": input,
		"--ring": mutedFg,
		"--sidebar": sidebar,
		"--sidebar-foreground": fg,
		"--sidebar-primary": primary,
		"--sidebar-primary-foreground": primaryFg,
		"--sidebar-accent": sidebarAccent,
		"--sidebar-accent-foreground": fg,
		"--sidebar-border": sidebarBorder,
		"--sidebar-ring": mutedFg,
	};
}

function clearCustomVars() {
	document.documentElement.removeAttribute("style");
}

export function applyCustomColors(colors: CustomColors) {
	const vars = deriveCustomThemeVars(colors);
	const cssText = Object.entries(vars)
		.map(([k, v]) => `${k}:${v}`)
		.join(";");
	document.documentElement.style.cssText = cssText;
}

function applyTheme(theme: Theme) {
	const root = document.documentElement;
	root.classList.add("dark");
	for (const t of PRESET_THEMES) {
		if (t !== "dark") {
			root.classList.toggle(t, theme === t);
		}
	}
	const colors = getColorsForTheme(theme);
	if (colors) {
		applyCustomColors(colors);
	} else {
		clearCustomVars();
	}
}

export function useTheme() {
	const [theme, setThemeState] = useState<Theme>(getStoredTheme);

	const setTheme = useCallback((t: Theme) => {
		setThemeState(t);
		applyTheme(t);
		localStorage.setItem("theme", t);
	}, []);

	useEffect(() => {
		applyTheme(theme);
	}, [theme]);

	return { theme, setTheme };
}

/**
 * Inline script to set theme before React hydrates (prevents flash).
 * Inject this in <head> via dangerouslySetInnerHTML.
 */
export const themeScript = `(function(){
var t=localStorage.getItem("theme")||"dark";
document.documentElement.classList.add("dark");
if(t==="claude"||t==="hyperbeam"||t==="anilist"||t==="cyberpunk")document.documentElement.classList.add(t);
var c=null;
if(t==="custom"){try{c=JSON.parse(localStorage.getItem("theme-custom-colors"))}catch(e){}}
if(t.indexOf("saved:")===0){try{var id=t.slice(6);var arr=JSON.parse(localStorage.getItem("theme-saved")||"[]");for(var i=0;i<arr.length;i++){if(arr[i].id===id){c=arr[i].colors;break}}}catch(e){}}
if(c){function hex2rgb(h){var n=parseInt(h.slice(1),16);return[(n>>16)&255,(n>>8)&255,n&255]}function rgb2hex(r,g,b){return"#"+((1<<24)|(r<<16)|(g<<8)|b).toString(16).slice(1)}function adj(h,f){var c=hex2rgb(h);function cl(v){return Math.min(255,Math.max(0,Math.round(v)))}return rgb2hex(cl(c[0]+(f>0?(255-c[0])*f:c[0]*f)),cl(c[1]+(f>0?(255-c[1])*f:c[1]*f)),cl(c[2]+(f>0?(255-c[2])*f:c[2]*f)))}function lum(h){var c=hex2rgb(h);return(0.299*c[0]+0.587*c[1]+0.114*c[2])/255}var bg=c.background||"#1a1a1a",pr=c.primary||"#7cc55a",si=c.sidebar||"#161616",hd=c.header||bg;var fg=adj(bg,.95),cd=adj(bg,-.12),mt=adj(bg,-.08),mf=adj(bg,.65),sc=adj(bg,.06),bd=adj(bg,.15),ip=adj(bg,.2),pf=lum(pr)>.5?"#1a1a1a":"#f5f5f5",sa=adj(si,-.15),sbd=adj(si,.15);document.documentElement.style.cssText="--background:"+bg+";--header:"+hd+";--foreground:"+fg+";--card:"+cd+";--card-foreground:"+fg+";--popover:"+cd+";--popover-foreground:"+fg+";--primary:"+pr+";--primary-foreground:"+pf+";--secondary:"+sc+";--secondary-foreground:"+fg+";--muted:"+mt+";--muted-foreground:"+mf+";--accent:"+sc+";--accent-foreground:"+fg+";--destructive:#e5484d;--border:"+bd+";--input:"+ip+";--ring:"+mf+";--sidebar:"+si+";--sidebar-foreground:"+fg+";--sidebar-primary:"+pr+";--sidebar-primary-foreground:"+pf+";--sidebar-accent:"+sa+";--sidebar-accent-foreground:"+fg+";--sidebar-border:"+sbd+";--sidebar-ring:"+mf}
})()`;
