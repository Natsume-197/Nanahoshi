import { focusManager, onlineManager } from "@tanstack/react-query";
import * as Network from "expo-network";
import { AppState } from "react-native";
import { simulatedOffline } from "./simulated-offline";

/**
 * React Query assumes a browser: window focus and navigator.onLine. On a
 * phone, "focus" is the app returning to the foreground and "online" is the
 * device's network state — wire both so stale screens refresh when the user
 * comes back and queries pause (instead of failing) while offline. The
 * developer "simulate offline" switch counts as no network too.
 * Returns the cleanup for useMountEffect.
 */
export function connectQueryLifecycle() {
	const appState = AppState.addEventListener("change", (status) => {
		focusManager.setFocused(status === "active");
	});
	onlineManager.setEventListener((setOnline) => {
		let deviceOnline = true;
		const sync = () => setOnline(deviceOnline && !simulatedOffline.isOn());
		const subscription = Network.addNetworkStateListener((state) => {
			deviceOnline = state.isConnected !== false;
			sync();
		});
		const unsubscribe = simulatedOffline.subscribe(sync);
		sync();
		return () => {
			subscription.remove();
			unsubscribe();
		};
	});
	return () => appState.remove();
}
