import {
	ArrowsClockwise,
	BookOpen,
	CircleNotch,
	Folder,
	FolderPlus,
	GearSix,
	Globe,
	Headphones,
	Lock,
	Pencil,
	Plus,
	Trash,
} from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, type LinkProps } from "@tanstack/react-router";
import { type FormEvent, type ReactNode, useId, useState } from "react";
import { toast } from "sonner";
import { useSettingsModal } from "@/components/layout/settings-modal-context";
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
import { SidebarGroup, useSidebar } from "@/components/ui/sidebar";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { useAbilities } from "@/hooks/use-abilities";
import { cn } from "@/lib/utils";
import { m } from "@/paraglide/messages";
import {
	coverPresets,
	getCoverFilename,
	getCoverPresetUrl,
} from "@/utils/covers";
import { orpc } from "@/utils/orpc";

type Collection = {
	id: string;
	name: string;
	bookCount: number;
	previewCovers?: string[] | null;
};

type DeleteTarget =
	| { kind: "collection"; id: string; name: string }
	| { kind: "library"; id: string; name: string };

// pl-3 lines the thumbnail up with the nav item icons (group p-2 + px-3).
// Collapsing to the icon rail mirrors SidebarMenuButton: the row shrinks to
// size-8 and overflow-hidden clips the text as the sidebar animates, so it
// stays in step with the nav items stacked above instead of snapping.
const rowClass = (active: boolean) =>
	cn(
		// w-full (not auto) so the collapse can interpolate width 100%→2rem;
		// CSS can't animate from `auto`, which is why the text used to snap.
		"flex w-full items-center gap-2.5 overflow-hidden rounded-md py-1.5 pr-2 pl-3",
		"transition-[width,height,padding] duration-200 hover:bg-sidebar-accent/60",
		"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring",
		"group-data-[collapsible=icon]:size-8! group-data-[collapsible=icon]:p-2!",
		active && "bg-sidebar-accent",
	);

const nameClass = (active: boolean) =>
	cn(
		"truncate font-medium text-sm leading-tight",
		active ? "text-sidebar-foreground" : "text-muted-foreground",
	);

// Labelled "My Stuff" subsection: a header (label + count + optional action)
// over its children. The label stays flush-left like SidebarGroupLabel/"Browse".
function Section({
	label,
	action,
	children,
}: {
	label: string;
	action?: ReactNode;
	children: ReactNode;
}) {
	return (
		<div>
			{/* px-2.5 lines the label up with SidebarGroupLabel ("Browse"); the
			    action sits near the items' right edge. */}
			<div className="flex h-8 items-center pr-2 pl-2.5 group-data-[collapsible=icon]:hidden">
				<span className="flex-1 font-semibold text-sidebar-foreground/70 text-sm">
					{label}
				</span>
				{action}
			</div>
			<div className="space-y-0.5 pb-1">{children}</div>
		</div>
	);
}

const addButtonClass = cn(
	"size-6 rounded-md text-sidebar-foreground/60 hover:text-sidebar-foreground",
);

// Shared sidebar row used by shelves, collections and libraries. The only
// differences are the leading visual (cover vs icon), where it links,
// and the context-menu actions — all passed in by the caller.
function SidebarItem({
	leading,
	leadingClassName,
	collapsedIcon,
	title,
	subtitle,
	active = false,
	link,
	onNavigate,
	onClick,
	menu,
}: {
	/** Rich leading tile (cover / accent icon box) shown when expanded. */
	leading: ReactNode;
	leadingClassName?: string;
	/** Bare line icon shown in the collapsed rail, matching the nav above. */
	collapsedIcon: ReactNode;
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
	const { state, isMobile } = useSidebar();
	const inner = (
		<>
			<div
				className={cn(
					"size-8 flex-none overflow-hidden rounded-md group-data-[collapsible=icon]:hidden",
					leadingClassName,
				)}
			>
				{leading}
			</div>
			{/* Collapsed rail: swap the tile for a bare size-4 line icon so the row
			    reads like the nav items stacked above it. */}
			<div
				className={cn(
					"hidden flex-none place-items-center group-data-[collapsible=icon]:grid [&>svg]:size-4",
					active ? "text-sidebar-foreground" : "text-muted-foreground",
				)}
			>
				{collapsedIcon}
			</div>
			{/* Not display:none when collapsed — overflow-hidden on the row clips it
			    as the sidebar animates, matching the nav's shrink. */}
			<div className="min-w-0 flex-1">
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

	// Nested asChild triggers: the context menu wraps the tooltip, which wraps
	// the row — both merge their handlers onto the same DOM node. The tooltip
	// only surfaces the title in the collapsed rail, where the label is hidden.
	const trigger = menu ? (
		<ContextMenuTrigger asChild>{row}</ContextMenuTrigger>
	) : (
		row
	);

	const tooltipped = (
		<Tooltip>
			<TooltipTrigger asChild>{trigger}</TooltipTrigger>
			<TooltipContent
				side="right"
				align="center"
				hidden={state !== "collapsed" || isMobile}
			>
				{title}
			</TooltipContent>
		</Tooltip>
	);

	if (!menu) return tooltipped;

	return (
		<ContextMenu>
			{tooltipped}
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
	const { can } = useAbilities();
	const canManageLibraries = can("library", "create");
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
	const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
	const publicFieldId = useId();

	// Collections is the same query the rest of the app uses, so React Query
	// dedupes it; it only fetches when the user can read collections.
	const collections = useQuery({
		...orpc.collections.list.queryOptions(),
		staleTime: 30_000,
		enabled: canReadCollections,
	});
	const libraries = useQuery({
		...orpc.libraries.getLibraries.queryOptions(),
		staleTime: 30_000,
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

	const scanMutation = useMutation({
		...orpc.libraries.scanLibrary.mutationOptions(),
		onSuccess: () => toast.success(m["toast.library_scan_started"]()),
		onError: (err) => toast.error(err.message),
	});

	const deleteLibraryMutation = useMutation({
		...orpc.libraries.deleteLibrary.mutationOptions(),
		onSuccess: () => {
			// Deleting a library cascade-deletes books/series/authors/progress —
			// stale book queries would keep showing them, so flush every cache
			queryClient.invalidateQueries();
			setDeleteTarget(null);
			toast.success(m["toast.library_deleted"]());
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
			deleteLibraryMutation.mutate({ uuid: deleteTarget.id });
		}
	};

	const isDeleting =
		deleteCollectionMutation.isPending || deleteLibraryMutation.isPending;

	const emptyHint = (text: string) => (
		<p className="px-3 py-2 text-sidebar-foreground/50 text-xs group-data-[collapsible=icon]:hidden">
			{text}
		</p>
	);

	return (
		<SidebarGroup className="pt-0">
			<div className="space-y-1 pt-1">
				<div className={cn(libraries.isLoading && "hidden")}>
					<Section
						label={m["nav.libraries"]()}
						action={
							canManageLibraries && (
								<Button
									variant="ghost"
									size="icon-xs"
									aria-label={m["library.add"]()}
									onClick={openLibrarySettings}
									className={addButtonClass}
								>
									<Plus className="size-4" />
								</Button>
							)
						}
					>
						{libraries.isLoading
							? null
							: libraries.data?.length
								? libraries.data.map((lib) => {
										const Icon =
											lib.mediaType === "audiobook" ? Headphones : BookOpen;
										const typeLabel =
											lib.mediaType === "audiobook"
												? m["media.audiobook"]()
												: m["media.ebook"]();
										return (
											<SidebarItem
												key={lib.uuid}
												link={{
													to: "/dashboard/libraries/$uuid",
													params: { uuid: lib.uuid },
												}}
												active={locationPathname.startsWith(
													`/dashboard/libraries/${lib.uuid}`,
												)}
												onNavigate={onNavigate}
												title={lib.name ?? m["library.untitled"]()}
												subtitle={m["library.subtitle"]({ type: typeLabel })}
												leadingClassName="grid place-items-center bg-sidebar-accent text-sidebar-foreground/70"
												leading={<Icon className="size-4" />}
												collapsedIcon={<Icon />}
												menu={
													<>
														<ContextMenuItem onClick={openLibrarySettings}>
															<GearSix />
															{m["nav.settings"]()}
														</ContextMenuItem>
														{canManageLibraries && (
															<>
																<ContextMenuItem
																	onClick={() =>
																		scanMutation.mutate({
																			libraryUuid: lib.uuid,
																		})
																	}
																>
																	<ArrowsClockwise />
																	{m["library.scan_now"]()}
																</ContextMenuItem>
																<ContextMenuSeparator />
																<ContextMenuItem
																	variant="destructive"
																	onClick={() =>
																		setDeleteTarget({
																			kind: "library",
																			id: lib.uuid,
																			name: lib.name ?? m["library.untitled"](),
																		})
																	}
																>
																	<Trash />
																	{m["common.delete"]()}
																</ContextMenuItem>
															</>
														)}
													</>
												}
											/>
										);
									})
								: emptyHint(m["library.none"]())}
					</Section>
				</div>

				{canReadCollections && (
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
						{collections.isLoading
							? null
							: collections.data?.length
								? collections.data.map((c) => {
										const coverFilename = getCoverFilename(
											c.previewCovers?.[0],
										);
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
														<Folder className="size-4" />
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
																	onClick={() =>
																		setDeleteTarget({
																			kind: "collection",
																			id: c.id,
																			name: c.name,
																		})
																	}
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
								: emptyHint(m["collection.none"]())}
					</Section>
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
				title={
					deleteTarget?.kind === "library"
						? m["library.delete_title"]()
						: m["collection.delete_title"]()
				}
				description={
					deleteTarget?.kind === "library"
						? m["library.delete_desc"]({ name: deleteTarget?.name ?? "" })
						: m["collection.delete_desc"]({ name: deleteTarget?.name ?? "" })
				}
				footer={
					<>
						<Button
							type="button"
							variant="outline"
							disabled={isDeleting}
							onClick={() => setDeleteTarget(null)}
						>
							{m["common.cancel"]()}
						</Button>
						<Button
							type="button"
							disabled={isDeleting}
							onClick={confirmDelete}
							className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
						>
							{isDeleting && (
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
