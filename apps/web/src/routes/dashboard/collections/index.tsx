import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { coverPresets, getCoverPresetUrl } from "@/utils/covers";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/dashboard/collections/")({
	component: CollectionsPage,
});

function CollectionsPage() {
	const listCollectionsQueryOptions = orpc.collections.list.queryOptions();
	const { data: collections, isLoading } = useQuery({
		...listCollectionsQueryOptions,
		staleTime: 30_000,
	});

	return (
		<div className="space-y-6 p-6 lg:p-8">
			<div className="space-y-1">
				<h1 className="font-bold text-2xl tracking-tight">Collections</h1>
				<p className="text-muted-foreground text-sm">
					Organize your books into groups.
				</p>
			</div>

			<section className="space-y-3">
				{isLoading && (
					<div className="flex items-center gap-2 text-muted-foreground text-sm">
						<Loader2 className="size-4 animate-spin" />
						Loading collections...
					</div>
				)}

				{!isLoading && collections && collections.length === 0 && (
					<EmptyState
						title="No collections yet"
						description="Collections let you group books together."
					/>
				)}

				{collections && collections.length > 0 && (
					<div className="grid grid-cols-1 gap-8 sm:grid-cols-2 xl:grid-cols-3">
						{collections.map((item) => {
							return (
								<Link
									key={item.id}
									to="/dashboard/collections/$collectionId"
									params={{ collectionId: item.id }}
									className="group block"
								>
									<div className="overflow-hidden rounded-lg">
										<CollectionCoverPreview covers={item.previewCovers} />
									</div>
									<div className="pt-2">
										<p className="truncate font-semibold text-lg">
											{item.name}
										</p>
										<p className="text-muted-foreground text-xs">
											{item.bookCount} {item.bookCount === 1 ? "book" : "books"}
										</p>
									</div>
								</Link>
							);
						})}
					</div>
				)}
			</section>
		</div>
	);
}

const PREVIEW_SLOTS = 5;
const PREVIEW_SLOT_KEYS = Array.from(
	{ length: PREVIEW_SLOTS },
	(_, i) => `slot-${i}`,
);

function CollectionCoverPreview({ covers }: { covers: string[] }) {
	const filenames = covers
		.map((c) => c.split("/").pop() ?? "")
		.filter(Boolean)
		.slice(0, PREVIEW_SLOTS);

	return (
		<div className="flex gap-0.5">
			{PREVIEW_SLOT_KEYS.map((slotKey, i) => {
				const name = filenames[i];
				return name ? (
					<img
						key={name}
						src={getCoverPresetUrl(name, coverPresets.small)}
						alt=""
						className="w-0 flex-1 rounded-sm object-contain"
						loading="lazy"
					/>
				) : (
					<div
						key={slotKey}
						className="aspect-[2/3] w-0 flex-1 rounded-sm bg-muted/70"
					/>
				);
			})}
		</div>
	);
}
