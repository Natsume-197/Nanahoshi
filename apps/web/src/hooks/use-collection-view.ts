import { useState } from "react";
import type { ViewMode } from "@/components/shared/view-toggle";
import { useDebounce } from "@/hooks/use-debounce";

function readStoredView(storageKey: string): ViewMode {
	if (typeof window === "undefined") return "grid";
	const stored = window.localStorage.getItem(storageKey);
	return stored === "list" ? "list" : "grid";
}

/**
 * Shared UI state for a collection page (search + grid/list toggle + sort).
 * The view choice persists per page under `storageKey`; `query` is the
 * debounced search term to feed into the data query.
 */
export function useCollectionView<TSort extends string>({
	storageKey,
	defaultSort,
}: {
	storageKey: string;
	defaultSort: TSort;
}) {
	const [view, setViewState] = useState<ViewMode>(() =>
		readStoredView(storageKey),
	);
	const [sort, setSort] = useState<TSort>(defaultSort);
	const [search, setSearch] = useState("");
	const query = useDebounce(search.trim(), 300);

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
