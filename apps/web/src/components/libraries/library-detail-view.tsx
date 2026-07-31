import type { LibraryComplete } from "@nanahoshi-v2/api/routers/libraries/library.model";
import {
	ArrowLeft,
	ArrowsClockwise,
	BookOpen,
	CaretDown,
	CircleNotch,
	Database,
	FolderOpen,
	Headphones,
	ListMagnifyingGlass,
	LockKey,
	MagicWand,
	PencilSimple,
	Sparkle,
	Stack,
	Trash,
	UploadSimple,
	Warning,
	WarningCircle,
	Wrench,
} from "@phosphor-icons/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { type ReactNode, type RefObject, useRef, useState } from "react";
import { toast } from "sonner";
import { LibraryPermissionsPanel } from "@/components/libraries/library-permissions-panel";
import {
	LibraryTaskProgress,
	useLibraryTasks,
} from "@/components/libraries/library-task-progress";
import { hasEnabledLibraryPath } from "@/components/libraries/library-ui-state";
import { UploadBooksModal } from "@/components/libraries/upload-books-modal";
import {
	SettingControlRow,
	SettingRows,
} from "@/components/settings/setting-rows";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { useAbilities } from "@/hooks/use-abilities";
import { cn } from "@/lib/utils";
import { m } from "@/paraglide/messages";
import { formatRelativeTime } from "@/utils/format";
import { orpc, queryClient } from "@/utils/orpc";
import { FoldersSection } from "./library-detail/folders-section";
import { GeneralSection } from "./library-detail/general-section";
import { MetadataSection } from "./library-detail/metadata-section";
import { ScanningSection } from "./library-detail/scanning-section";
import { folderStateLabel, invalidateLibraries } from "./library-detail/utils";

type LibraryAdvancedPanel = "metadata" | "access";

export function LibraryDetailView({
	library,
	bookCount,
	lastScannedAt = null,
	initialShowAddFolder = false,
	initialRename = false,
	onBack,
}: {
	library: LibraryComplete;
	bookCount?: number;
	lastScannedAt?: string | null;
	initialShowAddFolder?: boolean;
	initialRename?: boolean;
	onBack: () => void;
}) {
	const { can } = useAbilities();
	const canManage = can("library", "update");
	const canManagePaths = can("library", "managePaths");
	const canManageProviders = can("library", "manageProviders");
	const canScan = can("library", "scan");
	const canUpload =
		can("library", "upload") && library.mediaType !== "audiobook";
	const canManageAccess = can("library", "manageAccess");
	const canDelete = can("library", "delete");

	const [uploadOpen, setUploadOpen] = useState(false);
	const [deleteOpen, setDeleteOpen] = useState(false);
	const [fullScanOpen, setFullScanOpen] = useState(false);
	const [regroupOpen, setRegroupOpen] = useState(false);
	const [discardOpen, setDiscardOpen] = useState(false);
	const [showAddFolder, setShowAddFolder] = useState(initialShowAddFolder);
	const [panelDirty, setPanelDirty] = useState(false);
	const [activePanel, setActivePanel] = useState<LibraryAdvancedPanel | null>(
		null,
	);
	const panelButtons = useRef<
		Partial<Record<LibraryAdvancedPanel, HTMLElement | null>>
	>({});
	const sectionTitleRef = useRef<HTMLHeadingElement>(null);
	const foldersSectionRef = useRef<HTMLDivElement>(null);

	const scanMutation = useMutation({
		...orpc.libraries.scanLibrary.mutationOptions(),
		onSuccess: () => toast.success(m["library.scan_started"]()),
		onError: (err) => toast.error(err.message),
	});

	const reprocessMutation = useMutation({
		...orpc.libraries.reprocessLibrary.mutationOptions(),
		onSuccess: () => toast.success(m["library.reprocess_started"]()),
		onError: (err) => toast.error(err.message),
	});

	const regroupMutation = useMutation({
		...orpc.libraries.regroupLibrary.mutationOptions(),
		onSuccess: () => {
			setRegroupOpen(false);
			toast.success(m["library.regroup_started"]());
		},
		onError: (err) => toast.error(err.message),
	});

	const enrichMutation = useMutation({
		...orpc.libraries.enrichLibrary.mutationOptions(),
		onSuccess: () => toast.success(m["library.enrich_started"]()),
		onError: (err) => toast.error(err.message),
	});

	const deleteMutation = useMutation({
		...orpc.libraries.deleteLibrary.mutationOptions(),
		onSuccess: () => {
			setDeleteOpen(false);
			queryClient.invalidateQueries();
			toast.success(m["library.deleted"]());
			onBack();
		},
		onError: (err) => toast.error(err.message),
	});

	// Folder reachability is probed server-side on read, so opening a library is
	// also what clears a folder that came back online.
	const {
		data: health,
		isFetching: isHealthFetching,
		refetch: refetchHealth,
	} = useQuery({
		...orpc.libraries.getLibraryPathHealth.queryOptions({
			input: { libraryUuid: library.uuid },
		}),
		// Reachability changes without any user action (drive unmounted, share
		// revoked), so it must not ride the app-wide 5-minute staleTime.
		staleTime: 0,
		refetchOnMount: "always",
	});
	const runningTask = useLibraryTasks().get(library.id);
	const unreachable = (health ?? []).filter(
		(folder) => folder.isEnabled && folder.state !== "ok",
	);

	const pathCount = library.paths?.length ?? 0;
	const hasEnabledPaths = hasEnabledLibraryPath(library);
	const libraryName = library.name ?? m["library.untitled"]();
	const LibraryIcon = library.mediaType === "audiobook" ? Headphones : BookOpen;
	const typeLabel =
		library.mediaType === "audiobook"
			? m["media.audiobook"]()
			: m["media.ebook"]();
	const contentCount =
		bookCount === undefined
			? null
			: library.mediaType === "audiobook"
				? m["media.audiobook_count"]({ count: bookCount })
				: m["media.book_count"]({ count: bookCount });

	const metadataSummary = getMetadataSummary(library);

	const openPanel = (panel: LibraryAdvancedPanel) => {
		setPanelDirty(false);
		setActivePanel(panel);
		requestAnimationFrame(() => sectionTitleRef.current?.focus());
	};

	const leavePanel = () => {
		if (!activePanel) return;
		const previous = activePanel;
		setPanelDirty(false);
		setActivePanel(null);
		requestAnimationFrame(() => panelButtons.current[previous]?.focus());
	};

	const handleBack = () => {
		if (activePanel !== null) {
			if (panelDirty) {
				setDiscardOpen(true);
				return;
			}
			leavePanel();
			return;
		}
		onBack();
	};

	const requestAddFolder = () => {
		setShowAddFolder(true);
		requestAnimationFrame(() =>
			foldersSectionRef.current?.scrollIntoView({ block: "start" }),
		);
	};

	return (
		<>
			<div className="flex flex-col gap-8">
				<header className="flex flex-col gap-5">
					<Button
						type="button"
						variant="ghost"
						size="sm"
						className="self-start"
						onClick={handleBack}
					>
						<ArrowLeft data-icon="inline-start" />
						{activePanel !== null
							? m["library.overview_back"]()
							: m["library.breadcrumb"]()}
					</Button>

					<div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
						<div className="flex min-w-0 items-center gap-3">
							<div className="grid size-11 shrink-0 place-items-center rounded-xl bg-secondary text-secondary-foreground">
								<LibraryIcon className="size-5" weight="duotone" />
							</div>
							<div className="min-w-0">
								<LibraryName
									library={library}
									canManage={canManage}
									startEditing={initialRename}
								/>
								<p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-muted-foreground text-sm">
									<span>{typeLabel}</span>
									{contentCount && (
										<>
											<span aria-hidden>·</span>
											<span>{contentCount}</span>
										</>
									)}
									<span aria-hidden>·</span>
									<span>{m["library.folder_count"]({ count: pathCount })}</span>
									<span aria-hidden>·</span>
									<span>
										{lastScannedAt
											? m["library.last_scanned"]({
													time: formatRelativeTime(lastScannedAt),
												})
											: m["library.never_scanned"]()}
									</span>
								</p>
							</div>
						</div>

						{activePanel === null && (
							<div className="flex shrink-0 flex-wrap gap-2">
								{canUpload && hasEnabledPaths && (
									<Button size="sm" onClick={() => setUploadOpen(true)}>
										<UploadSimple data-icon="inline-start" />
										{m["library.upload_books"]()}
									</Button>
								)}
								{canScan && (
									<div className="flex">
										<Button
											variant="outline"
											size="sm"
											className="rounded-e-none"
											onClick={() =>
												scanMutation.mutate({
													libraryUuid: library.uuid,
													mode: "incremental",
												})
											}
											disabled={
												!hasEnabledPaths ||
												scanMutation.isPending ||
												runningTask !== undefined
											}
										>
											{scanMutation.isPending || runningTask !== undefined ? (
												<CircleNotch
													data-icon="inline-start"
													className="animate-spin"
												/>
											) : (
												<ArrowsClockwise data-icon="inline-start" />
											)}
											{m["library.discover_files"]()}
										</Button>
										<DropdownMenu>
											<DropdownMenuTrigger asChild>
												<Button
													variant="outline"
													size="icon-sm"
													className="rounded-s-none border-s-0"
													disabled={
														!hasEnabledPaths ||
														scanMutation.isPending ||
														runningTask !== undefined
													}
													aria-label={m["library.scan_options"]()}
												>
													<CaretDown />
												</Button>
											</DropdownMenuTrigger>
											<DropdownMenuContent align="end">
												<DropdownMenuItem onClick={() => setFullScanOpen(true)}>
													<ArrowsClockwise data-icon="inline-start" />
													{m["library.full_scan"]()}
												</DropdownMenuItem>
											</DropdownMenuContent>
										</DropdownMenu>
									</div>
								)}
							</div>
						)}
					</div>

					{/* What the library is doing right now, in place of a toast that has
					    already vanished by the time the user looks. */}
					{runningTask && (
						<LibraryTaskProgress
							task={runningTask}
							barClassName="w-full max-w-sm"
						/>
					)}

					{activePanel === null && !hasEnabledPaths && (
						<LibraryAlert
							tone="warning"
							title={m["library.status_needs_folder"]()}
							description={m["library.status_needs_folder_desc"]()}
							action={
								canManagePaths ? (
									<Button size="sm" onClick={requestAddFolder}>
										<FolderOpen data-icon="inline-start" />
										{m["library.connect_folder"]()}
									</Button>
								) : undefined
							}
						/>
					)}

					{activePanel === null && unreachable.length > 0 && (
						<LibraryAlert
							tone="destructive"
							title={m["library.folders_unreachable"]({
								count: unreachable.length,
							})}
							description={m["library.folders_unreachable_desc"]()}
							action={
								<Button
									variant="outline"
									size="sm"
									onClick={() => void refetchHealth()}
									disabled={isHealthFetching}
								>
									{isHealthFetching ? (
										<CircleNotch
											data-icon="inline-start"
											className="animate-spin"
										/>
									) : (
										<ArrowsClockwise data-icon="inline-start" />
									)}
									{m["library.folders_recheck"]()}
								</Button>
							}
						>
							<ul className="flex flex-col gap-1">
								{unreachable.map((folder) => (
									<li
										key={folder.pathId}
										className="break-all font-mono text-xs"
									>
										{folder.path}
										<span className="font-sans text-muted-foreground">
											{" — "}
											{folderStateLabel(folder.state)}
										</span>
									</li>
								))}
							</ul>
						</LibraryAlert>
					)}
				</header>

				{activePanel === null ? (
					<div className="flex flex-col gap-12">
						<div ref={foldersSectionRef}>
							<SettingsSection
								title={m["library.section_folders"]()}
								description={m["library.folders_hint"]()}
							>
								<FoldersSection
									library={library}
									canManage={canManagePaths}
									health={health}
									showAddPath={showAddFolder}
									onShowAddPathChange={setShowAddFolder}
								/>
							</SettingsSection>
						</div>

						{/* Scan schedule and visibility share one heading: each row already
						    explains itself, and two more h2s only added scrolling. */}
						<SettingsSection title={m["library.section_options"]()}>
							<ScanningSection library={library} canManage={canManage} />
							<GeneralSection library={library} canManage={canManage} />
						</SettingsSection>

						<Disclosure
							summary={m["library.section_advanced"]()}
							description={m["library.section_advanced_desc"]()}
						>
							<SettingRows>
								<SettingControlRow
									label={
										<AdvancedLabel
											icon={Database}
											title={m["library.section_metadata"]()}
										/>
									}
									description={metadataSummary}
								>
									<Button
										ref={(element) => {
											panelButtons.current.metadata = element;
										}}
										type="button"
										variant="outline"
										size="sm"
										onClick={() => openPanel("metadata")}
									>
										{canManageProviders
											? m["library.customize"]()
											: m["library.view_configuration"]()}
									</Button>
								</SettingControlRow>

								{canManageAccess && (
									<SettingControlRow
										label={
											<AdvancedLabel
												icon={LockKey}
												title={m["library.section_access"]()}
											/>
										}
										description={m["library.access_summary"]()}
									>
										<Button
											ref={(element) => {
												panelButtons.current.access = element;
											}}
											type="button"
											variant="outline"
											size="sm"
											onClick={() => openPanel("access")}
										>
											{m["library.manage_access"]()}
										</Button>
									</SettingControlRow>
								)}

								{canScan && library.mediaType !== "audiobook" && (
									<SettingControlRow
										label={
											<AdvancedLabel
												icon={Wrench}
												title={m["library.maintenance"]()}
											/>
										}
										description={m["library.maintenance_desc"]()}
									>
										<MaintenanceMenu
											reprocessPending={reprocessMutation.isPending}
											regroupPending={regroupMutation.isPending}
											enrichPending={enrichMutation.isPending}
											onReprocess={() =>
												reprocessMutation.mutate({
													libraryUuid: library.uuid,
												})
											}
											onEnrich={() =>
												enrichMutation.mutate({
													libraryUuid: library.uuid,
												})
											}
											onRegroup={() => setRegroupOpen(true)}
										/>
									</SettingControlRow>
								)}
								{canDelete && (
									<SettingControlRow
										label={
											<AdvancedLabel
												icon={Trash}
												title={m["library.delete_library"]()}
												tone="destructive"
											/>
										}
										description={m["library.delete_files_safe_hint"]()}
									>
										<Button
											type="button"
											variant="destructive"
											size="sm"
											className="shrink-0"
											onClick={() => setDeleteOpen(true)}
										>
											{m["library.delete_library"]()}
										</Button>
									</SettingControlRow>
								)}
							</SettingRows>
						</Disclosure>
					</div>
				) : (
					<div>
						{activePanel === "metadata" && (
							<SettingsSection
								headingRef={sectionTitleRef}
								title={m["library.section_metadata"]()}
								description={m["library.section_metadata_desc"]()}
							>
								<MetadataSection
									library={library}
									canManage={canManageProviders}
									onDirtyChange={setPanelDirty}
								/>
							</SettingsSection>
						)}

						{activePanel === "access" && canManageAccess && (
							<SettingsSection
								headingRef={sectionTitleRef}
								title={m["library.section_access"]()}
								description={m["library.section_access_desc"]()}
							>
								<LibraryPermissionsPanel
									libraryId={library.id}
									onDirtyChange={setPanelDirty}
								/>
							</SettingsSection>
						)}
					</div>
				)}
			</div>

			{canUpload && (
				<UploadBooksModal
					libraries={[library]}
					open={uploadOpen}
					onOpenChange={setUploadOpen}
				/>
			)}

			<Modal
				open={fullScanOpen}
				onOpenChange={setFullScanOpen}
				title={m["library.full_scan_confirm_title"]()}
				description={m["library.full_scan_confirm_desc"]()}
				footer={
					<>
						<Button
							type="button"
							variant="ghost"
							onClick={() => setFullScanOpen(false)}
						>
							{m["common.cancel"]()}
						</Button>
						<Button
							disabled={scanMutation.isPending}
							onClick={() =>
								scanMutation.mutate(
									{ libraryUuid: library.uuid, mode: "full" },
									{ onSuccess: () => setFullScanOpen(false) },
								)
							}
						>
							{scanMutation.isPending && (
								<CircleNotch
									data-icon="inline-start"
									className="animate-spin"
								/>
							)}
							{m["library.full_scan_action"]()}
						</Button>
					</>
				}
			/>

			<Modal
				open={regroupOpen}
				onOpenChange={setRegroupOpen}
				title={m["library.regroup_confirm_title"]()}
				description={m["library.regroup_confirm_desc"]()}
				footer={
					<>
						<Button
							type="button"
							variant="ghost"
							disabled={regroupMutation.isPending}
							onClick={() => setRegroupOpen(false)}
						>
							{m["common.cancel"]()}
						</Button>
						<Button
							type="button"
							disabled={regroupMutation.isPending}
							onClick={() =>
								regroupMutation.mutate({ libraryUuid: library.uuid })
							}
						>
							{regroupMutation.isPending && (
								<CircleNotch
									data-icon="inline-start"
									className="animate-spin"
								/>
							)}
							{m["library.regroup_confirm_action"]()}
						</Button>
					</>
				}
			/>

			<Modal
				open={deleteOpen}
				onOpenChange={setDeleteOpen}
				title={m["library.delete_title"]()}
				description={m["library.delete_desc"]({ name: libraryName })}
				footer={
					<>
						<Button
							type="button"
							variant="ghost"
							disabled={deleteMutation.isPending}
							onClick={() => setDeleteOpen(false)}
						>
							{m["common.cancel"]()}
						</Button>
						<Button
							type="button"
							variant="destructive"
							disabled={deleteMutation.isPending}
							onClick={() => deleteMutation.mutate({ uuid: library.uuid })}
						>
							{deleteMutation.isPending && (
								<CircleNotch
									data-icon="inline-start"
									className="animate-spin"
								/>
							)}
							{m["library.delete_library"]()}
						</Button>
					</>
				}
			/>

			<Modal
				open={discardOpen}
				onOpenChange={setDiscardOpen}
				title={m["library.unsaved_title"]()}
				description={m["library.unsaved_desc"]()}
				footer={
					<>
						<Button
							type="button"
							variant="ghost"
							onClick={() => setDiscardOpen(false)}
						>
							{m["library.keep_editing"]()}
						</Button>
						<Button
							type="button"
							variant="destructive"
							onClick={() => {
								setDiscardOpen(false);
								leavePanel();
							}}
						>
							{m["library.discard_changes"]()}
						</Button>
					</>
				}
			/>
		</>
	);
}

function AdvancedLabel({
	icon: Icon,
	title,
	tone = "default",
}: {
	icon: typeof Database;
	title: string;
	tone?: "default" | "destructive";
}) {
	return (
		<h3
			className={cn(
				"flex items-center gap-2 font-medium text-base",
				tone === "destructive" ? "text-destructive" : "text-foreground",
			)}
		>
			<Icon
				className={cn(
					"size-4.5",
					tone === "destructive" ? "text-destructive" : "text-muted-foreground",
				)}
				weight="duotone"
			/>
			{title}
		</h3>
	);
}

/** Editable library name: the most common change, so it lives in the header. */
function LibraryName({
	library,
	canManage,
	startEditing,
}: {
	library: LibraryComplete;
	canManage: boolean;
	startEditing: boolean;
}) {
	const [editing, setEditing] = useState(canManage && startEditing);
	const [draft, setDraft] = useState(library.name ?? "");

	const updateMutation = useMutation({
		...orpc.libraries.updateLibrary.mutationOptions(),
		onSuccess: () => {
			invalidateLibraries();
			toast.success(m["library.updated"]());
			setEditing(false);
		},
		onError: (err) => toast.error(err.message),
	});

	const commit = () => {
		const next = draft.trim();
		if (next === "" || next === (library.name ?? "")) {
			setEditing(false);
			return;
		}
		updateMutation.mutate({ uuid: library.uuid, name: next });
	};

	if (!editing) {
		const name = library.name ?? m["library.untitled"]();
		if (!canManage) {
			return (
				<h2 className="text-balance break-words font-semibold text-foreground text-xl">
					{name}
				</h2>
			);
		}
		return (
			<h2 className="text-balance break-words font-semibold text-foreground text-xl">
				<button
					type="button"
					className="group/rename inline-flex items-center gap-2 rounded text-start outline-none hover:text-foreground/80 focus-visible:ring-2 focus-visible:ring-ring"
					onClick={() => {
						setDraft(library.name ?? "");
						setEditing(true);
					}}
					aria-label={m["library.rename_name"]({ name })}
				>
					{name}
					<PencilSimple
						aria-hidden
						className="size-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover/rename:opacity-100 group-focus-visible/rename:opacity-100 motion-reduce:transition-none"
					/>
				</button>
			</h2>
		);
	}

	return (
		<form
			className="flex items-center gap-2"
			onSubmit={(event) => {
				event.preventDefault();
				commit();
			}}
		>
			<Input
				// biome-ignore lint/a11y/noAutofocus: the field replaces the heading the user just activated
				autoFocus
				value={draft}
				onChange={(event) => setDraft(event.target.value)}
				onKeyDown={(event) => {
					if (event.key === "Escape") setEditing(false);
				}}
				disabled={updateMutation.isPending}
				aria-label={m["library.name"]()}
				className="h-9 w-full max-w-xs font-semibold text-base"
			/>
			<Button type="submit" size="sm" disabled={updateMutation.isPending}>
				{updateMutation.isPending && (
					<CircleNotch data-icon="inline-start" className="animate-spin" />
				)}
				{m["common.save"]()}
			</Button>
			<Button
				type="button"
				variant="ghost"
				size="sm"
				onClick={() => setEditing(false)}
				disabled={updateMutation.isPending}
			>
				{m["common.cancel"]()}
			</Button>
		</form>
	);
}

/** Inline notice for a state the user has to act on (never for "all good"). */
function LibraryAlert({
	tone,
	title,
	description,
	action,
	children,
}: {
	tone: "warning" | "destructive";
	title: string;
	description: string;
	action?: ReactNode;
	children?: ReactNode;
}) {
	const Icon = tone === "destructive" ? WarningCircle : Warning;
	return (
		<div
			className={cn(
				"flex flex-col gap-3 rounded-xl p-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6",
				tone === "destructive"
					? "bg-destructive/10 text-destructive"
					: "bg-warning/10 text-warning",
			)}
		>
			<div className="flex min-w-0 gap-3">
				<Icon aria-hidden className="mt-0.5 size-5 shrink-0" weight="fill" />
				<div className="flex min-w-0 flex-col gap-1">
					<p className="font-medium text-sm">{title}</p>
					<p className="text-pretty text-foreground/80 text-sm leading-relaxed">
						{description}
					</p>
					{children}
				</div>
			</div>
			{action && <div className="shrink-0 self-start">{action}</div>}
		</div>
	);
}

/**
 * Collapsed by default: metadata routing, access, maintenance and deletion are
 * rare, and as always-open sections they buried the folder list under a scroll.
 */
function Disclosure({
	summary,
	description,
	children,
}: {
	summary: string;
	description: string;
	children: ReactNode;
}) {
	return (
		<details className="group/disclosure border-border border-t pt-6">
			<summary className="flex cursor-pointer list-none items-center justify-between gap-4 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring">
				<div className="flex min-w-0 flex-col gap-1">
					<h2 className="text-balance font-semibold text-foreground text-xl">
						{summary}
					</h2>
					<p className="max-w-2xl text-pretty text-muted-foreground text-sm leading-relaxed">
						{description}
					</p>
				</div>
				<CaretDown
					aria-hidden
					className="size-5 shrink-0 text-muted-foreground transition-transform group-open/disclosure:rotate-180 motion-reduce:transition-none"
				/>
			</summary>
			<div className="pt-6">{children}</div>
		</details>
	);
}

function MaintenanceMenu({
	reprocessPending,
	regroupPending,
	enrichPending,
	onReprocess,
	onEnrich,
	onRegroup,
}: {
	reprocessPending: boolean;
	regroupPending: boolean;
	enrichPending: boolean;
	onReprocess: () => void;
	onEnrich: () => void;
	onRegroup: () => void;
}) {
	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button variant="outline" size="sm">
					{m["library.open_maintenance"]()}
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent
				align="end"
				className="w-80 max-w-[calc(100vw-2rem)]"
			>
				<DropdownMenuGroup>
					<DropdownMenuItem disabled={reprocessPending} onClick={onReprocess}>
						{reprocessPending ? (
							<CircleNotch className="animate-spin" />
						) : (
							<MagicWand />
						)}
						<div className="flex min-w-0 flex-col gap-0.5">
							<span>{m["library.reprocess"]()}</span>
							<span className="text-muted-foreground text-xs">
								{m["library.reprocess_hint"]()}
							</span>
						</div>
					</DropdownMenuItem>
					<DropdownMenuItem disabled={enrichPending} onClick={onEnrich}>
						{enrichPending ? (
							<CircleNotch className="animate-spin" />
						) : (
							<Sparkle />
						)}
						<div className="flex min-w-0 flex-col gap-0.5">
							<span>{m["library.enrich"]()}</span>
							<span className="text-muted-foreground text-xs">
								{m["library.enrich_hint"]()}
							</span>
						</div>
					</DropdownMenuItem>
					<DropdownMenuItem disabled={regroupPending} onClick={onRegroup}>
						{regroupPending ? (
							<CircleNotch className="animate-spin" />
						) : (
							<Stack />
						)}
						<div className="flex min-w-0 flex-col gap-0.5">
							<span>{m["library.regroup"]()}</span>
							<span className="text-muted-foreground text-xs">
								{m["library.regroup_hint"]()}
							</span>
						</div>
					</DropdownMenuItem>
					<DropdownMenuItem asChild>
						<Link to="/dashboard/metadata">
							<ListMagnifyingGlass />
							<span>{m["enrichment.open_match_manager"]()}</span>
						</Link>
					</DropdownMenuItem>
				</DropdownMenuGroup>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

function getMetadataSummary(library: LibraryComplete): string {
	if (library.mediaType === "audiobook") {
		return m["library.metadata_audiobooks_summary"]();
	}
	if (!Array.isArray(library.metadataProviders)) {
		const profileId = library.metadataProviders.profile?.id;
		if (profileId === "general") {
			return m["library.metadata_summary"]({
				profile: m["library.metadata_profile_general"](),
			});
		}
		if (profileId === "light_novels") {
			return m["library.metadata_summary"]({
				profile: m["library.metadata_profile_light_novels"](),
			});
		}
	}
	return m["library.metadata_custom_summary"]();
}

function SettingsSection({
	title,
	description,
	children,
	headingRef,
}: {
	title: string;
	/** Omit when the rows explain themselves — filler prose is scrolling, not help. */
	description?: string;
	children: ReactNode;
	headingRef?: RefObject<HTMLHeadingElement | null>;
}) {
	return (
		<section className="flex flex-col gap-6">
			<div className="flex flex-col gap-1">
				<h2
					ref={headingRef}
					tabIndex={headingRef ? -1 : undefined}
					className="text-balance font-semibold text-foreground text-xl outline-none"
				>
					{title}
				</h2>
				{description && (
					<p className="max-w-2xl text-pretty text-muted-foreground text-sm leading-relaxed">
						{description}
					</p>
				)}
			</div>
			{children}
		</section>
	);
}
