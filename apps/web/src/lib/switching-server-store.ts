import { useSyncExternalStore } from "react";

// Tracks whether a server switch is in flight so the dashboard can cover the
// content with a loader. Query keys aren't server-scoped, so during the
// `setActive` round-trip the cache still holds the previous server's data; the
// overlay hides that window until `resetQueries` refetches under the new server.
let isSwitching = false;
const listeners = new Set<() => void>();

export function setSwitchingServer(value: boolean) {
	if (isSwitching === value) return;
	isSwitching = value;
	for (const listener of listeners) listener();
}

function subscribe(onStoreChange: () => void) {
	listeners.add(onStoreChange);
	return () => {
		listeners.delete(onStoreChange);
	};
}

export function useIsSwitchingServer(): boolean {
	return useSyncExternalStore(
		subscribe,
		() => isSwitching,
		() => false,
	);
}
