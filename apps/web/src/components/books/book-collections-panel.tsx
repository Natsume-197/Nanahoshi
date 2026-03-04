import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FolderPlus, Globe, Loader2, Lock } from "lucide-react";
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
	const [isCreateCollectionDialogOpen, setIsCreateCollectionDialogOpen] =
		useState(false);

	const collectionMembershipsQueryOptions =
		orpc.collections.listBookMemberships.queryOptions({
			input: { bookUuid },
		});
	const collectionMembershipsQuery = useQuery(
		collectionMembershipsQueryOptions,
	);

	const createCollectionMutation = useMutation({
		mutationFn: (input: { name: string; isPublic: boolean }) =>
			client.collections.create({
				name: input.name,
				isPublic: input.isPublic,
				addBookUuid: bookUuid,
			}),
		onSuccess: async () => {
			await queryClient.invalidateQueries({
				queryKey: collectionMembershipsQueryOptions.queryKey,
			});
			toast.success("Collection created");
		},
		onError: (error) => {
			toast.error(
				error instanceof Error ? error.message : "Failed to create collection",
			);
		},
	});

	const setCollectionMembershipMutation = useMutation({
		mutationFn: (input: { collectionId: string; inCollection: boolean }) =>
			client.collections.setBookMembership({
				collectionId: input.collectionId,
				bookUuid,
				inCollection: input.inCollection,
			}),
		onSuccess: async (_, variables) => {
			await queryClient.invalidateQueries({
				queryKey: collectionMembershipsQueryOptions.queryKey,
			});
			toast.success(
				variables.inCollection
					? "Book added to collection"
					: "Book removed from collection",
			);
		},
		onError: (error) => {
			toast.error(
				error instanceof Error
					? error.message
					: "Failed to update collection membership",
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
		} catch {
			// Handled by onError in mutation.
		}
	};

	const collectionMemberships = collectionMembershipsQuery.data ?? [];

	return (
		<>
			<div className="space-y-1.5">
				{collectionMembershipsQuery.isLoading ? (
					<div className="flex items-center gap-2 rounded-md border border-border/70 bg-background/60 px-2.5 py-2">
						<Loader2 className="size-3.5 animate-spin text-muted-foreground" />
						<p className="text-muted-foreground text-xs">
							Loading collections...
						</p>
					</div>
				) : collectionMemberships.length > 0 ? (
					collectionMemberships.map((membership) => (
						<div
							key={membership.id}
							className="flex items-center justify-between gap-3 rounded-md border border-border/70 bg-background/60 px-2.5 py-2"
						>
							<div className="min-w-0">
								<p className="truncate font-medium text-sm">
									{membership.name}
								</p>
								<p className="flex items-center gap-1 text-muted-foreground text-xs">
									{membership.isPublic ? (
										<Globe className="size-3.5" />
									) : (
										<Lock className="size-3.5" />
									)}
									{membership.isPublic ? "Public" : "Private"}
								</p>
							</div>
							<Checkbox
								checked={membership.inCollection}
								disabled={setCollectionMembershipMutation.isPending}
								onCheckedChange={(checked) => {
									setCollectionMembershipMutation.mutate({
										collectionId: membership.id,
										inCollection: checked === true,
									});
								}}
							/>
						</div>
					))
				) : (
					<p className="rounded-md border border-dashed border-border/80 bg-background/50 px-2.5 py-2 text-muted-foreground text-xs">
						No collections yet
					</p>
				)}
			</div>

			<Button
				type="button"
				size="sm"
				variant="outline"
				className="h-8 w-full gap-1.5"
				onClick={() => {
					setIsCreateCollectionDialogOpen(true);
				}}
			>
				<FolderPlus className="size-3.5" />
				Create collection
			</Button>

			<Dialog
				open={isCreateCollectionDialogOpen}
				onOpenChange={(open) => {
					setIsCreateCollectionDialogOpen(open);
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
									setIsCreateCollectionDialogOpen(false);
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
								Create collection
							</Button>
						</DialogFooter>
					</form>
				</DialogContent>
			</Dialog>
		</>
	);
}
