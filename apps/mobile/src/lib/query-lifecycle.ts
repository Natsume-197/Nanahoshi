import { focusManager, onlineManager } from "@tanstack/react-query";
import * as Network from "expo-network";
import { AppState } from "react-native";
import { createConnectivity } from "./connectivity";
import { simulatedOffline } from "./simulated-offline";

const readConnected = async () =>
	(await Network.getNetworkStateAsync()).isConnected !== false;

/**
 * React Query assumes a browser: window focus and navigator.onLine. On a
 * phone, "focus" is the app returning to the foreground and "online" is the
 * device's network state (see connectivity) — wire both so stale screens
 * refresh when the user comes back and queries pause (instead of failing)
 * while offline. The developer "simulate offline" switch counts as no network
 * too. Returns the cleanup for useMountEffect.
 */
export function connectQueryLifecycle() {
	const appState = AppState.addEventListener("change", (status) => {
		focusManager.setFocused(status === "active");
	});
	onlineManager.setEventListener((setOnline) => {
		let deviceOnline = true;
		const sync = () => setOnline(deviceOnline && !simulatedOffline.isOn());
		const connectivity = createConnectivity({
			read: readConnected,
			isActive: () => AppState.currentState === "active",
			setOnline: (online) => {
				deviceOnline = online;
				sync();
			},
		});
		const network = Network.addNetworkStateListener((state) =>
			connectivity.networkChanged(state.isConnected !== false),
		);
		const foreground = AppState.addEventListener("change", (status) => {
			if (status === "active") void connectivity.foreground();
			else connectivity.background();
		});
		const unsubscribe = simulatedOffline.subscribe(sync);
		sync();
		return () => {
			network.remove();
			foreground.remove();
			unsubscribe();
			connectivity.dispose();
		};
	});
	return () => appState.remove();
}
