import { useSyncExternalStore } from "react";

function subscribe(onStoreChange: () => void) {
	window.addEventListener("online", onStoreChange);
	window.addEventListener("offline", onStoreChange);
	return () => {
		window.removeEventListener("online", onStoreChange);
		window.removeEventListener("offline", onStoreChange);
	};
}

/** Live `navigator.onLine` (assumed online during SSR). */
export function useOnlineStatus(): boolean {
	return useSyncExternalStore(
		subscribe,
		() => navigator.onLine,
		() => true,
	);
}
