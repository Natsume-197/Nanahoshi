import { palettes, usePalette } from "@/theme";

/** The full player is always dark, like the web's (`.dark` on the sheet),
 * whatever the app's theme: its colours sit on the blurred artwork. */
export const ink = {
	text: "#f4f3f5",
	// Apple Music's secondary lines lean on vibrancy; without it they need
	// more opacity to hold 4.5:1 over a glow.
	soft: "rgba(244,243,245,0.84)",
	muted: "rgba(244,243,245,0.7)",
	faint: "rgba(244,243,245,0.5)",
	track: "rgba(244,243,245,0.22)",
	chip: "rgba(244,243,245,0.12)",
	chipActive: "rgba(244,243,245,0.16)",
	press: "rgba(244,243,245,0.08)",
	/** Text on the white play button and selected chips. */
	onText: "#141416",
	floor: "#101012",
	danger: "#f87171",
	sheet: palettes.dark.card,
};

/** Sheets over the player (speed, sleep, chapters, bookmarks) follow the
 * app's theme like every other sheet; only the player itself stays dark. */
export function useSheetInk() {
	const palette = usePalette();
	return {
		text: palette.text,
		soft: palette.textSecondary,
		muted: palette.textSecondary,
		faint: palette.textTertiary,
		track: palette.separator,
		chip: palette.surface,
		chipActive: palette.input,
		press: palette.ripple,
		onText: palette.background,
		danger: palette.danger,
		sheet: palette.card,
	};
}
