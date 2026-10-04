import * as SecureStore from "expo-secure-store";
import { useSyncExternalStore } from "react";
import { Appearance } from "react-native";
import {
	type AppearancePreference,
	parseAppearancePreference,
} from "./preferences";

const KEY = "nanahoshi.appearance";
let current = parseAppearancePreference(SecureStore.getItem(KEY));
const listeners = new Set<() => void>();

/** Overrides what `useColorScheme` reports app-wide, so every palette and
 * native control follows without a restart. Called once at startup. */
export function applyStoredAppearance() {
	apply(current);
}

function apply(preference: AppearancePreference) {
	Appearance.setColorScheme(
		preference === "system" ? "unspecified" : preference,
	);
}

export async function setAppearance(preference: AppearancePreference) {
	if (preference === "system") await SecureStore.deleteItemAsync(KEY);
	else await SecureStore.setItemAsync(KEY, preference);
	current = preference;
	apply(preference);
	for (const listener of listeners) listener();
}

export function useAppearancePreference(): AppearancePreference {
	return useSyncExternalStore(
		(listener) => {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
		() => current,
	);
}
