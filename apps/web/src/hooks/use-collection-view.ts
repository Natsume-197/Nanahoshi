import { useRouter } from "@tanstack/react-router";
import { useState } from "react";
import type { ViewMode } from "@/components/shared/view-toggle";
import { useDebounce } from "@/hooks/use-debounce";
import { useOnUnmount } from "@/hooks/use-on-unmount";
import {
	getLocationRestoreKey,
	readUiSnapshot,
	saveUiSnapshot,
} from "@/lib/scroll-restoration";

function readStoredView(storageKey: string): ViewMode {
	if (typeof window === "undefined") return "grid";
	const stored = window.localStorage.getItem(storageKey);
	return stored === "list" ? "list" : "grid";
}

type CollectionViewSnapshot = {
	sort: string;
	search: string;
};

/**
 * Shared UI state for a collection page (search + grid/list toggle + sort).
 * The view choice persists per page under `storageKey`; `query` is the
 * debounced search term to feed into the data query.
 *
 * Sort and search are snapshotted per history entry: a back-nav re-creates
 * the exact list (and query key) the user left, so the cached pages rehydrate
 * at full height and scroll restoration lands on the same spot.
 */
export function useCollectionView<TSort extends string>({
	storageKey,
	defaultSort,
}: {
	storageKey: string;
	defaultSort: TSort;
}) {
	const router = useRouter();
	const [snapshotKey] = useState(
		() => `${getLocationRestoreKey(router.latestLocation)}:${storageKey}`,
	);
	const [view, setViewState] = useState<ViewMode>(() =>
		readStoredView(storageKey),
	);
	const [sort, setSort] = useState<TSort>(() => {
		const saved = readUiSnapshot<CollectionViewSnapshot>(snapshotKey);
		return (saved?.sort as TSort | undefined) ?? defaultSort;
	});
	const [search, setSearch] = useState(
		() => readUiSnapshot<CollectionViewSnapshot>(snapshotKey)?.search ?? "",
	);
	const query = useDebounce(search.trim(), 300);

	useOnUnmount(() => saveUiSnapshot(snapshotKey, { sort, search }));

	const setView = (next: ViewMode) => {
		setViewState(next);
		if (typeof window !== "undefined") {
			window.localStorage.setItem(storageKey, next);
		}
	};

	return {
		view,
		setView,
		sort,
		setSort,
		search,
		setSearch,
		query,
		isSearching: query.length > 0,
	};
}
