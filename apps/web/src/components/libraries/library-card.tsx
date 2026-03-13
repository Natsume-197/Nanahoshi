import type { LibraryComplete } from "@nanahoshi-v2/api/routers/libraries/library.model";
import { useMutation } from "@tanstack/react-query";
import { FolderOpen, Loader2, Plus, RefreshCw, Trash2, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardAction,
	CardContent,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { orpc, queryClient } from "@/utils/orpc";
import { DirectoryPicker } from "./directory-picker";

function invalidateLibraries() {
	queryClient.invalidateQueries({
		queryKey: orpc.libraries.getLibraries.queryOptions().queryKey,
	});
}

export function LibraryCard({
	library,
	canManage = false,
}: {
	library: LibraryComplete;
	canManage?: boolean;
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
			invalidateLibraries();
			toast.success("Path removed");
		},
		onError: (err) => toast.error(err.message),
	});

	const scanMutation = useMutation({
		...orpc.libraries.scanLibrary.mutationOptions(),
		onSuccess: () => toast.success("Library scan started"),
		onError: (err) => toast.error(err.message),
	});

	const deleteMutation = useMutation({
		...orpc.libraries.deleteLibrary.mutationOptions(),
		onSuccess: () => {
			invalidateLibraries();
			toast.success("Library deleted");
		},
		onError: (err) => toast.error(err.message),
	});

	const handleDelete = () => {
		if (
			window.confirm(
				`Delete "${library.name ?? "Untitled"}"? This will also remove all associated books.`,
			)
		) {
			deleteMutation.mutate({ id: library.id });
		}
	};

	return (
		<Card>
			<CardHeader>
				<CardTitle>{library.name ?? "Untitled Library"}</CardTitle>
				{canManage && (
					<CardAction>
						<div className="flex gap-1">
							<Button
								variant="outline"
								size="icon"
								onClick={() => scanMutation.mutate({ libraryId: library.id })}
								disabled={scanMutation.isPending}
								title="Scan library"
							>
								{scanMutation.isPending ? (
									<Loader2 className="animate-spin" />
								) : (
									<RefreshCw />
								)}
							</Button>
							<Button
								variant="outline"
								size="icon"
								onClick={handleDelete}
								disabled={deleteMutation.isPending}
								title="Delete library"
							>
								{deleteMutation.isPending ? (
									<Loader2 className="animate-spin" />
								) : (
									<Trash2 />
								)}
							</Button>
						</div>
					</CardAction>
				)}
			</CardHeader>
			<CardContent className="space-y-3">
				<div className="space-y-1.5">
					<p className="text-muted-foreground text-xs">Paths</p>
					{library.paths && library.paths.length > 0 ? (
						<ul className="space-y-1">
							{library.paths.map((p) => (
								<li
									key={p.id}
									className="flex items-center gap-2 rounded bg-muted/50 px-2.5 py-1.5 text-xs"
								>
									<FolderOpen className="size-3.5 shrink-0 text-muted-foreground" />
									<span className="flex-1 truncate font-mono">{p.path}</span>
									{canManage && (
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
									)}
								</li>
							))}
						</ul>
					) : (
						<p className="text-muted-foreground/60 text-xs">
							No paths configured
						</p>
					)}

					{canManage &&
						(showAddPath ? (
							<div className="flex items-center gap-2">
								<DirectoryPicker
									placeholder="/path/to/books"
									value={newPath}
									onChange={(value: string) => setNewPath(value)}
								/>

								<Button
									variant="outline"
									size="sm"
									disabled={addPathMutation.isPending || !newPath.trim()}
									onClick={() =>
										addPathMutation.mutate({
											libraryId: library.id,
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
								<Plus data-icon="inline-start" />
								Add Path
							</Button>
						))}
				</div>
			</CardContent>
		</Card>
	);
}
