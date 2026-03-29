import type { CSSProperties } from "react";
import { getAccentForegroundColor } from "@/utils/color";

export function getHeroStyle(accentColor: string | null): CSSProperties {
	return {
		"--book-accent": accentColor ?? "oklch(0.67 0.16 38)",
		"--book-accent-foreground": accentColor
			? getAccentForegroundColor(accentColor)
			: "oklch(0.97 0.01 80)",
		"--book-hero-text": "var(--card-foreground)",
		"--book-hero-muted":
			"color-mix(in oklch, var(--card-foreground) 72%, var(--card) 28%)",
	} as CSSProperties;
}
