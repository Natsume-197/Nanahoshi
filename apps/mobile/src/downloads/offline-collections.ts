import { useSyncExternalStore } from "react";
import { readSmartState, writeSmartState } from "./files";

const listeners = new Set<() => void>();
let version = 0;

function subscribe(listener: () => void) {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
}

/** Whether a collection is kept on this phone. */
export function useCollectionOffline(
	serverId: string | null,
	collectionId: string,
): boolean {
	return useSyncExternalStore(subscribe, () => {
		void version;
		return serverId
			? readSmartState(serverId).collections.some((c) => c.id === collectionId)
			: false;
	});
}

/** Keeps a collection on the phone, or lets it go; smart downloads do the
 * downloading and clearing on their next sync. */
export function setCollectionOffline(
	serverId: string,
	collection: { id: string; name: string },
	offline: boolean,
) {
	const state = readSmartState(serverId);
	const others = state.collections.filter((c) => c.id !== collection.id);
	writeSmartState(serverId, {
		...state,
		collections: offline ? [...others, collection] : others,
	});
	version++;
	for (const listener of listeners) listener();
}
