import { useCallback, useState } from "react";

const STORAGE_KEY = "nanahoshi:recent-searches";
const MAX_RECENT = 6;

function read(): string[] {
	if (typeof window === "undefined") return [];
	try {
		const raw = window.localStorage.getItem(STORAGE_KEY);
		if (!raw) return [];
		const parsed = JSON.parse(raw);
		return Array.isArray(parsed)
			? parsed.filter((item): item is string => typeof item === "string")
			: [];
	} catch {
		return [];
	}
}

function write(items: string[]) {
	if (typeof window === "undefined") return;
	try {
		window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
	} catch {
		// Ignore quota / privacy-mode failures.
	}
}

/**
 * Most-recent-first list of search queries, persisted to localStorage.
 * SSR-safe: reads return [] on the server, so the dropdown (client-only) never
 * causes a hydration mismatch.
 */
export function useRecentSearches() {
	const [recent, setRecent] = useState<string[]>(read);

	const add = useCallback((value: string) => {
		const query = value.trim();
		if (!query) return;
		setRecent((prev) => {
			const next = [
				query,
				...prev.filter((item) => item.toLowerCase() !== query.toLowerCase()),
			].slice(0, MAX_RECENT);
			write(next);
			return next;
		});
	}, []);

	const remove = useCallback((value: string) => {
		setRecent((prev) => {
			const next = prev.filter((item) => item !== value);
			write(next);
			return next;
		});
	}, []);

	const clear = useCallback(() => {
		setRecent([]);
		write([]);
	}, []);

	return { recent, add, remove, clear };
}
