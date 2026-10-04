import * as SecureStore from "expo-secure-store";

const KEY = "nanahoshi.server-url";

/**
 * Nanahoshi is self-hosted, so the app can't ship with an API origin baked in:
 * the user types their server's address once and it is kept on the device.
 */
export function readServerUrl(): string | null {
	return SecureStore.getItem(KEY);
}

export async function writeServerUrl(url: string | null) {
	if (url) await SecureStore.setItemAsync(KEY, url);
	else await SecureStore.deleteItemAsync(KEY);
}

/** Accepts what people actually type ("192.168.1.20:7331", "books.example.com/")
 * and returns a bare origin, or null when it can't be an http(s) URL. */
export function normalizeServerUrl(input: string): string | null {
	const trimmed = input.trim();
	if (!trimmed) return null;
	const withScheme = /^https?:\/\//i.test(trimmed)
		? trimmed
		: `http://${trimmed}`;
	try {
		const url = new URL(withScheme);
		if (url.protocol !== "http:" && url.protocol !== "https:") return null;
		return `${url.protocol}//${url.host}`;
	} catch {
		return null;
	}
}
