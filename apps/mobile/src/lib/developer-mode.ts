import * as SecureStore from "expo-secure-store";
import { useSyncExternalStore } from "react";
import { createPersistedFlag } from "./persisted-flag";
import { simulatedOffline } from "./simulated-offline";

const KEY = "nanahoshi.developer-mode";

/** Shows Settings → Developer; unlocked by tapping the app version. */
export const developerMode = createPersistedFlag({
	read: () => SecureStore.getItem(KEY) === "1",
	write: (on) =>
		on ? SecureStore.setItemAsync(KEY, "1") : SecureStore.deleteItemAsync(KEY),
});

/** Hiding the section also turns its tools off, so nothing stays active
 * where it can't be seen. */
export async function hideDeveloperOptions() {
	await simulatedOffline.set(false);
	await developerMode.set(false);
}

export function useDeveloperMode(): boolean {
	return useSyncExternalStore(developerMode.subscribe, developerMode.isOn);
}
