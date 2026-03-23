import { useCallback, useState } from "react";
import { useMountEffect } from "@/hooks/use-mount-effect";

export type Theme = "light" | "dark" | "system";

const THEME_COOKIE = "theme";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 400; // ~13 months

function getSystemTheme(): "light" | "dark" {
	if (typeof window === "undefined") return "dark";
	return window.matchMedia("(prefers-color-scheme: dark)").matches
		? "dark"
		: "light";
}

function getStoredTheme(): Theme {
	if (typeof document === "undefined") return "dark";
	const match = document.cookie.match(
		new RegExp(`(?:^|; )${THEME_COOKIE}=([^;]*)`),
	);
	const value = match?.[1];
	if (value === "light" || value === "dark" || value === "system") return value;
	return "dark";
}

function setThemeCookie(theme: Theme) {
	document.cookie = `${THEME_COOKIE}=${theme};path=/;max-age=${COOKIE_MAX_AGE};SameSite=Lax`;
}

function applyTheme(theme: Theme) {
	const resolved = theme === "system" ? getSystemTheme() : theme;
	document.documentElement.classList.toggle("dark", resolved === "dark");
}

export function useTheme() {
	const [theme, setThemeState] = useState<Theme>(getStoredTheme);

	const setTheme = useCallback((next: Theme) => {
		setThemeState(next);
		setThemeCookie(next);
		applyTheme(next);
	}, []);

	// Listen for system theme changes when mode is "system"
	useMountEffect(() => {
		const mq = window.matchMedia("(prefers-color-scheme: dark)");
		const handler = () => {
			const current = getStoredTheme();
			if (current === "system") {
				applyTheme("system");
			}
		};
		mq.addEventListener("change", handler);
		return () => mq.removeEventListener("change", handler);
	});

	return { theme, setTheme } as const;
}
