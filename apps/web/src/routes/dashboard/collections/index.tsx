import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Folder, Loader2, Plus, Trash2 } from "lucide-react";
import { type FormEvent, useState } from "react";
import { toast } from "sonner";
import { EmptyState } from "@/components/shared/empty-state";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

	const deleteCollectionMutation = useMutation({
		mutationFn: (collectionId: string) =>
			client.collections.delete({ collectionId }),
		onSuccess: async () => {
			await queryClient.invalidateQueries({
				queryKey: listCollectionsQueryOptions.queryKey,
			});
			toast.success("Collection deleted");
		},
		onError: (error) => {
			toast.error(
				error instanceof Error ? error.message : "Failed to delete collection",
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

			<section className="rounded-xl border border-border/60 bg-card p-4">
				<form
					className="flex flex-col gap-2 sm:flex-row"
					onSubmit={(event) => void handleCreate(event)}
				>
					<Input
						id="collection-name"
						value={name}
						onChange={(event) => setName(event.target.value)}
						placeholder="New collection name..."
						maxLength={80}
					/>
					<Button
						type="submit"
						className="sm:w-auto"
						disabled={
							createCollectionMutation.isPending || name.trim().length === 0
						}
					>
						{createCollectionMutation.isPending ? (
							<Loader2 className="mr-1.5 size-4 animate-spin" />
						) : (
							<Plus className="mr-1.5 size-4" />
						)}
						Create
					</Button>
				</form>
			</section>

			<section className="space-y-3">
				<h2 className="font-semibold text-lg">Your collections</h2>

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
					<div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
						{collections.map((item) => {
							const isDeleting =
								deleteCollectionMutation.isPending &&
								deleteCollectionMutation.variables === item.id;

							return (
								<article
									key={item.id}
									className="overflow-hidden rounded-xl border border-border/60 bg-card shadow-black/10 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-black/15 hover:shadow-md"
								>
									<Link
										to="/dashboard/collections/$collectionId"
										params={{ collectionId: item.id }}
										className="group block p-4"
									>
										<div className="mb-2 inline-flex size-10 items-center justify-center rounded-lg bg-primary/15 text-primary shadow-primary/10 shadow-sm">
											<Folder className="size-5" />
										</div>
										<p className="truncate font-semibold text-base">
											{item.name}
										</p>
										<p className="text-muted-foreground text-xs">
											{item.bookCount} {item.bookCount === 1 ? "book" : "books"}
										</p>
									</Link>

									<div className="flex justify-end border-border/60 border-t p-2">
										<AlertDialog>
											<AlertDialogTrigger asChild>
												<Button
													type="button"
													size="xs"
													variant="ghost"
													disabled={isDeleting}
												>
													<Trash2 className="size-3.5" />
													Delete
												</Button>
											</AlertDialogTrigger>
											<AlertDialogContent>
												<AlertDialogHeader>
													<AlertDialogTitle>
														Delete &ldquo;{item.name}&rdquo;?
													</AlertDialogTitle>
													<AlertDialogDescription>
														This will permanently delete this collection. Books
														in it will not be removed from your library.
													</AlertDialogDescription>
												</AlertDialogHeader>
												<AlertDialogFooter>
													<AlertDialogCancel>Cancel</AlertDialogCancel>
													<AlertDialogAction
														onClick={() =>
															deleteCollectionMutation.mutate(item.id)
														}
														className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
													>
														Delete
													</AlertDialogAction>
												</AlertDialogFooter>
											</AlertDialogContent>
										</AlertDialog>
									</div>
								</article>
							);
						})}
					</div>
				)}
			</section>
		</div>
	);
}
