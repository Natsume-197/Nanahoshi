import {
	CircleNotch,
	Folder,
	FolderPlus,
	Globe,
	Lock,
	Pencil,
	Plus,
	Trash,
} from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useId, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
	ContextMenuItem,
	ContextMenuSeparator,
} from "@/components/ui/context-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { SidebarGroup } from "@/components/ui/sidebar";
import { useAbilities } from "@/hooks/use-abilities";
import { cn } from "@/lib/utils";
import { m } from "@/paraglide/messages";
import {
	coverPresets,
	getCoverFilename,
	getCoverPresetUrl,
} from "@/utils/covers";
import { orpc } from "@/utils/orpc";
import { Section, SidebarItem } from "./dashboard-sidebar-item";

type Collection = {
	id: string;
	name: string;
	bookCount: number;
	previewCovers?: string[] | null;
};

const addButtonClass = cn(
	"size-6 rounded-md text-sidebar-foreground/60 hover:text-sidebar-foreground",
);

export function DashboardSidebarCollections({
	locationPathname,
	onNavigate,
}: {
	locationPathname: string;
	onNavigate: () => void;
}) {
	const { can } = useAbilities();
	const canReadCollections = can("collection", "read");
	const canCreateCollection = can("collection", "create");
	const canUpdateCollection = can("collection", "update");
	const canDeleteCollection = can("collection", "delete");
	const canToggleCollectionVisibility = can("collection", "makePublic");
	const queryClient = useQueryClient();
	const [isCreateOpen, setIsCreateOpen] = useState(false);
	const [newName, setNewName] = useState("");
	const [newIsPublic, setNewIsPublic] = useState(false);
	const [renameTarget, setRenameTarget] = useState<Collection | null>(null);
	const [renameValue, setRenameValue] = useState("");
	const [deleteTarget, setDeleteTarget] = useState<Collection | null>(null);
	const publicFieldId = useId();

	// Collections is the same query the rest of the app uses, so React Query
	// dedupes it; it only fetches when the user can read collections.
	const collections = useQuery({
		...orpc.collections.list.queryOptions(),
		staleTime: 30_000,
		enabled: canReadCollections,
	});

	const invalidateCollections = () =>
		queryClient.invalidateQueries({
			queryKey: orpc.collections.list.queryOptions().queryKey,
		});
	const createMutation = useMutation({
		...orpc.collections.create.mutationOptions(),
		onSuccess: () => {
			invalidateCollections();
			setIsCreateOpen(false);
			setNewName("");
			setNewIsPublic(false);
			toast.success(m["toast.collection_created"]());
		},
		onError: (err) => toast.error(err.message),
	});

	const renameMutation = useMutation({
		...orpc.collections.rename.mutationOptions(),
		onSuccess: () => {
			invalidateCollections();
			setRenameTarget(null);
			toast.success(m["toast.collection_renamed"]());
		},
		onError: (err) => toast.error(err.message),
	});

	const deleteCollectionMutation = useMutation({
		...orpc.collections.delete.mutationOptions(),
		onSuccess: () => {
			invalidateCollections();
			setDeleteTarget(null);
			toast.success(m["toast.collection_deleted"]());
		},
		onError: (err) => toast.error(err.message),
	});

	const visibilityMutation = useMutation({
		...orpc.collections.updateVisibility.mutationOptions(),
		onSuccess: (result) => {
			invalidateCollections();
			toast.success(
				result.isPublic
					? m["toast.collection_made_public"]()
					: m["toast.collection_made_private"](),
			);
		},
		onError: (err) => toast.error(err.message),
	});

	const handleCreate = (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		const name = newName.trim();
		if (!name) return;
		createMutation.mutate({ name, isPublic: newIsPublic });
	};

	const handleRename = (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		const name = renameValue.trim();
		if (!name || !renameTarget) return;
		if (name === renameTarget.name) {
			setRenameTarget(null);
			return;
		}
		renameMutation.mutate({ collectionId: renameTarget.id, name });
	};

	if (!canReadCollections) return null;

	return (
		<SidebarGroup className="pt-0">
			<div className="space-y-1 pt-1">
				<Section
					label={m["nav.collections"]()}
					action={
						canCreateCollection && (
							<Button
								variant="ghost"
								size="icon-xs"
								aria-label={m["collection.new"]()}
								onClick={() => setIsCreateOpen(true)}
								className={addButtonClass}
							>
								<Plus className="size-4" />
							</Button>
						)
					}
				>
					{collections.isLoading ? null : collections.data?.length ? (
						collections.data.map((c) => {
							const coverFilename = getCoverFilename(c.previewCovers?.[0]);
							return (
								<SidebarItem
									key={c.id}
									link={{
										to: "/dashboard/collections/$collectionId",
										params: { collectionId: c.id },
									}}
									active={locationPathname.startsWith(
										`/dashboard/collections/${c.id}`,
									)}
									onNavigate={onNavigate}
									title={c.name}
									subtitle={m["collection.subtitle"]({
										count: c.bookCount,
									})}
									leadingClassName={
										coverFilename
											? "bg-muted"
											: "grid place-items-center bg-sidebar-accent text-sidebar-foreground/70"
									}
									leading={
										coverFilename ? (
											<img
												src={getCoverPresetUrl(
													coverFilename,
													coverPresets.thumbnail,
												)}
												alt=""
												className="h-full w-full object-cover"
												loading="lazy"
												decoding="async"
											/>
										) : (
											<Folder className="size-5" />
										)
									}
									collapsedIcon={<Folder />}
									menu={
										canUpdateCollection ||
										canDeleteCollection ||
										canToggleCollectionVisibility ? (
											<>
												{canUpdateCollection && (
													<ContextMenuItem
														onClick={() => {
															setRenameTarget(c);
															setRenameValue(c.name);
														}}
													>
														<Pencil />
														{m["common.rename"]()}
													</ContextMenuItem>
												)}
												{canToggleCollectionVisibility && (
													<ContextMenuItem
														disabled={visibilityMutation.isPending}
														onClick={() =>
															visibilityMutation.mutate({
																collectionId: c.id,
																isPublic: !c.isPublic,
															})
														}
													>
														{c.isPublic ? <Lock /> : <Globe />}
														{c.isPublic
															? m["collection.make_private"]()
															: m["collection.make_public"]()}
													</ContextMenuItem>
												)}
												{(canUpdateCollection ||
													canToggleCollectionVisibility) &&
													canDeleteCollection && <ContextMenuSeparator />}
												{canDeleteCollection && (
													<ContextMenuItem
														variant="destructive"
														onClick={() => setDeleteTarget(c)}
													>
														<Trash />
														{m["common.delete"]()}
													</ContextMenuItem>
												)}
											</>
										) : undefined
									}
								/>
							);
						})
					) : (
						<p className="px-3 py-2 text-sidebar-foreground/50 text-xs group-data-[collapsible=icon]:hidden">
							{m["collection.none"]()}
						</p>
					)}
				</Section>
			</div>

			{/* Create collection modal */}
			<Modal
				open={isCreateOpen}
				onOpenChange={(open) => {
					setIsCreateOpen(open);
					if (!open) {
						setNewName("");
						setNewIsPublic(false);
					}
				}}
				onSubmit={handleCreate}
				title={m["collection.create_title"]()}
				description={m["collection.create_desc"]()}
				footer={
					<>
						<Button
							type="button"
							variant="outline"
							disabled={createMutation.isPending}
							onClick={() => setIsCreateOpen(false)}
						>
							{m["common.cancel"]()}
						</Button>
						<Button
							type="submit"
							disabled={createMutation.isPending || newName.trim().length === 0}
						>
							{createMutation.isPending ? (
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
					<Label htmlFor="sidebar-new-collection-name">
						{m["collection.name_label"]()}
					</Label>
					<Input
						id="sidebar-new-collection-name"
						value={newName}
						onChange={(event) => setNewName(event.target.value)}
						placeholder={m["collection.create_placeholder"]()}
						maxLength={80}
						autoFocus
					/>
				</div>

				<Label
					htmlFor={publicFieldId}
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
						id={publicFieldId}
						checked={newIsPublic}
						onCheckedChange={(checked) => setNewIsPublic(checked === true)}
					/>
				</Label>
			</Modal>

			{/* Rename collection modal */}
			<Modal
				open={renameTarget !== null}
				onOpenChange={(open) => {
					if (!open) setRenameTarget(null);
				}}
				onSubmit={handleRename}
				title={m["collection.rename_title"]()}
				footer={
					<>
						<Button
							type="button"
							variant="outline"
							disabled={renameMutation.isPending}
							onClick={() => setRenameTarget(null)}
						>
							{m["common.cancel"]()}
						</Button>
						<Button
							type="submit"
							disabled={
								renameMutation.isPending || renameValue.trim().length === 0
							}
						>
							{renameMutation.isPending && (
								<CircleNotch
									className="animate-spin"
									data-icon="inline-start"
								/>
							)}
							{m["common.save"]()}
						</Button>
					</>
				}
			>
				<div className="space-y-1.5">
					<Label htmlFor="sidebar-rename-collection-name">
						{m["collection.name_label"]()}
					</Label>
					<Input
						id="sidebar-rename-collection-name"
						value={renameValue}
						onChange={(event) => setRenameValue(event.target.value)}
						maxLength={80}
						autoFocus
					/>
				</div>
			</Modal>

			{/* Delete confirmation */}
			<Modal
				open={deleteTarget !== null}
				onOpenChange={(open) => {
					if (!open) setDeleteTarget(null);
				}}
				title={m["collection.delete_title"]()}
				description={m["collection.delete_desc"]({
					name: deleteTarget?.name ?? "",
				})}
				footer={
					<>
						<Button
							type="button"
							variant="outline"
							disabled={deleteCollectionMutation.isPending}
							onClick={() => setDeleteTarget(null)}
						>
							{m["common.cancel"]()}
						</Button>
						<Button
							type="button"
							disabled={deleteCollectionMutation.isPending}
							onClick={() => {
								if (deleteTarget)
									deleteCollectionMutation.mutate({
										collectionId: deleteTarget.id,
									});
							}}
							className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
						>
							{deleteCollectionMutation.isPending && (
								<CircleNotch
									className="animate-spin"
									data-icon="inline-start"
								/>
							)}
							{m["common.delete"]()}
						</Button>
					</>
				}
			/>
		</SidebarGroup>
	);
}
