import { CircleNotch, FolderPlus, Plus, X } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useId, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
	DropdownMenu,
	DropdownMenuCheckboxItem,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { useAbilities } from "@/hooks/use-abilities";
import { m } from "@/paraglide/messages";
import { client, orpc } from "@/utils/orpc";

interface BookCollectionsPanelProps {
	bookUuid: string;
}

export function BookCollectionsPanel({ bookUuid }: BookCollectionsPanelProps) {
	const queryClient = useQueryClient();
	const { can } = useAbilities();
	const canRead = can("collection", "read");
	const canCreate = can("collection", "create");
	const canUpdate = can("collection", "update");
	const canMakePublic = can("collection", "makePublic");
	const [newCollectionName, setNewCollectionName] = useState("");
	const [newCollectionIsPublic, setNewCollectionIsPublic] = useState(false);
	const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
	const publicCollectionFieldId = useId();

	const membershipsQueryOptions =
		orpc.collections.listBookMemberships.queryOptions({
			input: { bookUuid },
		});
	const membershipsQuery = useQuery({
		...membershipsQueryOptions,
		enabled: canRead,
	});

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
			toast.success(m["toast.collection_created"]());
		},
		onError: (error) => {
			toast.error(
				error instanceof Error
					? error.message
					: m["toast.collection_create_failed"](),
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
					? m["toast.added_to_collection"]()
					: m["toast.removed_from_collection"](),
			);
		},
		onError: (error) => {
			toast.error(
				error instanceof Error
					? error.message
					: m["toast.collection_update_failed"](),
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

	if (!canRead) return null;

	return (
		<>
			<div className="flex flex-wrap items-center gap-1.5">
				{membershipsQuery.isLoading ? (
					<span className="inline-flex h-7 items-center gap-1.5 rounded-full px-3 text-muted-foreground text-xs ring-1 ring-border/50">
						<CircleNotch className="size-3 animate-spin" />
						{m["collection.loading"]()}
					</span>
				) : (
					activeMemberships.map((mem) => (
						<span
							key={mem.id}
							className="group inline-flex max-w-full items-center gap-1 rounded-full pr-1.5 pl-2.5 text-xs ring-1 ring-border/50 transition-colors"
						>
							<span className="max-w-[12rem] truncate">{mem.name}</span>
							{canUpdate && (
								<button
									type="button"
									disabled={toggleMembershipMutation.isPending}
									onClick={() =>
										toggleMembershipMutation.mutate({
											collectionId: mem.id,
											inCollection: false,
										})
									}
									className="relative inline-flex size-5 items-center justify-center rounded-full text-muted-foreground transition-colors after:absolute after:-inset-1 hover:bg-muted hover:text-foreground"
									aria-label={m["collection.remove_from"]({ name: mem.name })}
								>
									<X className="size-3" />
								</button>
							)}
						</span>
					))
				)}

				{/* Add to collection trigger */}
				{(canUpdate || canCreate) && (
					<DropdownMenu>
						<DropdownMenuTrigger className="inline-flex h-7 items-center gap-1 rounded-full px-2.5 text-muted-foreground text-xs ring-1 ring-border/50 ring-dashed transition-colors hover:text-foreground hover:ring-border">
							<Plus className="size-3" />
							{m["collection.add_to"]()}
						</DropdownMenuTrigger>
						<DropdownMenuContent
							align="start"
							sideOffset={6}
							className="min-w-[200px] max-w-[min(20rem,calc(100vw-2rem))]"
						>
							{canUpdate ? (
								memberships.length > 0 ? (
									memberships.map((mem) => (
										<DropdownMenuCheckboxItem
											key={mem.id}
											checked={mem.inCollection}
											className="max-w-full"
											onCheckedChange={() => {
												toggleMembershipMutation.mutate({
													collectionId: mem.id,
													inCollection: !mem.inCollection,
												});
											}}
										>
											<span className="block truncate">{mem.name}</span>
										</DropdownMenuCheckboxItem>
									))
								) : (
									<div className="px-2 py-2 text-muted-foreground text-xs">
										{m["collection.none"]()}
									</div>
								)
							) : null}
							{canCreate && (
								<>
									{canUpdate && <DropdownMenuSeparator />}
									<DropdownMenuItem onClick={() => setIsCreateDialogOpen(true)}>
										<FolderPlus />
										{m["collection.new_ellipsis"]()}
									</DropdownMenuItem>
								</>
							)}
						</DropdownMenuContent>
					</DropdownMenu>
				)}
			</div>

			{/* Create collection modal */}
			<Modal
				open={isCreateDialogOpen}
				onOpenChange={(open) => {
					setIsCreateDialogOpen(open);
					if (!open) {
						setNewCollectionName("");
						setNewCollectionIsPublic(false);
					}
				}}
				onSubmit={(event) => void handleCreateCollection(event)}
				title={m["collection.create_title"]()}
				description={m["collection.create_desc"]()}
				footer={
					<>
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
							{m["common.cancel"]()}
						</Button>
						<Button
							type="submit"
							disabled={
								createCollectionMutation.isPending ||
								newCollectionName.trim().length === 0
							}
						>
							{createCollectionMutation.isPending ? (
								<CircleNotch
									className="animate-spin"
									data-icon="inline-start"
								/>
							) : (
								<FolderPlus data-icon="inline-start" />
							)}
							{m["common.create"]()}
						</Button>
					</>
				}
			>
				<div className="space-y-1.5">
					<Label htmlFor="new-collection-name">
						{m["collection.name_label"]()}
					</Label>
					<Input
						id="new-collection-name"
						value={newCollectionName}
						onChange={(event) => setNewCollectionName(event.target.value)}
						placeholder={m["collection.create_placeholder"]()}
						maxLength={80}
						autoFocus
					/>
				</div>

				{canMakePublic && (
					<Label
						htmlFor={publicCollectionFieldId}
						className="justify-between rounded-md border border-border/70 bg-background/60 px-3 py-2"
					>
						<div className="space-y-0.5">
							<p className="font-medium text-sm">
								{m["collection.public_title"]()}
							</p>
							<p className="text-muted-foreground text-xs">
								{m["collection.public_desc"]()}
							</p>
						</div>
						<Checkbox
							id={publicCollectionFieldId}
							checked={newCollectionIsPublic}
							onCheckedChange={(checked) => {
								setNewCollectionIsPublic(checked === true);
							}}
						/>
					</Label>
				)}
			</Modal>
		</>
	);
}
