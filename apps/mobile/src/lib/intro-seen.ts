import * as SecureStore from "expo-secure-store";

// Versioned: a new story is worth telling again to those who saw the old one.
const KEY = "nanahoshi.intro_seen.v2";

export function introSeen(): boolean {
	return SecureStore.getItem(KEY) === "1";
}

export function markIntroSeen() {
	if (!introSeen()) void SecureStore.setItemAsync(KEY, "1");
}
