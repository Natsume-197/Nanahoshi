import * as SecureStore from "expo-secure-store";
import { useSyncExternalStore } from "react";
import { guardFetch } from "./network-guard";
import { createPersistedFlag } from "./persisted-flag";

const KEY = "nanahoshi.simulated-offline";

/** Developer setting: the app behaves as if the phone had no connection,
 * without turning the network off. Survives restarts. */
export const simulatedOffline = createPersistedFlag({
	read: () => SecureStore.getItem(KEY) === "1",
	write: (on) =>
		on ? SecureStore.setItemAsync(KEY, "1") : SecureStore.deleteItemAsync(KEY),
});

let installed = false;

/** Routes every fetch (oRPC, auth, uploads) through the switch. */
export function installNetworkGuard() {
	if (installed) return;
	installed = true;
	globalThis.fetch = guardFetch(
		globalThis.fetch.bind(globalThis),
		simulatedOffline.isOn,
	) as typeof fetch;
}

export function assertNetwork() {
	if (simulatedOffline.isOn()) throw new TypeError("Network request failed");
}

export function useSimulatedOffline(): boolean {
	return useSyncExternalStore(
		simulatedOffline.subscribe,
		simulatedOffline.isOn,
	);
}
