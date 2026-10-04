import * as SecureStore from "expo-secure-store";
import { useSyncExternalStore } from "react";

// Chapter by default: the span a listener plans around; a whole book's bar
// barely moves in a sitting. Remembered across launches, like the web's.
export type TimeScope = "chapter" | "book";

const SCOPE_KEY = "nanahoshi.audio-progress-scope";

function readScope(): TimeScope {
	try {
		return SecureStore.getItem(SCOPE_KEY) === "book" ? "book" : "chapter";
	} catch {
		return "chapter";
	}
}

let scope: TimeScope = readScope();
const listeners = new Set<() => void>();

export function setTimeScope(next: TimeScope) {
	scope = next;
	try {
		SecureStore.setItem(SCOPE_KEY, next);
	} catch {
		// Preference only.
	}
	for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
	listeners.add(listener);
	return () => listeners.delete(listener);
}

/** The seek bar's span; every time the player shows follows it. */
export function useTimeScope() {
	return useSyncExternalStore(subscribe, () => scope);
}
