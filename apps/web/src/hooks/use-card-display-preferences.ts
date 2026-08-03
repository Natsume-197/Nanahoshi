import { useCallback, useSyncExternalStore } from "react";

const HIDE_CARD_TEXT_STORAGE_KEY = "nanahoshi-hide-card-text";
const listeners = new Set<() => void>();
let memoryHidden = false;

function getHideCardText(): boolean {
	if (typeof window === "undefined") return false;
	try {
		return window.localStorage.getItem(HIDE_CARD_TEXT_STORAGE_KEY) === "true";
	} catch {
		return memoryHidden;
	}
}

function subscribe(listener: () => void) {
	if (listeners.size === 0) window.addEventListener("storage", handleStorage);
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
		if (listeners.size === 0)
			window.removeEventListener("storage", handleStorage);
	};
}

function emitChange() {
	for (const listener of listeners) listener();
}

function handleStorage(event: StorageEvent) {
	if (event.key === HIDE_CARD_TEXT_STORAGE_KEY) emitChange();
}

export function storeHideCardText(hidden: boolean) {
	memoryHidden = hidden;
	try {
		window.localStorage.setItem(HIDE_CARD_TEXT_STORAGE_KEY, String(hidden));
	} catch {
		// The current tab still honors the preference when storage is unavailable.
	}
	emitChange();
}

/** Device-local preference for the text shown below dashboard media covers. */
export function useHideCardText() {
	const hidden = useSyncExternalStore(subscribe, getHideCardText, () => false);
	const setHidden = useCallback((next: boolean) => storeHideCardText(next), []);
	return [hidden, setHidden] as const;
}
