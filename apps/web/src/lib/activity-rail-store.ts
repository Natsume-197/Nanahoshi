import { useSyncExternalStore } from "react";

// Open/closed state for the right-hand Activity rail (Spotify-style). Lives in a
// module store rather than React state because the toggle is triggered from
// three separate component trees — the header button, the left sidebar nav, and
// the mobile bottom nav — that don't share a common ancestor below the layout.
const STORAGE_KEY = "nanahoshi:activity-rail-open";

let isOpen = false;
const listeners = new Set<() => void>();

function emit() {
	for (const listener of listeners) listener();
}

export function setActivityRailOpen(value: boolean) {
	if (isOpen === value) return;
	isOpen = value;
	if (typeof window !== "undefined") {
		window.localStorage.setItem(STORAGE_KEY, value ? "1" : "0");
	}
	emit();
}

export function toggleActivityRail() {
	setActivityRailOpen(!isOpen);
}

// Restore the persisted choice after mount. Reading localStorage during render
// (or in getSnapshot) would mismatch the SSR snapshot, so the layout calls this
// once on mount instead.
export function hydrateActivityRail() {
	if (typeof window === "undefined") return;
	setActivityRailOpen(window.localStorage.getItem(STORAGE_KEY) === "1");
}

function subscribe(onStoreChange: () => void) {
	listeners.add(onStoreChange);
	return () => {
		listeners.delete(onStoreChange);
	};
}

export function useActivityRailOpen(): boolean {
	return useSyncExternalStore(
		subscribe,
		() => isOpen,
		() => false,
	);
}
