import type { CSSProperties } from "react";
import { getAccentForegroundColor } from "@/utils/color";

export function getHeroStyle(
	accentColor: string | null,
	accentForegroundColor?: string,
): CSSProperties {
	return {
		"--book-accent": accentColor ?? "oklch(0.67 0.16 38)",
		"--book-accent-foreground":
			accentForegroundColor ??
			(accentColor ? getAccentForegroundColor(accentColor) : "oklch(0 0 0)"),
		"--book-hero-text": "var(--foreground)",
		"--book-hero-muted": "var(--muted-foreground)",
	} as CSSProperties;
}
