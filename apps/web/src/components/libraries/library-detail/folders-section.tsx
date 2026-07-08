import type { LibraryComplete } from "@nanahoshi-v2/api/routers/libraries/library.model";
import { useMutation } from "@tanstack/react-query";
import { FolderOpen, Info, Plus, X } from "@phosphor-icons/react";
import { useState } from "react";
import { toast } from "sonner";
import { DirectoryPicker } from "@/components/libraries/directory-picker";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
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

	const addPathMutation = useMutation({
		...orpc.libraries.addPath.mutationOptions(),
		onSuccess: () => {
			invalidateLibraries();
			setNewPath("");
			setShowAddPath(false);
			toast.success("Path added");
		},
		onError: (err) => toast.error(err.message),
	});

	const removePathMutation = useMutation({
		...orpc.libraries.removePath.mutationOptions(),
		onSuccess: () => {
			// Removing a path cascade-deletes its books — flush every cache.
			queryClient.invalidateQueries();
			toast.success("Path removed");
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
		<div className="space-y-4">
			<div className="space-y-1">
				<h3 className="font-medium text-sm">Folders</h3>
				<p className="text-muted-foreground text-xs">
					Folders Nanahoshi scans for this library. Disabled folders are kept
					but skipped during scans.
				</p>
			</div>

			{paths.length > 0 ? (
				<ul className="space-y-1.5">
					{paths.map((p) => {
						const enabled = p.isEnabled !== false;
						return (
							<li
								key={p.id}
								className="flex items-center gap-2 rounded-md border border-border px-2.5 py-2 text-xs"
							>
								<FolderOpen className="size-3.5 shrink-0 text-muted-foreground" />
								<span
									className={`flex-1 truncate font-mono ${enabled ? "" : "text-muted-foreground/60 line-through"}`}
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
											aria-label={`Toggle scanning of ${p.path}`}
										/>
										<button
											type="button"
											onClick={() =>
												removePathMutation.mutate({ pathId: p.id })
											}
											disabled={removePathMutation.isPending}
											className="shrink-0 p-1 text-muted-foreground hover:text-destructive"
											aria-label={`Remove path ${p.path}`}
										>
											<X className="size-3.5" />
										</button>
									</>
								)}
							</li>
						);
					})}
				</ul>
			) : (
				<p className="text-muted-foreground/60 text-xs">No paths configured</p>
			)}

			{library.mediaType !== "audiobook" && (
				<div className="flex items-start gap-1.5 rounded bg-muted/50 px-2.5 py-1.5 text-muted-foreground text-xs">
					<Info className="mt-0.5 size-3 shrink-0" />
					<span>
						AZW3 files are automatically converted to EPUB for reading. This may
						slow down the initial scan.
					</span>
				</div>
			)}

			{canManage &&
				(showAddPath ? (
					<div className="flex items-center gap-2">
						<DirectoryPicker
							placeholder={
								library.mediaType === "audiobook"
									? "/path/to/audiobooks"
									: "/path/to/books"
							}
							value={newPath}
							onChange={setNewPath}
						/>
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
							Add
						</Button>
						<Button
							variant="outline"
							size="sm"
							onClick={() => {
								setShowAddPath(false);
								setNewPath("");
							}}
						>
							Cancel
						</Button>
					</div>
				) : (
					<Button
						variant="outline"
						size="sm"
						onClick={() => setShowAddPath(true)}
					>
						<Plus className="mr-1.5 size-4" />
						Add folder
					</Button>
				))}
		</div>
	);
}
