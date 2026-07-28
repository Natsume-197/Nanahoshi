import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import {
	CollectionCard,
	CollectionCardSkeleton,
} from "@/components/shared/collection-card";
import { CollectionSearch } from "@/components/shared/collection-search";
import { CollectionToolbar } from "@/components/shared/collection-toolbar";
import { CreateCollectionButton } from "@/components/shared/create-collection-button";
import { EmptyState } from "@/components/shared/empty-state";
import { type SortOption, SortSelect } from "@/components/shared/sort-select";
import { useAbilities } from "@/hooks/use-abilities";
import { useUiSnapshotState } from "@/hooks/use-ui-snapshot-state";
import { m } from "@/paraglide/messages";
import { orpc } from "@/utils/orpc";

// Compact square collection tiles pack tighter than the old wide preview, so the
// grid tracks card width rather than a fixed column count.
const COLLECTION_GRID_CLASS =
	"grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-2";

type SortMode = "name" | "books";

const SORT_OPTIONS: readonly SortOption<SortMode>[] = [
	{ value: "name", label: "Name" },
	{ value: "books", label: "Most books" },
];

const SKELETON_KEYS = Array.from(
	{ length: 6 },
	(_, i) => `collection-skeleton-${i}`,
);

export const Route = createFileRoute("/dashboard/collections/")({
	component: CollectionsPage,
});

function CollectionsPage() {
	const { can, isLoading: abilitiesLoading } = useAbilities();
	const canRead = can("collection", "read");
	const [sort, setSort] = useUiSnapshotState<SortMode>(
		"collections-sort",
		"name",
	);
	const [search, setSearch] = useUiSnapshotState("collections-search", "");

	const { data: collections, isLoading } = useQuery({
		...orpc.collections.list.queryOptions(),
		staleTime: 30_000,
		enabled: canRead,
	});

	const query = search.trim().toLowerCase();
	const isSearching = query.length > 0;
	const total = collections?.length ?? 0;

	// Collections load fully (user-owned, few), so filtering and sorting run in
	// memory rather than on the server.
	const visible = useMemo(() => {
		let list = collections ?? [];
		if (query) {
			list = list.filter((c) => c.name.toLowerCase().includes(query));
		}
		return [...list].sort((a, b) =>
			sort === "name"
				? a.name.localeCompare(b.name)
				: b.bookCount - a.bookCount,
		);
	}, [collections, query, sort]);

	if (!abilitiesLoading && !canRead) {
		return (
			<div className="p-6 lg:p-8">
				<EmptyState
					title="Collections unavailable"
					description="You don't have permission to view collections."
				/>
			</div>
		);
	}

	return (
		<div className="space-y-6 p-6 lg:p-8">
			<CollectionToolbar
				title="Collections"
				subtitle={
					!isLoading && !isSearching && total > 0
						? `${total} ${total === 1 ? "collection" : "collections"}`
						: undefined
				}
				actions={
					isLoading ? undefined : (
						<>
							{total > 0 && (
								<>
									<CollectionSearch
										value={search}
										onChange={setSearch}
										placeholder="Search collections…"
										ariaLabel="Search collections"
									/>
									<SortSelect
										value={sort}
										onChange={setSort}
										options={SORT_OPTIONS}
										ariaLabel="Sort collections"
									/>
								</>
							)}
							<CreateCollectionButton />
						</>
					)
				}
			/>

			{isLoading && (
				<div className={COLLECTION_GRID_CLASS}>
					{SKELETON_KEYS.map((key) => (
						<CollectionCardSkeleton key={key} />
					))}
				</div>
			)}

			{!isLoading && total === 0 && (
				<EmptyState
					title="No collections yet"
					description="Collections let you group books together."
				/>
			)}

			{!isLoading && total > 0 && visible.length === 0 && (
				<EmptyState
					title="No matches"
					description={`No collections match “${search.trim()}”.`}
				/>
			)}

			{visible.length > 0 && (
				<div className={COLLECTION_GRID_CLASS}>
					{visible.map((item) => (
						<CollectionCard
							key={item.id}
							id={item.id}
							name={item.name}
							previewCovers={item.previewCovers}
							subtitle={m["media.item_count"]({ count: item.bookCount })}
							isPublic={item.isPublic}
						/>
					))}
				</div>
			)}
		</div>
	);
}
