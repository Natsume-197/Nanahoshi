import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { CollectionCoverPreview } from "@/components/shared/collection-cover-preview";
import { CollectionSearch } from "@/components/shared/collection-search";
import { CollectionToolbar } from "@/components/shared/collection-toolbar";
import { EmptyState } from "@/components/shared/empty-state";
import { type SortOption, SortSelect } from "@/components/shared/sort-select";
import { Skeleton } from "@/components/ui/skeleton";
import { useAbilities } from "@/hooks/use-abilities";
import { orpc } from "@/utils/orpc";

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
	const [sort, setSort] = useState<SortMode>("name");
	const [search, setSearch] = useState("");

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
					!isLoading && total > 0 ? (
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
					) : undefined
				}
			/>

			{isLoading && (
				<div className="grid grid-cols-1 gap-8 sm:grid-cols-2 xl:grid-cols-3">
					{SKELETON_KEYS.map((key) => (
						<div key={key} className="space-y-2">
							<Skeleton className="aspect-[5/3] w-full rounded-lg" />
							<Skeleton className="h-5 w-1/2 rounded" />
						</div>
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
				<div className="grid grid-cols-1 gap-8 sm:grid-cols-2 xl:grid-cols-3">
					{visible.map((item) => (
						<Link
							key={item.id}
							to="/dashboard/collections/$collectionId"
							params={{ collectionId: item.id }}
							preload="intent"
							className="group block"
						>
							<div className="overflow-hidden rounded-lg">
								<CollectionCoverPreview covers={item.previewCovers} />
							</div>
							<div className="pt-2">
								<p className="truncate font-semibold text-lg">{item.name}</p>
								<p className="text-muted-foreground text-xs">
									{item.bookCount} {item.bookCount === 1 ? "book" : "books"}
								</p>
							</div>
						</Link>
					))}
				</div>
			)}
		</div>
	);
}
