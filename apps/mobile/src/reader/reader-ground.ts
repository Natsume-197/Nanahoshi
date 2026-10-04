import * as SecureStore from "expo-secure-store";

const KEY = "nanahoshi.reader-ground";
// Only formats React Native can paint; anything else keeps the app colour.
const COLOR = /^#[0-9a-f]{3,8}$|^(rgb|hsl)a?\([\d.,\s%]+\)$/i;

let current = read();

function read() {
	try {
		const stored = SecureStore.getItem(KEY);
		return stored && COLOR.test(stored) ? stored : null;
	} catch {
		return null;
	}
}

/** The reader theme's background from the last book, painted before the next
 * one loads so opening a book never flashes the app's colour in between. */
export function readerGround(): string | null {
	return current;
}

export function rememberReaderGround(color: string) {
	if (color === current || !COLOR.test(color)) return;
	current = color;
	void SecureStore.setItemAsync(KEY, color).catch(() => {});
}
