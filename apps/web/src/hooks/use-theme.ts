import { useCallback, useState } from "react";
import { useMountEffect } from "@/hooks/use-mount-effect";
import { refreshThemeColor } from "@/lib/theme-color";

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
	// biome-ignore lint/suspicious/noDocumentCookie: must be synchronous — the blocking theme script in __root.tsx reads this cookie before first paint
	document.cookie = `${THEME_COOKIE}=${theme};path=/;max-age=${COOKIE_MAX_AGE};SameSite=Lax`;
}

function resolveTheme(theme: Theme): "light" | "dark" {
	return theme === "system" ? getSystemTheme() : theme;
}

function applyTheme(theme: Theme) {
	const root = document.documentElement;
	// Suppress transitions for the duration of the swap (rule lives in index.css).
	// Without this, every element using `transition-colors` (hovers, cards,
	// borders…) fades independently when `.dark` toggles, which looks slow.
	root.classList.add("theme-changing");
	root.classList.toggle("dark", resolveTheme(theme) === "dark");

	// Force a synchronous style flush so the no-transition rule applies to the
	// new colors before we re-enable transitions.
	void window.getComputedStyle(document.body).opacity;
	root.classList.remove("theme-changing");
	// The browser/OS navbar tint follows --sidebar, which just changed.
	refreshThemeColor();
}

export function useTheme() {
	const [theme, setThemeState] = useState<Theme>(getStoredTheme);
	// Initialized to the SSR default ("dark") so first client render matches the
	// server, then synced to the real resolved value on mount to avoid hydration
	// mismatches when the stored theme is "system".
	const [resolvedTheme, setResolvedTheme] = useState<"light" | "dark">("dark");

	const setTheme = useCallback((next: Theme) => {
		setThemeState(next);
		setResolvedTheme(resolveTheme(next));
		setThemeCookie(next);
		applyTheme(next);
	}, []);

	// Sync resolved theme on mount and listen for system theme changes
	useMountEffect(() => {
		// The boot script in __root.tsx already resolved + applied the theme
		// before hydration — read it back from the DOM instead of recomputing.
		setResolvedTheme(
			document.documentElement.classList.contains("dark") ? "dark" : "light",
		);

		const mq = window.matchMedia("(prefers-color-scheme: dark)");
		const handler = () => {
			if (getStoredTheme() === "system") {
				applyTheme("system");
				setResolvedTheme(getSystemTheme());
			}
		};
		mq.addEventListener("change", handler);
		return () => mq.removeEventListener("change", handler);
	});

	return { theme, resolvedTheme, setTheme } as const;
}
