import type { QueryClient } from "@tanstack/react-query";
import { File, Paths } from "expo-file-system";
import { AppState } from "react-native";
import { restoreQueries, serializeQueries } from "./query-snapshot";

// Written at most every half minute, off the busy moments (a save serializes
// the whole snapshot on the JS thread), and right away when the app leaves
// the screen (it may never come back).
const SAVE_DELAY = 30_000;
const IDLE_TIMEOUT = 3000;

const snapshotFile = (serverUrl: string) =>
	new File(
		Paths.cache,
		"query-cache",
		`${serverUrl.replace(/[^a-z0-9]/gi, "_")}.json`,
	);

/** Synchronous on purpose: the first frame already has the saved screens. */
export function restoreSavedQueries(client: QueryClient, serverUrl: string) {
	const file = snapshotFile(serverUrl);
	try {
		if (file.exists) restoreQueries(client, file.textSync());
	} catch {
		forgetSavedQueries(serverUrl);
	}
}

export function forgetSavedQueries(serverUrl: string) {
	try {
		const file = snapshotFile(serverUrl);
		if (file.exists) file.delete();
	} catch {}
}

/** Keeps the snapshot current; returns the cleanup for useMountEffect. */
export function keepQueriesSaved(client: QueryClient, serverUrl: string) {
	let timer: ReturnType<typeof setTimeout> | undefined;
	let idle: number | undefined;
	let dirty = false;

	const save = () => {
		timer = undefined;
		idle = undefined;
		if (!dirty) return;
		dirty = false;
		try {
			const text = serializeQueries(client);
			if (!text) return;
			const file = snapshotFile(serverUrl);
			file.parentDirectory.create({ intermediates: true, idempotent: true });
			file.write(text);
		} catch {}
	};

	const unsubscribe = client.getQueryCache().subscribe((event) => {
		if (event.type !== "updated" || event.action.type !== "success") return;
		dirty = true;
		if (timer || idle !== undefined) return;
		timer = setTimeout(() => {
			idle = requestIdleCallback(save, { timeout: IDLE_TIMEOUT });
		}, SAVE_DELAY);
	});
	const appState = AppState.addEventListener("change", (status) => {
		if (status === "background") save();
	});

	return () => {
		unsubscribe();
		appState.remove();
		if (timer) clearTimeout(timer);
		if (idle !== undefined) cancelIdleCallback(idle);
	};
}
