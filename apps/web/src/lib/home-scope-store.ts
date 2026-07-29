import { useSyncExternalStore } from "react";

// Which format the home dashboard shows. Kept in a module store so the
// preference survives the dashboard content's render lifecycle, and persisted
// so the choice survives reloads.
export type HomeScope = "all" | "books" | "audiobooks";

const HOME_SCOPE_KEY = "nanahoshi-home-scope";

function readStored(): HomeScope {
	if (typeof window === "undefined") return "all";
	const stored = window.localStorage.getItem(HOME_SCOPE_KEY);
	return stored === "books" || stored === "audiobooks" ? stored : "all";
}

let scope: HomeScope = readStored();
const listeners = new Set<() => void>();

function emit() {
	for (const listener of listeners) listener();
}

export function setHomeScope(next: HomeScope) {
	if (scope === next) return;
	scope = next;
	if (typeof window !== "undefined") {
		window.localStorage.setItem(HOME_SCOPE_KEY, next);
	}
	emit();
}

function subscribe(onStoreChange: () => void) {
	listeners.add(onStoreChange);
	return () => {
		listeners.delete(onStoreChange);
	};
}

export function useHomeScope(): HomeScope {
	return useSyncExternalStore(
		subscribe,
		() => scope,
		() => "all",
	);
}
