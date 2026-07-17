import type { LibraryComplete } from "@nanahoshi-v2/api/routers/libraries/library.model";
import {
	CircleNotch,
	FolderOpen,
	Info,
	Plus,
	Trash,
} from "@phosphor-icons/react";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { DirectoryPicker } from "@/components/libraries/directory-picker";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { m } from "@/paraglide/messages";
import { orpc, queryClient } from "@/utils/orpc";
import { invalidateLibraries } from "./utils";

export function FoldersSection({
	library,
	canManage,
}: {
	library: LibraryComplete;
	canManage: boolean;
}) {
	const [newPath, setNewPath] = useState("");
	const [showAddPath, setShowAddPath] = useState(false);
	const [removeTarget, setRemoveTarget] = useState<{
		id: number;
		path: string;
	} | null>(null);

	const addPathMutation = useMutation({
		...orpc.libraries.addPath.mutationOptions(),
		onSuccess: () => {
			invalidateLibraries();
			setNewPath("");
			setShowAddPath(false);
			toast.success(m["library.path_added"]());
		},
		onError: (err) => toast.error(err.message),
	});

	const removePathMutation = useMutation({
		...orpc.libraries.removePath.mutationOptions(),
		onSuccess: () => {
			// Removing a path cascade-deletes its books — flush every cache.
			queryClient.invalidateQueries();
			toast.success(m["library.path_removed"]());
			setRemoveTarget(null);
		},
		onError: (err) => toast.error(err.message),
	});

	const setEnabledMutation = useMutation({
		...orpc.libraries.setPathEnabled.mutationOptions(),
		onSuccess: () => invalidateLibraries(),
		onError: (err) => toast.error(err.message),
	});

	const paths = library.paths ?? [];

	return (
		<>
			<div className="flex flex-col gap-4">
				{paths.length > 0 ? (
					<ul className="flex flex-col">
						{paths.map((p, index) => {
							const enabled = p.isEnabled !== false;
							return (
								<li key={p.id}>
									<div className="flex min-h-14 items-center gap-3 py-3">
										<FolderOpen className="size-4 shrink-0 text-muted-foreground" />
										<span
											className={`flex-1 truncate font-mono text-sm ${enabled ? "" : "text-muted-foreground/60 line-through"}`}
										>
											{p.path}
										</span>
										{canManage && (
											<>
												<Switch
													size="sm"
													checked={enabled}
													disabled={setEnabledMutation.isPending}
													onCheckedChange={(checked) =>
														setEnabledMutation.mutate({
															pathId: p.id,
															enabled: checked,
														})
													}
													aria-label={m["library.toggle_path"]({
														path: p.path,
													})}
												/>
												<Button
													type="button"
													variant="ghost"
													size="icon"
													onClick={() =>
														setRemoveTarget({ id: p.id, path: p.path })
													}
													disabled={removePathMutation.isPending}
													className="size-11 shrink-0 text-muted-foreground hover:text-destructive sm:size-8"
													aria-label={m["library.remove_path"]({
														path: p.path,
													})}
												>
													<Trash />
												</Button>
											</>
										)}
									</div>
									{index < paths.length - 1 && (
										<Separator className="bg-border/60" />
									)}
								</li>
							);
						})}
					</ul>
				) : (
					<p className="text-muted-foreground text-sm">
						{m["library.no_paths"]()}
					</p>
				)}

				{library.mediaType !== "audiobook" && (
					<p className="flex items-start gap-1.5 text-muted-foreground text-xs">
						<Info className="mt-0.5 size-3 shrink-0" />
						<span>{m["library.azw3_note"]()}</span>
					</p>
				)}

				{canManage &&
					(showAddPath ? (
						<div className="flex flex-col gap-2 sm:flex-row sm:items-center">
							<DirectoryPicker
								placeholder={
									library.mediaType === "audiobook"
										? m["library.path_audiobooks_placeholder"]()
										: m["library.path_placeholder"]()
								}
								value={newPath}
								onChange={setNewPath}
								inputLabel={m["library.folder_path_label"]()}
							/>
							<div className="flex gap-2 sm:shrink-0">
								<Button
									size="sm"
									disabled={addPathMutation.isPending || !newPath.trim()}
									onClick={() =>
										addPathMutation.mutate({
											libraryUuid: library.uuid,
											path: newPath.trim(),
										})
									}
								>
									{addPathMutation.isPending && (
										<CircleNotch
											data-icon="inline-start"
											className="animate-spin"
										/>
									)}
									{m["library.add"]()}
								</Button>
								<Button
									variant="outline"
									size="sm"
									onClick={() => {
										setShowAddPath(false);
										setNewPath("");
									}}
								>
									{m["common.cancel"]()}
								</Button>
							</div>
						</div>
					) : (
						<Button
							variant="outline"
							size="sm"
							className="self-start"
							onClick={() => setShowAddPath(true)}
						>
							<Plus className="mr-1.5 size-4" />
							{m["library.add_folder"]()}
						</Button>
					))}
			</div>

			<Modal
				open={removeTarget !== null}
				onOpenChange={(open) => {
					if (!open && !removePathMutation.isPending) setRemoveTarget(null);
				}}
				title={m["library.remove_path_title"]()}
				description={
					removeTarget
						? m["library.remove_path_desc"]({ path: removeTarget.path })
						: undefined
				}
				footer={
					<>
						<Button
							type="button"
							variant="ghost"
							disabled={removePathMutation.isPending}
							onClick={() => setRemoveTarget(null)}
						>
							{m["common.cancel"]()}
						</Button>
						<Button
							type="button"
							variant="destructive"
							disabled={!removeTarget || removePathMutation.isPending}
							onClick={() => {
								if (removeTarget) {
									removePathMutation.mutate({ pathId: removeTarget.id });
								}
							}}
						>
							{removePathMutation.isPending && (
								<CircleNotch
									data-icon="inline-start"
									className="animate-spin"
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
