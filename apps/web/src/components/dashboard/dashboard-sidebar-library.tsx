import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, type LinkProps, useLocation } from "@tanstack/react-router";
import {
	BookCheck,
	Bookmark,
	BookOpen,
	ChevronLeft,
	ChevronRight,
	FolderPlus,
	Headphones,
	Layers,
	Library,
	Loader2,
	Pencil,
	Plus,
	RefreshCw,
	Settings,
	Trash2,
	X,
} from "lucide-react";
import { type FormEvent, type ReactNode, useId, useRef, useState } from "react";
import { toast } from "sonner";
import { useSettingsModal } from "@/components/layout/settings-modal-context";
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
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { SidebarGroup, SidebarMenuSkeleton } from "@/components/ui/sidebar";
import { useAbilities } from "@/hooks/use-abilities";
import { useWindowEvent } from "@/hooks/use-window-event";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/utils";
import {
	coverPresets,
	getCoverFilename,
	getCoverPresetUrl,
} from "@/utils/covers";
import { orpc } from "@/utils/orpc";

type LibraryFilter = "collections" | "libraries" | "shelves";

const FILTERS: LibraryFilter[] = ["collections", "libraries", "shelves"];

type ShelfStatus = "want_to_read" | "backlog" | "reading" | "completed";

const SHELF_SECTIONS: Array<{
	status: ShelfStatus;
	label: string;
	icon: typeof BookOpen;
}> = [
	{ status: "reading", label: "Reading", icon: BookOpen },
	{ status: "completed", label: "Completed", icon: BookCheck },
	{ status: "backlog", label: "Backlog", icon: Layers },
	{ status: "want_to_read", label: "Want to read", icon: Bookmark },
];

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
		"flex items-center gap-3 rounded-md py-2 pr-2 pl-3",
		"transition-colors hover:bg-sidebar-accent/60",
		"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring",
		active && "bg-sidebar-accent",
	);

const nameClass = (active: boolean) =>
	cn(
		"truncate text-sidebar-foreground text-sm leading-tight",
		active ? "font-semibold" : "font-medium",
	);

// null = no filter (everything shown).
function readStoredFilter(): LibraryFilter | null {
	if (typeof window === "undefined") return null;
	const stored = window.localStorage.getItem("nh-sidebar-filter");
	return FILTERS.includes(stored as LibraryFilter)
		? (stored as LibraryFilter)
		: null;
}

// Shared sidebar row used by shelves, collections and libraries. The only
// differences are the leading visual (cover vs icon), where it links,
// and the context-menu actions — all passed in by the caller.
function SidebarItem({
	leading,
	leadingClassName,
	title,
	subtitle,
	active = false,
	link,
	onNavigate,
	onClick,
	menu,
}: {
	leading: ReactNode;
	leadingClassName?: string;
	title: string;
	subtitle: string;
	active?: boolean;
	/** When set, the row links to this location. */
	link?: Pick<LinkProps, "to" | "params" | "search">;
	onNavigate?: () => void;
	/** Click action for non-link rows (e.g. open library settings). */
	onClick?: () => void;
	menu?: ReactNode;
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

	const row = link ? (
		<Link
			{...link}
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
	);

	if (!menu) return row;

	return (
		<ContextMenu>
			<ContextMenuTrigger asChild>{row}</ContextMenuTrigger>
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
	const { openOrgSettings } = useSettingsModal();
	const queryClient = useQueryClient();
	const locationSearch = useLocation({
		select: (location) => location.search as { shelf?: string },
	});
	const [filter, setFilter] = useState<LibraryFilter | null>(readStoredFilter);
	const [isCreateOpen, setIsCreateOpen] = useState(false);
	const [newName, setNewName] = useState("");
	const [newIsPublic, setNewIsPublic] = useState(false);
	const [renameTarget, setRenameTarget] = useState<Collection | null>(null);
	const [renameValue, setRenameValue] = useState("");
	const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
	const publicFieldId = useId();

	const switchFilter = (f: LibraryFilter | null) => {
		setFilter(f);
		if (typeof window !== "undefined") {
			if (f) window.localStorage.setItem("nh-sidebar-filter", f);
			else window.localStorage.removeItem("nh-sidebar-filter");
		}
	};

	// Chip row overflow: track whether each edge is scrollable so the arrows
	// only render when there is hidden content on that side.
	const chipScrollerRef = useRef<HTMLDivElement | null>(null);
	const [chipScroll, setChipScroll] = useState({ left: false, right: false });
	const updateChipScroll = () => {
		const el = chipScrollerRef.current;
		if (!el) return;
		const left = el.scrollLeft > 1;
		const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
		setChipScroll((prev) =>
			prev.left === left && prev.right === right ? prev : { left, right },
		);
	};
	useWindowEvent("resize", updateChipScroll);
	const scrollChips = (direction: -1 | 1) =>
		chipScrollerRef.current?.scrollBy({
			left: direction * 120,
			behavior: "smooth",
		});

	const showCollections = filter === null || filter === "collections";
	const showLibraries = filter === null || filter === "libraries";
	const showShelves = filter === null || filter === "shelves";

	// Only visible sections fetch; collections is the same query the rest of
	// the app uses, so React Query dedupes it.
	const collections = useQuery({
		...orpc.collections.list.queryOptions(),
		staleTime: 30_000,
		enabled: showCollections,
	});
	const libraries = useQuery({
		...orpc.libraries.getLibraries.queryOptions(),
		staleTime: 30_000,
		enabled: showLibraries,
	});
	const shelf = useQuery({
		...orpc.bookShelf.list.queryOptions({ input: { limit: 100 } }),
		staleTime: 30_000,
		enabled: showShelves,
	});

	const { data: session } = authClient.useSession();
	const canManageLibraries = useAbilities().can("library", "create");

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
			// Deleting a library cascade-deletes books/series/authors/progress —
			// stale book queries would keep showing them, so flush every cache
			queryClient.invalidateQueries();
			setDeleteTarget(null);
			toast.success("Library deleted");
		},
		onError: (err) => toast.error(err.message),
	});

	const openLibrarySettings = () => openOrgSettings("libraries");

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

	const username = (session?.user as { username?: string } | undefined)
		?.username;
	const shelfGroups = SHELF_SECTIONS.map((section) => ({
		...section,
		books: (shelf.data ?? []).filter((b) => b.status === section.status),
	})).filter((group) => group.books.length > 0);

	const isLoading =
		(showCollections && collections.isLoading) ||
		(showLibraries && libraries.isLoading) ||
		(showShelves && shelf.isLoading);
	const isEmpty =
		(!showShelves || !shelfGroups.length) &&
		(!showCollections || !collections.data?.length) &&
		(!showLibraries || !libraries.data?.length);
	const isDeleting =
		deleteCollectionMutation.isPending || deleteLibraryMutation.isPending;

	return (
		<SidebarGroup className="flex min-h-0 flex-1 flex-col pt-0">
			{/* header — matches SidebarGroupLabel typography (see Browse) */}
			<div className="flex h-8 items-center pr-1.5 pl-3 group-data-[collapsible=icon]:hidden">
				<span className="flex-1 font-semibold text-sidebar-foreground/70 text-sm">
					My Stuff
				</span>
				{canManageLibraries ? (
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button
								variant="ghost"
								size="icon-xs"
								aria-label="Add"
								className="size-6 rounded-md text-sidebar-foreground/60 hover:text-sidebar-foreground"
							>
								<Plus className="size-4" />
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end" className="w-44">
							<DropdownMenuItem onClick={() => setIsCreateOpen(true)}>
								<FolderPlus />
								New collection
							</DropdownMenuItem>
							<DropdownMenuItem onClick={openLibrarySettings}>
								<Library />
								Add library
							</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>
				) : (
					<Button
						variant="ghost"
						size="icon-xs"
						aria-label="New collection"
						onClick={() => setIsCreateOpen(true)}
						className="size-6 rounded-md text-sidebar-foreground/60 hover:text-sidebar-foreground"
					>
						<Plus className="size-4" />
					</Button>
				)}
			</div>

			{/* filter chips — Spotify-style: a single scrollable row; picking one
			    hides the rest and shows a leading ✕ to clear the filter. Edge
			    arrows appear only when chips overflow. The key remounts the
			    scroller when the chip set changes so the ref callback re-measures. */}
			<div className="relative px-3 pt-1 pb-2.5 group-data-[collapsible=icon]:hidden">
				<div
					key={filter ?? "none"}
					ref={(el) => {
						chipScrollerRef.current = el;
						if (el) updateChipScroll();
					}}
					onScroll={updateChipScroll}
					className="scrollbar-none flex gap-1.5 overflow-x-auto"
				>
					{filter !== null && (
						<button
							type="button"
							onClick={() => switchFilter(null)}
							aria-label="Clear filter"
							className={cn(
								"grid size-7 flex-none place-items-center rounded-full bg-sidebar-accent text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent/70",
								"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring",
							)}
						>
							<X className="size-3.5" />
						</button>
					)}
					{FILTERS.filter((f) => filter === null || filter === f).map((f) => (
						<button
							key={f}
							type="button"
							onClick={() => switchFilter(filter === f ? null : f)}
							aria-pressed={filter === f}
							className={cn(
								"flex-none whitespace-nowrap rounded-full px-2.5 py-1.5 font-semibold text-xs capitalize transition-colors",
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

				{chipScroll.left && (
					<div className="absolute top-1 bottom-2.5 left-3 flex items-center bg-gradient-to-r from-sidebar via-sidebar/80 to-transparent pr-3">
						<button
							type="button"
							onClick={() => scrollChips(-1)}
							aria-label="Scroll chips left"
							className="grid size-7 place-items-center text-sidebar-foreground/70 transition-colors hover:text-sidebar-foreground"
						>
							<ChevronLeft className="size-4" />
						</button>
					</div>
				)}
				{chipScroll.right && (
					<div className="absolute top-1 right-3 bottom-2.5 flex items-center bg-gradient-to-l from-sidebar via-sidebar/80 to-transparent pl-3">
						<button
							type="button"
							onClick={() => scrollChips(1)}
							aria-label="Scroll chips right"
							className="grid size-7 place-items-center text-sidebar-foreground/70 transition-colors hover:text-sidebar-foreground"
						>
							<ChevronRight className="size-4" />
						</button>
					</div>
				)}
			</div>

			{/* list — the only part of the sidebar that scrolls */}
			<div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto">
				{isLoading ? (
					<>
						<SidebarMenuSkeleton showIcon />
						<SidebarMenuSkeleton showIcon />
						<SidebarMenuSkeleton showIcon />
					</>
				) : isEmpty ? (
					<p className="px-3 py-3 text-sidebar-foreground/50 text-xs">
						{filter === "collections"
							? "No collections yet"
							: filter === "libraries"
								? "No libraries yet"
								: filter === "shelves"
									? "No shelved books yet"
									: "Nothing here yet"}
					</p>
				) : (
					<>
						{showCollections &&
							collections.data?.map((c) => {
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
							})}

						{showLibraries &&
							libraries.data?.map((lib) => {
								const Icon =
									lib.mediaType === "audiobook" ? Headphones : BookOpen;
								const typeLabel =
									lib.mediaType.charAt(0).toUpperCase() +
									lib.mediaType.slice(1);
								return (
									<SidebarItem
										key={lib.id}
										title={lib.name ?? "Untitled library"}
										subtitle={`Library · ${typeLabel}`}
										onClick={openLibrarySettings}
										leadingClassName="grid place-items-center bg-sidebar-accent text-sidebar-foreground/70"
										leading={<Icon className="size-5" />}
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
							})}

						{username &&
							showShelves &&
							shelfGroups.map((group) => {
								const coverFilename = getCoverFilename(
									group.books.find((b) => b.cover)?.cover,
								);
								const Icon = group.icon;
								return (
									<SidebarItem
										key={group.status}
										link={{
											to: "/dashboard/user/$username",
											params: { username },
											search: { tab: "books", shelf: group.status },
										}}
										active={
											locationPathname === `/dashboard/user/${username}` &&
											locationSearch.shelf === group.status
										}
										onNavigate={onNavigate}
										title={group.label}
										subtitle={`Shelf · ${group.books.length} ${
											group.books.length === 1 ? "book" : "books"
										}`}
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
												<Icon className="size-5" />
											)
										}
									/>
								);
							})}
					</>
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
