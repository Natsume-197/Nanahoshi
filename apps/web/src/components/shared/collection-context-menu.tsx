import { CircleNotch, Pencil, Trash } from "@phosphor-icons/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, type ReactNode, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuSeparator,
	ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { useAbilities } from "@/hooks/use-abilities";
import { m } from "@/paraglide/messages";
import { orpc } from "@/utils/orpc";

// Right-click menu for a collection tile — the rename/delete actions the sidebar
// collection rows already offer, extracted so every collection card (dashboard,
// library grid, search) shares one implementation. The single child becomes the
// trigger (`asChild`), so it stays the layout node and left-click navigation
// keeps working. When the viewer can neither rename nor delete, the child is
// returned untouched (no menu).
export function CollectionContextMenu({
	collectionId,
	collectionName,
	children,
}: {
	collectionId: string;
	collectionName: string;
	children: ReactNode;
}) {
	const { can } = useAbilities();
	const canUpdate = can("collection", "update");
	const canDelete = can("collection", "delete");
	const queryClient = useQueryClient();
	const [renameOpen, setRenameOpen] = useState(false);
	const [renameValue, setRenameValue] = useState(collectionName);
	const [deleteOpen, setDeleteOpen] = useState(false);

	// Rename and delete affect both the list query (sidebar, dashboard, library
	// grid) and the search query, which don't share a cache prefix.
	const invalidate = () => {
		queryClient.invalidateQueries({
			queryKey: orpc.collections.list.queryOptions().queryKey,
		});
		queryClient.invalidateQueries({ queryKey: ["collections", "search"] });
	};

	const renameMutation = useMutation({
		...orpc.collections.rename.mutationOptions(),
		onSuccess: () => {
			invalidate();
			setRenameOpen(false);
			toast.success(m["toast.collection_renamed"]());
		},
		onError: (err) => toast.error(err.message),
	});

	const deleteMutation = useMutation({
		...orpc.collections.delete.mutationOptions(),
		onSuccess: () => {
			invalidate();
			setDeleteOpen(false);
			toast.success(m["toast.collection_deleted"]());
		},
		onError: (err) => toast.error(err.message),
	});

	if (!canUpdate && !canDelete) return <>{children}</>;

	const handleRename = (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		const name = renameValue.trim();
		if (!name) return;
		if (name === collectionName) {
			setRenameOpen(false);
			return;
		}
		renameMutation.mutate({ collectionId, name });
	};

	return (
		<>
			<ContextMenu>
				<ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
				<ContextMenuContent className="w-44">
					{canUpdate && (
						<ContextMenuItem
							onClick={() => {
								setRenameValue(collectionName);
								setRenameOpen(true);
							}}
						>
							<Pencil />
							{m["common.rename"]()}
						</ContextMenuItem>
					)}
					{canUpdate && canDelete && <ContextMenuSeparator />}
					{canDelete && (
						<ContextMenuItem
							variant="destructive"
							onClick={() => setDeleteOpen(true)}
						>
							<Trash />
							{m["common.delete"]()}
						</ContextMenuItem>
					)}
				</ContextMenuContent>
			</ContextMenu>

			<Modal
				open={renameOpen}
				onOpenChange={setRenameOpen}
				onSubmit={handleRename}
				title={m["collection.rename_title"]()}
				footer={
					<>
						<Button
							type="button"
							variant="outline"
							disabled={renameMutation.isPending}
							onClick={() => setRenameOpen(false)}
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
					<Label htmlFor="rename-collection-name">
						{m["collection.name_label"]()}
					</Label>
					<Input
						id="rename-collection-name"
						value={renameValue}
						onChange={(event) => setRenameValue(event.target.value)}
						maxLength={80}
						autoFocus
					/>
				</div>
			</Modal>

			<Modal
				open={deleteOpen}
				onOpenChange={setDeleteOpen}
				title={m["collection.delete_title"]()}
				description={m["collection.delete_desc"]({ name: collectionName })}
				footer={
					<>
						<Button
							type="button"
							variant="outline"
							disabled={deleteMutation.isPending}
							onClick={() => setDeleteOpen(false)}
						>
							{m["common.cancel"]()}
						</Button>
						<Button
							type="button"
							disabled={deleteMutation.isPending}
							onClick={() => deleteMutation.mutate({ collectionId })}
							className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
						>
							{deleteMutation.isPending && (
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
		</>
	);
}
