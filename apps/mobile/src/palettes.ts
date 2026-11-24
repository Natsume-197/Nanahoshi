// Claude's app palette, shared with the web (packages/ui/src/styles/theme.css).
// Claude's own hue (~105) reads green, so light is turned to hue 70 and dark
// surfaces carry a whisper of hue 286; inks are neutral. Monochrome: colour
// comes from the covers.
const light = {
	background: "#fbf8f5",
	chrome: "#f5f1ec", // tab bar
	card: "#ffffff",
	/** Bottom sheets and their rows: the page's own colour, set apart by the
	 * scrim and their rounded top, not a lighter fill. */
	sheet: "#fbf8f5",
	/** Grouped lists, hub tiles, panels on the canvas. */
	surfaceCard: "#f3ede6",
	surfaceCardHover: "#ece4dc",
	surface: "#f3ede6", // chips, pressed rows
	input: "#ece4dc",
	/** The search field's edge, as on Claude's composer. */
	fieldBorder: "#ddd5cc",
	text: "#141414",
	textSecondary: "#5f5c59",
	textTertiary: "#8a857f",
	navInactive: "#4c4c4c",
	/** Material's pill behind the selected tab: neutral, never the accent. */
	navIndicator: "#e9e1d9",
	separator: "#ece4dc",
	primary: "#141414",
	onPrimary: "#fbf8f5",
	accent: "#141414",
	accentSoft: "#f2ece4",
	progressTrack: "rgba(0,0,0,0.45)",
	progress: "#f7f7f7",
	coverEdge: "rgba(0,0,0,0.10)",
	skeleton: "#f2ece5",
	danger: "#c42b1c",
	/** Locked metadata fields. */
	warning: "#905300",
	/** Android press ripple on rows and icon buttons. */
	ripple: "rgba(20,20,19,0.08)",
	/** --radius 0.5rem → rounded-md covers. */
	coverRadius: 6,
};

/** Surfaces step up like Claude's: canvas #151518, raised field #202023,
 * controls on it #313134. */
const dark: typeof light = {
	background: "#151518",
	chrome: "#1a1a1d",
	card: "#202023",
	sheet: "#151518",
	surfaceCard: "#202023",
	surfaceCardHover: "#29292d",
	surface: "#29292d",
	input: "#202023",
	fieldBorder: "#3b3b3f",
	text: "#f9f9f9",
	textSecondary: "#a2a2a2",
	textTertiary: "#747474",
	navInactive: "#c1c1c1",
	navIndicator: "#313134",
	separator: "#29292d",
	primary: "#f9f9f9",
	onPrimary: "#151518",
	accent: "#f9f9f9",
	accentSoft: "#29292d",
	progressTrack: "rgba(0,0,0,0.45)",
	progress: "#f7f7f7",
	coverEdge: "rgba(255,255,255,0.10)",
	skeleton: "#232326",
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
	card: "#121215",
	sheet: "#0e0e10",
	surfaceCard: "#121215",
	surfaceCardHover: "#1c1c1f",
	surface: "#1c1c1f",
	input: "#161619",
	fieldBorder: "#2b2b2f",
	navIndicator: "#262529",
	separator: "#1f1f22",
	onPrimary: "#000000",
	accentSoft: "#161619",
	skeleton: "#161619",
};

export type Palette = typeof light;

export const palettes = { light, dark, amoled };
