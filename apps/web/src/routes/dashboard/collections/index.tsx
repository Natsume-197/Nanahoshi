import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Folder, Loader2, Plus } from "lucide-react";
import { type FormEvent, useState } from "react";
import { toast } from "sonner";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { coverPresets, getCoverPresetUrl } from "@/utils/covers";
import { client, orpc, queryClient } from "@/utils/orpc";

export const Route = createFileRoute("/dashboard/collections/")({
	component: CollectionsPage,
});

function CollectionsPage() {
	const [name, setName] = useState("");
	const listCollectionsQueryOptions = orpc.collections.list.queryOptions();
	const { data: collections, isLoading } = useQuery({
		...listCollectionsQueryOptions,
		staleTime: 30_000,
	});

	const createCollectionMutation = useMutation({
		mutationFn: (input: { name: string }) =>
			client.collections.create({
				name: input.name,
				isPublic: false,
			}),
		onSuccess: async () => {
			await queryClient.invalidateQueries({
				queryKey: listCollectionsQueryOptions.queryKey,
			});
			setName("");
			toast.success("Collection created");
		},
		onError: (error) => {
			toast.error(
				error instanceof Error ? error.message : "Failed to create collection",
			);
		},
	});

	const handleCreate = (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		const normalizedName = name.trim();
		if (!normalizedName) return;

		createCollectionMutation.mutate({
			name: normalizedName,
		});
	};

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
						icon={<Folder className="size-5" />}
						title="No collections yet"
						description="Collections let you group books together. Use the form above to create your first one."
						variant="primary"
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
											{item.bookCount}{" "}
											{item.bookCount === 1 ? "book" : "books"}
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

function CollectionCoverPreview({ covers }: { covers: string[] }) {
	const filenames = covers
		.map((c) => c.split("/").pop() ?? "")
		.filter(Boolean)
		.slice(0, PREVIEW_SLOTS);

	return (
		<div className="flex gap-0.5">
			{Array.from({ length: PREVIEW_SLOTS }, (_, i) => {
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
						key={`empty-slot-${PREVIEW_SLOTS - i}`}
						className="aspect-[2/3] w-0 flex-1 rounded-sm bg-muted/70"
					/>
				);
			})}
		</div>
	);
}
