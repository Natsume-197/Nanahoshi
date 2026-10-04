import { File, Paths } from "expo-file-system";
import { useSyncExternalStore } from "react";
import { useConnection } from "@/providers/app-provider";
import {
	type AudioBookmark,
	MAX_LABEL,
	newBookmark,
	parseBookmarks,
	withBookmark,
} from "./bookmarks-model";

export type { AudioBookmark } from "./bookmarks-model";

// One JSON file per server and book: uuids are global, but two servers are
// two libraries, like the web's per-origin localStorage.
function bookmarksFile(serverUrl: string, uuid: string) {
	const server = serverUrl.replace(/^https?:\/\//, "").replace(/[^\w.-]/g, "_");
	return new File(Paths.document, "audio-bookmarks", server, `${uuid}.json`);
}

const newId = () =>
	`${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

const cache = new Map<string, AudioBookmark[]>();
const listeners = new Set<() => void>();
const EMPTY: AudioBookmark[] = [];

function read(serverUrl: string, uuid: string): AudioBookmark[] {
	const key = `${serverUrl}|${uuid}`;
	const cached = cache.get(key);
	if (cached) return cached;
	let list: AudioBookmark[] = EMPTY;
	try {
		const file = bookmarksFile(serverUrl, uuid);
		if (file.exists) list = parseBookmarks(JSON.parse(file.textSync()));
	} catch {
		// A broken file reads as no bookmarks; the next save rewrites it.
	}
	cache.set(key, list);
	return list;
}

function write(serverUrl: string, uuid: string, list: AudioBookmark[]) {
	cache.set(`${serverUrl}|${uuid}`, list);
	for (const listener of listeners) listener();
	try {
		const file = bookmarksFile(serverUrl, uuid);
		file.parentDirectory.create({
			intermediates: true,
			idempotent: true,
		});
		file.write(JSON.stringify(list));
	} catch {
		// Kept in memory for this session even if the disk refuses.
	}
}

/** Live bookmarks of one book, plus the edits the player offers. */
export function useBookmarks(uuid: string) {
	const { serverUrl } = useConnection();
	const list = useSyncExternalStore(
		(listener) => {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
		() => read(serverUrl, uuid),
	);
	return {
		list,
		add: (time: number) =>
			write(serverUrl, uuid, withBookmark(list, newBookmark(time, newId()))),
		remove: (id: string) =>
			write(
				serverUrl,
				uuid,
				list.filter((bookmark) => bookmark.id !== id),
			),
		rename: (id: string, label: string) =>
			write(
				serverUrl,
				uuid,
				list.map((bookmark) =>
					bookmark.id === id
						? { ...bookmark, label: label.trim().slice(0, MAX_LABEL) }
						: bookmark,
				),
			),
	};
}
