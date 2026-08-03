import { useRouter } from "@tanstack/react-router";
import {
	type Dispatch,
	type SetStateAction,
	useCallback,
	useRef,
	useState,
} from "react";
import {
	getLocationRestoreKey,
	readUiSnapshot,
} from "@/lib/scroll-restoration";
import { commitUiSnapshotState } from "@/lib/ui-snapshot-state";

/**
 * Local UI state scoped to one browser-history entry.
 *
 * Leaving for a detail page and navigating back restores the value. A fresh
 * navigation gets `defaultValue`, and a reload starts clean because snapshots
 * only live in memory. Nothing is written to the URL or persistent storage.
 */
export function useUiSnapshotState<T>(
	snapshotId: string,
	defaultValue: T,
): [T, Dispatch<SetStateAction<T>>] {
	const router = useRouter();
	const [snapshotKey] = useState(
		() => `${getLocationRestoreKey(router.latestLocation)}:${snapshotId}`,
	);
	const [value, setValueState] = useState<T>(
		() => readUiSnapshot<T>(snapshotKey) ?? defaultValue,
	);
	const valueRef = useRef(value);
	valueRef.current = value;
	const setValue = useCallback<Dispatch<SetStateAction<T>>>(
		(nextValue) => {
			const resolvedValue = commitUiSnapshotState(
				snapshotKey,
				valueRef.current,
				nextValue,
			);
			valueRef.current = resolvedValue;
			setValueState(resolvedValue);
		},
		[snapshotKey],
	);

	return [value, setValue];
}
