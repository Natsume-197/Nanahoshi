import { useCallback, useEffect, useState } from "react";

export type Theme = "dark" | "spotify";

const THEMES: Theme[] = ["dark", "spotify"];

function getStoredTheme(): Theme {
	if (typeof window === "undefined") return "dark";
	const stored = localStorage.getItem("theme") as Theme;
	return THEMES.includes(stored) ? stored : "dark";
}

function applyTheme(theme: Theme) {
	const root = document.documentElement;
	root.classList.add("dark");
	// Toggle the modifier class for non-default dark themes
	for (const t of THEMES) {
		if (t !== "dark") {
			root.classList.toggle(t, theme === t);
		}
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
export const themeScript = `(function(){var t=localStorage.getItem("theme");document.documentElement.classList.add("dark");if(t==="spotify")document.documentElement.classList.add(t)})()`;
