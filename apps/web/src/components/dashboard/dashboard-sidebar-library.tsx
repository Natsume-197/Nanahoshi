import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import {
	BookOpen,
	FolderPlus,
	Headphones,
	Loader2,
	Pencil,
	Plus,
	RefreshCw,
	Settings,
	Trash2,
} from "lucide-react";
import { type FormEvent, type ReactNode, useId, useState } from "react";
import { toast } from "sonner";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { SidebarGroup, SidebarMenuSkeleton } from "@/components/ui/sidebar";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/utils";
import {
	coverPresets,
	getCoverFilename,
	getCoverPresetUrl,
} from "@/utils/covers";
import { orpc } from "@/utils/orpc";

type LibraryFilter = "collections" | "libraries";

type Collection = {
	id: string;
	name: string;
	bookCount: number;
	previewCovers?: string[] | null;
};

type DeleteTarget =
	| { kind: "collection"; id: string; name: string }
	| { kind: "library"; id: number; name: string };

// pl-3 lines the thumbnail up with the nav item icons (group p-2 + px-3).
const rowClass = (active: boolean) =>
	cn(
		"flex items-center gap-2.5 rounded-md py-1.5 pr-2 pl-3",
		"transition-colors hover:bg-sidebar-accent/60",
		"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring",
		active && "bg-sidebar-accent",
	);

const nameClass = (active: boolean) =>
	cn(
		"truncate font-medium text-[13px] leading-tight",
		active ? "text-primary" : "text-sidebar-foreground",
	);

function readStoredFilter(): LibraryFilter {
	if (typeof window === "undefined") return "collections";
	return window.localStorage.getItem("nh-sidebar-filter") === "libraries"
		? "libraries"
		: "collections";
}

// Shared sidebar row used by both collections and libraries. The only
// differences are the leading visual (cover vs icon), whether it links
// somewhere, and the context-menu actions — all passed in by the caller.
function SidebarItem({
	leading,
	leadingClassName,
	title,
	subtitle,
	active = false,
	collectionId,
	onNavigate,
	onClick,
	menu,
}: {
	leading: ReactNode;
	leadingClassName?: string;
	title: string;
	subtitle: string;
	active?: boolean;
	/** When set, the row links to this collection. */
	collectionId?: string;
	onNavigate?: () => void;
	/** Click action for non-link rows (e.g. open library settings). */
	onClick?: () => void;
	menu: ReactNode;
}) {
	const inner = (
		<>
			<div
				className={cn(
					"size-10 flex-none overflow-hidden rounded-md",
					leadingClassName,
				)}
			>
				{leading}
			</div>
			<div className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
				<p className={nameClass(active)}>{title}</p>
				<p className="mt-0.5 truncate text-sidebar-foreground/50 text-xs">
					{subtitle}
				</p>
			</div>
		</>
	);

	return (
		<ContextMenu>
			<ContextMenuTrigger asChild>
				{collectionId ? (
					<Link
						to="/dashboard/collections/$collectionId"
						params={{ collectionId }}
						preload="intent"
						onClick={onNavigate}
						className={rowClass(active)}
					>
						{inner}
					</Link>
				) : (
					<button
						type="button"
						onClick={onClick}
						className={cn(rowClass(active), "w-full cursor-pointer text-left")}
					>
						{inner}
					</button>
				)}
			</ContextMenuTrigger>
			<ContextMenuContent className="w-44">{menu}</ContextMenuContent>
		</ContextMenu>
	);
}

export function DashboardSidebarLibrary({
	locationPathname,
	onNavigate,
}: {
	locationPathname: string;
	onNavigate: () => void;
}) {
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const [filter, setFilter] = useState<LibraryFilter>(readStoredFilter);
	const [isCreateOpen, setIsCreateOpen] = useState(false);
	const [newName, setNewName] = useState("");
	const [newIsPublic, setNewIsPublic] = useState(false);
	const [renameTarget, setRenameTarget] = useState<Collection | null>(null);
	const [renameValue, setRenameValue] = useState("");
	const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
	const publicFieldId = useId();

	const switchFilter = (f: LibraryFilter) => {
		setFilter(f);
		if (typeof window !== "undefined") {
			window.localStorage.setItem("nh-sidebar-filter", f);
		}
	};

	// Only the active tab fetches; collections is the same query the rest of the
	// app uses, so React Query dedupes it.
	const collections = useQuery({
		...orpc.collections.list.queryOptions(),
		staleTime: 30_000,
		enabled: filter === "collections",
	});
	const libraries = useQuery({
		...orpc.libraries.getLibraries.queryOptions(),
		staleTime: 30_000,
		enabled: filter === "libraries",
	});

	const { data: session } = authClient.useSession();
	const { data: activeOrg } = authClient.useActiveOrganization();
	const { data: myRoleData } = useQuery({
		...orpc.users.getMyRole.queryOptions(),
		enabled: !!activeOrg,
	});
	const orgMemberRole =
		myRoleData?.role ??
		activeOrg?.members?.find((m) => m.userId === session?.user?.id)?.role;
	const canManageLibraries =
		session?.user?.role === "admin" ||
		orgMemberRole === "admin" ||
		orgMemberRole === "owner";

	const invalidateCollections = () =>
		queryClient.invalidateQueries({
			queryKey: orpc.collections.list.queryOptions().queryKey,
		});
	const invalidateLibraries = () =>
		queryClient.invalidateQueries({
			queryKey: orpc.libraries.getLibraries.queryOptions().queryKey,
		});

	const createMutation = useMutation({
		...orpc.collections.create.mutationOptions(),
		onSuccess: () => {
			invalidateCollections();
			setIsCreateOpen(false);
			setNewName("");
			setNewIsPublic(false);
			toast.success("Collection created");
		},
		onError: (err) => toast.error(err.message),
	});

	const renameMutation = useMutation({
		...orpc.collections.rename.mutationOptions(),
		onSuccess: () => {
			invalidateCollections();
			setRenameTarget(null);
			toast.success("Collection renamed");
		},
		onError: (err) => toast.error(err.message),
	});

	const deleteCollectionMutation = useMutation({
		...orpc.collections.delete.mutationOptions(),
		onSuccess: () => {
			invalidateCollections();
			setDeleteTarget(null);
			toast.success("Collection deleted");
		},
		onError: (err) => toast.error(err.message),
	});

	const scanMutation = useMutation({
		...orpc.libraries.scanLibrary.mutationOptions(),
		onSuccess: () => toast.success("Library scan started"),
		onError: (err) => toast.error(err.message),
	});

	const deleteLibraryMutation = useMutation({
		...orpc.libraries.deleteLibrary.mutationOptions(),
		onSuccess: () => {
			invalidateLibraries();
			setDeleteTarget(null);
			toast.success("Library deleted");
		},
		onError: (err) => toast.error(err.message),
	});

	const openLibrarySettings = () =>
		navigate({
			to: ".",
			search: (prev) => ({ ...prev, settings: "org-libraries" }),
		});

	const handleAdd = () => {
		if (filter === "collections") {
			setIsCreateOpen(true);
		} else {
			openLibrarySettings();
		}
	};

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

	const confirmDelete = () => {
		if (!deleteTarget) return;
		if (deleteTarget.kind === "collection") {
			deleteCollectionMutation.mutate({ collectionId: deleteTarget.id });
		} else {
			deleteLibraryMutation.mutate({ id: deleteTarget.id });
		}
	};

	const isLoading =
		filter === "collections" ? collections.isLoading : libraries.isLoading;
	const isDeleting =
		deleteCollectionMutation.isPending || deleteLibraryMutation.isPending;

	return (
		<SidebarGroup className="flex min-h-0 flex-1 flex-col pt-0">
			{/* header — matches SidebarGroupLabel typography (see Browse) */}
			<div className="flex h-8 items-center pr-1.5 pl-3 group-data-[collapsible=icon]:hidden">
				<span className="flex-1 font-semibold text-muted-foreground text-xs uppercase tracking-[0.15em]">
					My Stuff
				</span>
				{(filter === "collections" || canManageLibraries) && (
					<Button
						variant="ghost"
						size="icon-xs"
						aria-label={
							filter === "collections" ? "New collection" : "Add library"
						}
						onClick={handleAdd}
						className="size-6 rounded-md text-sidebar-foreground/60 hover:text-sidebar-foreground"
					>
						<Plus className="size-4" />
					</Button>
				)}
			</div>

			{/* filter chips */}
			<div className="flex gap-1.5 px-3 pt-1 pb-2.5 group-data-[collapsible=icon]:hidden">
				{(["collections", "libraries"] as const).map((f) => (
					<button
						key={f}
						type="button"
						onClick={() => switchFilter(f)}
						aria-pressed={filter === f}
						className={cn(
							"rounded-full px-2.5 py-1.5 font-semibold text-xs capitalize transition-colors",
							"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring",
							filter === f
								? "bg-sidebar-foreground text-sidebar"
								: "bg-sidebar-accent text-sidebar-foreground/80 hover:bg-sidebar-accent/70",
						)}
					>
						{f}
					</button>
				))}
			</div>

			{/* list — the only part of the sidebar that scrolls */}
			<div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto">
				{isLoading ? (
					<>
						<SidebarMenuSkeleton showIcon />
						<SidebarMenuSkeleton showIcon />
						<SidebarMenuSkeleton showIcon />
					</>
				) : filter === "collections" ? (
					collections.data?.length ? (
						collections.data.map((c) => {
							const coverFilename = getCoverFilename(c.previewCovers?.[0]);
							return (
								<SidebarItem
									key={c.id}
									collectionId={c.id}
									active={locationPathname.startsWith(
										`/dashboard/collections/${c.id}`,
									)}
									onNavigate={onNavigate}
									title={c.name}
									subtitle={`Collection · ${c.bookCount} items`}
									leadingClassName="bg-muted"
									leading={
										coverFilename && (
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
										)
									}
									menu={
										<>
											<ContextMenuItem
												onClick={() => {
													setRenameTarget(c);
													setRenameValue(c.name);
												}}
											>
												<Pencil />
												Rename
											</ContextMenuItem>
											<ContextMenuSeparator />
											<ContextMenuItem
												variant="destructive"
												onClick={() =>
													setDeleteTarget({
														kind: "collection",
														id: c.id,
														name: c.name,
													})
												}
											>
												<Trash2 />
												Delete
											</ContextMenuItem>
										</>
									}
								/>
							);
						})
					) : (
						<p className="px-3 py-3 text-sidebar-foreground/50 text-xs">
							No collections yet
						</p>
					)
				) : libraries.data?.length ? (
					libraries.data.map((lib) => {
						const Icon = lib.mediaType === "audiobook" ? Headphones : BookOpen;
						const typeLabel =
							lib.mediaType.charAt(0).toUpperCase() + lib.mediaType.slice(1);
						return (
							<SidebarItem
								key={lib.id}
								title={lib.name ?? "Untitled library"}
								subtitle={`Library · ${typeLabel}`}
								onClick={openLibrarySettings}
								leadingClassName="grid place-items-center bg-sidebar-accent text-sidebar-foreground/70"
								leading={<Icon className="size-[1.125rem]" />}
								menu={
									<>
										<ContextMenuItem onClick={openLibrarySettings}>
											<Settings />
											Settings
										</ContextMenuItem>
										{canManageLibraries && (
											<>
												<ContextMenuItem
													onClick={() =>
														scanMutation.mutate({ libraryId: lib.id })
													}
												>
													<RefreshCw />
													Scan now
												</ContextMenuItem>
												<ContextMenuSeparator />
												<ContextMenuItem
													variant="destructive"
													onClick={() =>
														setDeleteTarget({
															kind: "library",
															id: lib.id,
															name: lib.name ?? "Untitled library",
														})
													}
												>
													<Trash2 />
													Delete
												</ContextMenuItem>
											</>
										)}
									</>
								}
							/>
						);
					})
				) : (
					<p className="px-3 py-3 text-sidebar-foreground/50 text-xs">
						No libraries yet
					</p>
				)}
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
				title="Create collection"
				description="Create a new collection and choose if it is public or private."
				footer={
					<>
						<Button
							type="button"
							variant="outline"
							disabled={createMutation.isPending}
							onClick={() => setIsCreateOpen(false)}
						>
							Cancel
						</Button>
						<Button
							type="submit"
							disabled={createMutation.isPending || newName.trim().length === 0}
						>
							{createMutation.isPending ? (
								<Loader2 className="animate-spin" data-icon="inline-start" />
							) : (
								<FolderPlus data-icon="inline-start" />
							)}
							Create
						</Button>
					</>
				}
			>
				<div className="space-y-1.5">
					<Label htmlFor="sidebar-new-collection-name">Collection name</Label>
					<Input
						id="sidebar-new-collection-name"
						value={newName}
						onChange={(event) => setNewName(event.target.value)}
						placeholder="Favorites, Weekend Reads..."
						maxLength={80}
						autoFocus
					/>
				</div>

				<Label
					htmlFor={publicFieldId}
					className="justify-between rounded-md border border-border/70 bg-background/60 px-3 py-2"
				>
					<div className="space-y-0.5">
						<p className="font-medium text-sm">Public collection</p>
						<p className="text-muted-foreground text-xs">
							Others can discover this collection.
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
				title="Rename collection"
				footer={
					<>
						<Button
							type="button"
							variant="outline"
							disabled={renameMutation.isPending}
							onClick={() => setRenameTarget(null)}
						>
							Cancel
						</Button>
						<Button
							type="submit"
							disabled={
								renameMutation.isPending || renameValue.trim().length === 0
							}
						>
							{renameMutation.isPending && (
								<Loader2 className="animate-spin" data-icon="inline-start" />
							)}
							Save
						</Button>
					</>
				}
			>
				<div className="space-y-1.5">
					<Label htmlFor="sidebar-rename-collection-name">
						Collection name
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
			<AlertDialog
				open={deleteTarget !== null}
				onOpenChange={(open) => {
					if (!open) setDeleteTarget(null);
				}}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>
							Delete{" "}
							{deleteTarget?.kind === "library" ? "library" : "collection"}?
						</AlertDialogTitle>
						<AlertDialogDescription>
							{deleteTarget?.kind === "library"
								? `"${deleteTarget?.name}" and all of its imported books will be removed. This cannot be undone.`
								: `"${deleteTarget?.name}" will be deleted. The books inside it are not affected.`}
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
						<AlertDialogAction
							onClick={(event) => {
								event.preventDefault();
								confirmDelete();
							}}
							disabled={isDeleting}
							className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
						>
							{isDeleting && (
								<Loader2 className="animate-spin" data-icon="inline-start" />
							)}
							Delete
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</SidebarGroup>
	);
}
