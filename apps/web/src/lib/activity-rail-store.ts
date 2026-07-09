import { useSyncExternalStore } from "react";

// Ephemeral open/closed state for the friends activity sidebar.
// A module store rather than React state because the toggle is triggered from
// separate component trees — the header button and the mobile bottom nav — that
// don't share a common ancestor below the layout. Not persisted: it always
// starts closed and opens only on an explicit toggle.
let isOpen = false;
const listeners = new Set<() => void>();

function emit() {
	for (const listener of listeners) listener();
}

export function setActivityRailOpen(value: boolean) {
	if (isOpen === value) return;
	isOpen = value;
	emit();
}

export function toggleActivityRail() {
	setActivityRailOpen(!isOpen);
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
