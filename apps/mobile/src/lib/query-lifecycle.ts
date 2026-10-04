import { focusManager, onlineManager } from "@tanstack/react-query";
import * as Network from "expo-network";
import { AppState } from "react-native";

/**
 * React Query assumes a browser: window focus and navigator.onLine. On a
 * phone, "focus" is the app returning to the foreground and "online" is the
 * device's network state — wire both so stale screens refresh when the user
 * comes back and queries pause (instead of failing) while offline.
 * Returns the cleanup for useMountEffect.
 */
export function connectQueryLifecycle() {
	const appState = AppState.addEventListener("change", (status) => {
		focusManager.setFocused(status === "active");
	});
	onlineManager.setEventListener((setOnline) => {
		const subscription = Network.addNetworkStateListener((state) => {
			setOnline(state.isConnected !== false);
		});
		return () => subscription.remove();
	});
	return () => appState.remove();
}
