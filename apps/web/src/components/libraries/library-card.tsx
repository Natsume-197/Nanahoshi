import type { LibraryComplete } from "@nanahoshi-v2/api/routers/libraries/library.model";
import { useMutation } from "@tanstack/react-query";
import {
	FolderOpen,
	Info,
	Loader2,
	Plus,
	RefreshCw,
	Save,
	Trash2,
	X,
} from "lucide-react";
import { useRef, useState } from "react";
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
import {
	type ProviderEntry,
	ProviderPriorityList,
	toProviderEntries,
	toProviderIds,
} from "./provider-priority-list";

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

	const [providers, setProviders] = useState<ProviderEntry[]>(() =>
		toProviderEntries(library.metadataProviders),
	);
	// Re-sync provider state if the library data changes (e.g. after refetch)
	const prevProvidersRef = useRef(library.metadataProviders);
	if (library.metadataProviders !== prevProvidersRef.current) {
		prevProvidersRef.current = library.metadataProviders;
		setProviders(toProviderEntries(library.metadataProviders));
	}

	const savedProviderEntries = toProviderEntries(library.metadataProviders);
	const providersChanged =
		JSON.stringify(providers) !== JSON.stringify(savedProviderEntries);

	const updateProvidersMutation = useMutation({
		...orpc.libraries.updateLibrary.mutationOptions(),
		onSuccess: () => {
			invalidateLibraries();
			toast.success("Metadata providers updated");
		},
		onError: (err) => toast.error(err.message),
	});

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
			// Removing a path cascade-deletes its books — flush every cache
			queryClient.invalidateQueries();
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
			// Deleting a library cascade-deletes books/series/authors/progress —
			// stale book queries would keep showing them, so flush every cache
			queryClient.invalidateQueries();
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

					<div className="flex items-start gap-1.5 rounded bg-muted/50 px-2.5 py-1.5 text-muted-foreground text-xs">
						<Info className="mt-0.5 size-3 shrink-0" />
						<span>
							AZW3 files are automatically converted to EPUB for reading. This
							may slow down the initial scan.
						</span>
					</div>

					{canManage && library.mediaType !== "audiobook" && (
						<div className="space-y-1.5 pt-2">
							<div className="flex items-center justify-between">
								<p className="text-muted-foreground text-xs">
									Metadata providers (priority order)
								</p>
								{providersChanged && (
									<Button
										variant="outline"
										size="sm"
										disabled={updateProvidersMutation.isPending}
										onClick={() =>
											updateProvidersMutation.mutate({
												id: library.id,
												metadataProviders: toProviderIds(providers),
											})
										}
									>
										{updateProvidersMutation.isPending ? (
											<Loader2 className="mr-1.5 size-3.5 animate-spin" />
										) : (
											<Save className="mr-1.5 size-3.5" />
										)}
										Save
									</Button>
								)}
							</div>
							<ProviderPriorityList
								value={providers}
								onChange={setProviders}
								disabled={updateProvidersMutation.isPending}
							/>
						</div>
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
