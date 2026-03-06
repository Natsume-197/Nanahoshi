import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FolderPlus, Loader2, Plus, X } from "lucide-react";
import { type FormEvent, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuCheckboxItem,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { client, orpc } from "@/utils/orpc";

interface BookCollectionsPanelProps {
	bookUuid: string;
}

export function BookCollectionsPanel({ bookUuid }: BookCollectionsPanelProps) {
	const queryClient = useQueryClient();
	const [newCollectionName, setNewCollectionName] = useState("");
	const [newCollectionIsPublic, setNewCollectionIsPublic] = useState(false);
	const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);

	const membershipsQueryOptions =
		orpc.collections.listBookMemberships.queryOptions({
			input: { bookUuid },
		});
	const membershipsQuery = useQuery(membershipsQueryOptions);

	const createCollectionMutation = useMutation({
		mutationFn: (input: { name: string; isPublic: boolean }) =>
			client.collections.create({
				name: input.name,
				isPublic: input.isPublic,
				addBookUuid: bookUuid,
			}),
		onSuccess: async () => {
			await queryClient.invalidateQueries({
				queryKey: membershipsQueryOptions.queryKey,
			});
			toast.success("Collection created");
		},
		onError: (error) => {
			toast.error(
				error instanceof Error ? error.message : "Failed to create collection",
			);
		},
	});

	const toggleMembershipMutation = useMutation({
		mutationFn: (input: { collectionId: string; inCollection: boolean }) =>
			client.collections.setBookMembership({
				collectionId: input.collectionId,
				bookUuid,
				inCollection: input.inCollection,
			}),
		onSuccess: async (_, variables) => {
			await queryClient.invalidateQueries({
				queryKey: membershipsQueryOptions.queryKey,
			});
			toast.success(
				variables.inCollection
					? "Added to collection"
					: "Removed from collection",
			);
		},
		onError: (error) => {
			toast.error(
				error instanceof Error
					? error.message
					: "Failed to update collection",
			);
		},
	});

	const handleCreateCollection = async (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		const normalizedName = newCollectionName.trim();
		if (!normalizedName) return;
		try {
			await createCollectionMutation.mutateAsync({
				name: normalizedName,
				isPublic: newCollectionIsPublic,
			});
			setNewCollectionName("");
			setNewCollectionIsPublic(false);
			setIsCreateDialogOpen(false);
		} catch {
			// Handled by onError
		}
	};

	const memberships = membershipsQuery.data ?? [];
	const activeMemberships = memberships.filter((m) => m.inCollection);

	return (
		<>
			<div className="flex flex-wrap items-center gap-1.5">
				{membershipsQuery.isLoading ? (
					<span className="inline-flex h-7 items-center gap-1.5 rounded-full border border-border/60 bg-muted/30 px-3 text-muted-foreground text-xs">
						<Loader2 className="size-3 animate-spin" />
						Loading...
					</span>
				) : (
					activeMemberships.map((m) => (
						<span
							key={m.id}
							className="group inline-flex h-7 items-center gap-1 rounded-full border border-border/80 bg-background/60 pl-2.5 pr-1.5 text-xs transition-colors"
						>
							{m.name}
							<button
								type="button"
								disabled={toggleMembershipMutation.isPending}
								onClick={() =>
									toggleMembershipMutation.mutate({
										collectionId: m.id,
										inCollection: false,
									})
								}
								className="inline-flex size-4 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
								aria-label={`Remove from ${m.name}`}
							>
								<X className="size-3" />
							</button>
						</span>
					))
				)}

				{/* Add to collection trigger */}
				<DropdownMenu>
					<DropdownMenuTrigger
						className="inline-flex h-7 items-center gap-1 rounded-full border border-dashed border-border/80 bg-background/40 px-2.5 text-muted-foreground text-xs transition-colors hover:bg-muted/60 hover:text-foreground"
					>
						<Plus className="size-3" />
						Add
					</DropdownMenuTrigger>
					<DropdownMenuContent align="start" sideOffset={6} className="min-w-[200px]">
						{memberships.length > 0 ? (
							memberships.map((m) => (
								<DropdownMenuCheckboxItem
									key={m.id}
									checked={m.inCollection}
									onCheckedChange={() => {
										toggleMembershipMutation.mutate({
											collectionId: m.id,
											inCollection: !m.inCollection,
										});
									}}
								>
									{m.name}
								</DropdownMenuCheckboxItem>
							))
						) : (
							<div className="px-2 py-2 text-muted-foreground text-xs">
								No collections yet
							</div>
						)}
						<DropdownMenuSeparator />
						<DropdownMenuItem
							onClick={() => setIsCreateDialogOpen(true)}
						>
							<FolderPlus className="size-4" />
							New collection...
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			</div>

			{/* Create collection dialog */}
			<Dialog
				open={isCreateDialogOpen}
				onOpenChange={(open) => {
					setIsCreateDialogOpen(open);
					if (!open) {
						setNewCollectionName("");
						setNewCollectionIsPublic(false);
					}
				}}
			>
				<DialogContent className="sm:max-w-md">
					<form
						className="space-y-4"
						onSubmit={(event) => void handleCreateCollection(event)}
					>
						<DialogHeader>
							<DialogTitle>Create collection</DialogTitle>
							<DialogDescription>
								Create a new collection and choose if it is public or private.
							</DialogDescription>
						</DialogHeader>

						<div className="space-y-1.5">
							<Label htmlFor="new-collection-name">Collection name</Label>
							<Input
								id="new-collection-name"
								value={newCollectionName}
								onChange={(event) => setNewCollectionName(event.target.value)}
								placeholder="Favorites, Weekend Reads..."
								maxLength={80}
								autoFocus
							/>
						</div>

						<div className="flex items-center justify-between rounded-md border border-border/70 bg-background/60 px-3 py-2">
							<div className="space-y-0.5">
								<p className="font-medium text-sm">Public collection</p>
								<p className="text-muted-foreground text-xs">
									Others can discover this collection.
								</p>
							</div>
							<Checkbox
								checked={newCollectionIsPublic}
								onCheckedChange={(checked) => {
									setNewCollectionIsPublic(checked === true);
								}}
							/>
						</div>

						<DialogFooter>
							<Button
								type="button"
								variant="outline"
								disabled={createCollectionMutation.isPending}
								onClick={() => {
									setIsCreateDialogOpen(false);
									setNewCollectionName("");
									setNewCollectionIsPublic(false);
								}}
							>
								Cancel
							</Button>
							<Button
								type="submit"
								disabled={
									createCollectionMutation.isPending ||
									newCollectionName.trim().length === 0
								}
							>
								{createCollectionMutation.isPending ? (
									<Loader2 className="size-4 animate-spin" />
								) : (
									<FolderPlus className="size-4" />
								)}
								Create
							</Button>
						</DialogFooter>
					</form>
				</DialogContent>
			</Dialog>
		</>
	);
}
