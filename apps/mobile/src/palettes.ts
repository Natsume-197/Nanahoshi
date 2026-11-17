// Claude's app palette: warm ivory and warm ink in light, a neutral near-black
// with warm off-white text in dark. Monochrome: colour comes from the covers.
const light = {
	background: "#faf9f5",
	chrome: "#f3f2ec", // tab bar
	card: "#ffffff",
	/** Bottom sheets and their rows: the page's own colour, set apart by the
	 * scrim and their rounded top, not a lighter fill. */
	sheet: "#faf9f5",
	/** Grouped lists, hub tiles, panels on the canvas. */
	surfaceCard: "#f0eee6",
	surfaceCardHover: "#e8e6dc",
	surface: "#f0eee6", // chips, pressed rows
	input: "#e8e6dc",
	text: "#141413",
	textSecondary: "#5e5d59",
	textTertiary: "#87867f",
	navInactive: "#4d4c48",
	/** Material's pill behind the selected tab: neutral, never the accent. */
	navIndicator: "#e5e3d9",
	separator: "#e8e6dc",
	primary: "#141413",
	onPrimary: "#faf9f5",
	accent: "#141413",
	accentSoft: "#efede4",
	progressTrack: "rgba(0,0,0,0.45)",
	progress: "#f7f7f7",
	coverEdge: "rgba(0,0,0,0.10)",
	skeleton: "#efede5",
	danger: "#c42b1c",
	/** Locked metadata fields. */
	warning: "#905300",
	/** Android press ripple on rows and icon buttons. */
	ripple: "rgba(20,20,19,0.08)",
	/** --radius 0.5rem → rounded-md covers. */
	coverRadius: 6,
};

/** Surfaces step up like Claude's: canvas #151515, raised field #20201e,
 * controls on it #313131. */
const dark: typeof light = {
	background: "#151515",
	chrome: "#1a1a19",
	card: "#20201e",
	sheet: "#151515",
	surfaceCard: "#20201e",
	surfaceCardHover: "#2a2a28",
	surface: "#2a2a28",
	input: "#20201e",
	text: "#f9f9f7",
	textSecondary: "#a3a29b",
	textTertiary: "#75746e",
	navInactive: "#c2c2b6",
	navIndicator: "#313131",
	separator: "#2a2a28",
	primary: "#f9f9f7",
	onPrimary: "#151515",
	accent: "#f9f9f7",
	accentSoft: "#2a2a28",
	progressTrack: "rgba(0,0,0,0.45)",
	progress: "#f7f7f7",
	coverEdge: "rgba(255,255,255,0.10)",
	skeleton: "#232321",
	danger: "#f26b6b",
	warning: "#efa831",
	ripple: "rgba(249,249,247,0.10)",
	/** Dark theme's --radius is 0.2rem, so covers are nearly square. */
	coverRadius: 2.5,
};

/** Dark on true black: OLED pixels switch off. Surfaces climb from #000 in
 * the same steps as dark so cards still read as cards. */
const amoled: typeof light = {
	...dark,
	background: "#000000",
	chrome: "#000000",
	card: "#121211",
	sheet: "#0e0e0d",
	surfaceCard: "#121211",
	surfaceCardHover: "#1c1c1a",
	surface: "#1c1c1a",
	input: "#161615",
	navIndicator: "#262624",
	separator: "#1f1f1d",
	onPrimary: "#000000",
	accentSoft: "#161615",
	skeleton: "#161615",
};

export type Palette = typeof light;

export const palettes = { light, dark, amoled };
