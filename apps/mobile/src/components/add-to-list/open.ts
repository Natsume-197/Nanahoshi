import { router } from "expo-router";
import { useSyncExternalStore } from "react";

export type AddToListTarget = { uuid: string; kind: "ebook" | "audiobook" };

// Android shows one Material sheet for the whole app, hosted under the tabs;
// iOS keeps the page-sheet route.
let target: AddToListTarget | null = null;
const listeners = new Set<() => void>();
const emit = () => {
	for (const listener of listeners) listener();
};

export function openAddToList(next: AddToListTarget) {
	if (process.env.EXPO_OS === "ios")
		return router.push({ pathname: "/add-to-list/[uuid]", params: next });
	target = next;
	emit();
}

export function closeAddToList() {
	target = null;
	emit();
}

export function useAddToListTarget() {
	return useSyncExternalStore(
		(listener) => {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
		() => target,
	);
}
