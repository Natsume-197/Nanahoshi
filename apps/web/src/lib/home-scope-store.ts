import { useSyncExternalStore } from "react";

// Which format the home dashboard shows. A module store because it's driven
// from the navbar pills (layout tree) and read by the home content — no common
// ancestor below the layout. Persisted so the choice survives reloads.
export type HomeScope = "books" | "audiobooks";

const HOME_SCOPE_KEY = "nanahoshi-home-scope";

function readStored(): HomeScope {
	if (typeof window === "undefined") return "books";
	return window.localStorage.getItem(HOME_SCOPE_KEY) === "audiobooks"
		? "audiobooks"
		: "books";
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
		() => "books",
	);
}
