import type { ReaderBookmark } from "./types";

const keyFor = (uuid: string) => `nanahoshi-reader-bookmark:${uuid}`;

export function loadLocalBookmark(uuid: string): ReaderBookmark | undefined {
	if (typeof window === "undefined") return undefined;
	try {
		const raw = window.localStorage.getItem(keyFor(uuid));
		return raw ? (JSON.parse(raw) as ReaderBookmark) : undefined;
	} catch {
		return undefined;
	}
}

export function saveLocalBookmark(uuid: string, bookmark: ReaderBookmark) {
	try {
		window.localStorage.setItem(keyFor(uuid), JSON.stringify(bookmark));
	} catch {
		// no-op
	}
}
