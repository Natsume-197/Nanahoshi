import * as SecureStore from "expo-secure-store";
import { useSyncExternalStore } from "react";
import { createPersistedFlag } from "@/lib/persisted-flag";

const SMART_KEY = "nanahoshi.smart-downloads";
const CELLULAR_KEY = "nanahoshi.smart-downloads-cellular";

/** On unless the user turned it off. */
export const smartDownloads = createPersistedFlag({
	read: () => SecureStore.getItem(SMART_KEY) !== "0",
	write: (on) =>
		on
			? SecureStore.deleteItemAsync(SMART_KEY)
			: SecureStore.setItemAsync(SMART_KEY, "0"),
});

/** Off unless the user allowed it: audiobooks weigh hundreds of MB. */
export const smartOnCellular = createPersistedFlag({
	read: () => SecureStore.getItem(CELLULAR_KEY) === "1",
	write: (on) =>
		on
			? SecureStore.setItemAsync(CELLULAR_KEY, "1")
			: SecureStore.deleteItemAsync(CELLULAR_KEY),
});

export function useSmartDownloads() {
	return useSyncExternalStore(smartDownloads.subscribe, smartDownloads.isOn);
}

export function useSmartOnCellular() {
	return useSyncExternalStore(smartOnCellular.subscribe, smartOnCellular.isOn);
}
