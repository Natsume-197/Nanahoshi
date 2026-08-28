import { useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { useDebounce } from "@/hooks/use-debounce";
import { useOnUnmount } from "@/hooks/use-on-unmount";
import {
	getLocationRestoreKey,
	readUiSnapshot,
	saveUiSnapshot,
} from "@/lib/scroll-restoration";

type CollectionViewSnapshot = {
	sort: string;
	search: string;
};

/**
 * Shared UI state for a collection page (search + sort). `query` is the
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
	const [sort, setSort] = useState<TSort>(() => {
		const saved = readUiSnapshot<CollectionViewSnapshot>(snapshotKey);
		return (saved?.sort as TSort | undefined) ?? defaultSort;
	});
	const [search, setSearch] = useState(
		() => readUiSnapshot<CollectionViewSnapshot>(snapshotKey)?.search ?? "",
	);
	const query = useDebounce(search.trim(), 300);

	useOnUnmount(() => saveUiSnapshot(snapshotKey, { sort, search }));

	return {
		sort,
		setSort,
		search,
		setSearch,
		query,
		isSearching: query.length > 0,
	};
}
