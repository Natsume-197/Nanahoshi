import { useColorScheme } from "react-native";
import { cubicBezier, Easing } from "react-native-reanimated";

/**
 * Tokens resolved from apps/web/src/index.css (its OKLab color-mix values
 * computed to hex) so the phone app is the same product as the web: a white
 * canvas with system-gray chrome in light mode; graphite with a darker chrome
 * and the lavender primary in dark mode.
 */
const light = {
	background: "#ffffff",
	chrome: "#f5f5f7", // --sidebar: tab bar
	card: "#ffffff",
	/** --surface-card: grouped lists, hub tiles, panels on the canvas. */
	surfaceCard: "#f7f7f8",
	surfaceCardHover: "#f2f2f4",
	surface: "#f5f5f7", // --muted: chips, skeletons
	input: "#ebebed",
	text: "#1e1e20",
	textSecondary: "#6b6b70",
	textTertiary: "#9a9a9f",
	navInactive: "#555557",
	separator: "#e4e4e7",
	primary: "#1e1e20",
	onPrimary: "#fcfcfc",
	accent: "#1e1e20",
	accentSoft: "#f0eef3",
	progressTrack: "rgba(0,0,0,0.45)",
	progress: "#f7f7f7",
	coverEdge: "rgba(0,0,0,0.10)",
	skeleton: "#f0f0f2",
	danger: "#dc2626",
	/** --warning: locked metadata fields. */
	warning: "#905300",
	/** Android press ripple on rows and icon buttons. */
	ripple: "rgba(0,0,0,0.08)",
	/** --radius 0.5rem → rounded-md covers. */
	coverRadius: 6,
};

const dark: typeof light = {
	// The web's dark canvas (--background) and its darker chrome (--sidebar).
	background: "#1f1f20",
	chrome: "#161617",
	card: "#272729",
	surfaceCard: "#272729",
	surfaceCardHover: "#343436",
	surface: "#373638",
	input: "#2d2c2e",
	text: "#d8d7d8",
	textSecondary: "#9b9a9c",
	textTertiary: "#747375",
	navInactive: "#aeaeaf",
	separator: "#3a3a3b",
	primary: "#8b7a9e",
	onPrimary: "#000000",
	accent: "#8b7a9e",
	accentSoft: "#2f2b35",
	progressTrack: "rgba(0,0,0,0.45)",
	progress: "#f7f7f7",
	coverEdge: "rgba(255,255,255,0.10)",
	skeleton: "#2d2c2e",
	danger: "#ef4444",
	warning: "#efa831",
	ripple: "rgba(255,255,255,0.10)",
	/** Dark theme's --radius is 0.2rem, so covers are nearly square. */
	coverRadius: 2.5,
};

export type Palette = typeof light;

export function usePalette(): Palette {
	return useColorScheme() === "dark" ? dark : light;
}

export const palettes = { light, dark };

/** 4pt rhythm; 16pt page gutter like the web's phone layout. */
export const space = {
	xs: 4,
	sm: 8,
	md: 12,
	lg: 16,
	xl: 24,
	xxl: 32,
} as const;

/** Shape rule (measured on the web): covers follow the theme radius, cards
 * 16 (rounded-2xl), buttons and fields 11 (rounded-xl), chips are pills. */
export const radius = {
	/** Thumbnails in rows (mosaics, fans): rounded-lg. */
	thumb: 8,
	field: 11,
	card: 16,
	sheet: 20,
	pill: 999,
} as const;

/** Gen Interface JP (Inter + Noto Sans JP), the web's --font-sans. Android
 * can't synthesize weights for a custom face, so each weight is its own
 * family and Text picks it from fontWeight. */
export const fonts = {
	"400": "GenInterfaceJP-Regular",
	"500": "GenInterfaceJP-Medium",
	"600": "GenInterfaceJP-SemiBold",
	"700": "GenInterfaceJP-Bold",
} as const;

export const fontSources = {
	"GenInterfaceJP-Regular": require("../assets/fonts/GenInterfaceJP-Regular.ttf"),
	"GenInterfaceJP-Medium": require("../assets/fonts/GenInterfaceJP-Medium.ttf"),
	"GenInterfaceJP-SemiBold": require("../assets/fonts/GenInterfaceJP-SemiBold.ttf"),
	"GenInterfaceJP-Bold": require("../assets/fonts/GenInterfaceJP-Bold.ttf"),
};

/**
 * Type ramp. The last four steps are the web's own component sizes (measured
 * in BookCardShell and the auth form), named so no screen writes a font size.
 */
export const type = {
	largeTitle: { fontSize: 30, lineHeight: 36, fontWeight: "700" },
	/** Compact page title (CollectionToolbar "compact"): text-2xl semibold. */
	pageTitle: { fontSize: 24, lineHeight: 30, fontWeight: "600" },
	display: { fontSize: 36, lineHeight: 40, fontWeight: "700" },
	title: { fontSize: 22, lineHeight: 28, fontWeight: "600" },
	section: { fontSize: 20, lineHeight: 25, fontWeight: "600" },
	headline: { fontSize: 16, lineHeight: 21, fontWeight: "500" },
	body: { fontSize: 15, lineHeight: 22, fontWeight: "400" },
	lead: { fontSize: 16, lineHeight: 26, fontWeight: "400" },
	subhead: { fontSize: 14, lineHeight: 19, fontWeight: "400" },
	caption: { fontSize: 12, lineHeight: 16, fontWeight: "400" },
	/** Shelf tile title: text-base, medium, two lines. */
	tileTitle: { fontSize: 16, lineHeight: 22, fontWeight: "500" },
	/** Resume card title: 0.8125rem semibold, tight. */
	cardTitle: { fontSize: 13, lineHeight: 16, fontWeight: "600" },
	/** Resume card author/meta: text-xs, relaxed. */
	cardMeta: { fontSize: 12, lineHeight: 18, fontWeight: "400" },
	/** Collection/shelf row name: text-lg semibold, tight. */
	rowTitle: { fontSize: 18, lineHeight: 22, fontWeight: "600" },
	/** Form labels and button labels: text-sm medium. */
	label: { fontSize: 14, lineHeight: 20, fontWeight: "500" },
	/** Search result title: text-base semibold, two lines. */
	listTitle: { fontSize: 16, lineHeight: 21, fontWeight: "600" },
	/** Search result meta ("Book", "Author · 12 books"): text-xs medium. */
	metaLabel: { fontSize: 12, lineHeight: 16, fontWeight: "500" },
	/** Detail hero action label: 15pt medium. */
	heroLabel: { fontSize: 15, lineHeight: 20, fontWeight: "500" },
	/** Detail page title under the cover: text-2xl bold. */
	heroTitle: { fontSize: 24, lineHeight: 30, fontWeight: "700" },
} as const;

/** One elevation system: covers float, cards stay flat (the web's rule). */
export const shadows = {
	card: "0 2px 6px rgba(0, 0, 0, 0.18)",
	raised: "0 8px 20px rgba(0, 0, 0, 0.3)",
	cover: "0 8px 14px rgba(0, 0, 0, 0.25)",
	hero: "0 12px 28px rgba(0, 0, 0, 0.3)",
	/** Player artwork floating on its blurred field (web player). */
	art: "0 20px 50px -20px rgba(0, 0, 0, 0.85)",
	/** The detail page's cover over its washed hero; dark grounds need more. */
	detailCover: {
		light: "0 20px 40px -16px rgba(0, 0, 0, 0.5)",
		dark: "0 20px 40px -12px rgba(0, 0, 0, 0.75)",
	},
	/** Bars that float over the page: the mini player. */
	floating: "0 8px 24px rgba(0, 0, 0, 0.28), 0 2px 6px rgba(0, 0, 0, 0.18)",
	/** Notice pills. */
	toast: "0 8px 24px rgba(0, 0, 0, 0.18)",
} as const;

/** A ripple for surfaces that don't follow the app theme (the welcome
 * paper, the always-dark player): mid-gray reads on light and dark. */
export const neutralRipple = "rgba(128,128,128,0.2)";

// Dims the page well behind every bottom sheet, so the sheet reads as on top.
export const sheetScrim = "rgba(0,0,0,0.6)";

/** expo-animation's tables: press 100–150 ms, strong ease-out on UI. */
export const motion = {
	press: 120,
	fast: 150,
	base: 250,
	easeOut: cubicBezier(0.23, 1, 0.32, 1),
} as const;

/** motion.easeOut as a worklet easing, for withTiming and layout animations
 * (their default, ease-in-out, starts slow right as the finger lets go). */
export const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);

/** A drag's settle or snap; spread `velocity` from the gesture into it. */
export const SNAP_SPRING = { duration: 300, dampingRatio: 0.8 } as const;

/** Fixed sizes that several components share. */
export const sizes = {
	control: 44,
	/** Chips and the detail hero's action row (web h-10). */
	chip: 40,
	fab: 48,
	tile: 150,
	resumeCover: 64,
} as const;
