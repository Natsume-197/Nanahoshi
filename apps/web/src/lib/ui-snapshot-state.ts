import { saveUiSnapshot } from "@/lib/scroll-restoration";

export type UiSnapshotStateAction<T> = T | ((previousValue: T) => T);

/** Resolve and persist a state update synchronously, before navigation can start. */
export function commitUiSnapshotState<T>(
	snapshotKey: string,
	previousValue: T,
	nextValue: UiSnapshotStateAction<T>,
): T {
	const resolvedValue =
		typeof nextValue === "function"
			? (nextValue as (previous: T) => T)(previousValue)
			: nextValue;
	saveUiSnapshot(snapshotKey, resolvedValue);
	return resolvedValue;
}
