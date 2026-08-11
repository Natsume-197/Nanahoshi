import { useCallback, useSyncExternalStore } from "react";

const HIDE_CARD_TEXT_STORAGE_KEY = "nanahoshi-hide-card-text";
const listeners = new Set<() => void>();
let memoryHidden = false;
let cachedHidden: boolean | null = null;

function getHideCardText(): boolean {
	if (typeof window === "undefined") return false;
	if (cachedHidden !== null) return cachedHidden;
	try {
		cachedHidden =
			window.localStorage.getItem(HIDE_CARD_TEXT_STORAGE_KEY) === "true";
	} catch {
		cachedHidden = memoryHidden;
	}
	return cachedHidden;
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
	if (event.key !== HIDE_CARD_TEXT_STORAGE_KEY) return;
	cachedHidden = null;
	emitChange();
}

export function storeHideCardText(hidden: boolean) {
	memoryHidden = hidden;
	cachedHidden = hidden;
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
