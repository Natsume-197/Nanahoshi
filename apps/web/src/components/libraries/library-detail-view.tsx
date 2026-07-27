import type { LibraryComplete } from "@nanahoshi-v2/api/routers/libraries/library.model";
import {
	ArrowLeft,
	ArrowsClockwise,
	BookOpen,
	CalendarDots,
	CaretRight,
	CircleNotch,
	Database,
	DotsThree,
	GearSix,
	Headphones,
	ListMagnifyingGlass,
	LockKey,
	MagicWand,
	Sparkle,
	Stack,
	UploadSimple,
} from "@phosphor-icons/react";
import { useMutation } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { type ReactNode, type RefObject, useRef, useState } from "react";
import { toast } from "sonner";
import { LibraryPermissionsPanel } from "@/components/libraries/library-permissions-panel";
import { UploadBooksModal } from "@/components/libraries/upload-books-modal";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Modal } from "@/components/ui/modal";
import { Separator } from "@/components/ui/separator";
import { useAbilities } from "@/hooks/use-abilities";
import { m } from "@/paraglide/messages";
import { orpc, queryClient } from "@/utils/orpc";
import { FoldersSection } from "./library-detail/folders-section";
import { GeneralSection } from "./library-detail/general-section";
import { MetadataSection } from "./library-detail/metadata-section";
import { ScanningSection } from "./library-detail/scanning-section";

type LibrarySettingsCategory = "general" | "metadata" | "scanning" | "access";

export function LibraryDetailView({
	library,
	onBack,
}: {
	library: LibraryComplete;
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
	const [regroupOpen, setRegroupOpen] = useState(false);
	const [discardOpen, setDiscardOpen] = useState(false);
	const [categoryDirty, setCategoryDirty] = useState(false);
	const [activeCategory, setActiveCategory] =
		useState<LibrarySettingsCategory | null>(null);
	const categoryButtons = useRef<
		Partial<Record<LibrarySettingsCategory, HTMLButtonElement | null>>
	>({});
	const sectionTitleRef = useRef<HTMLHeadingElement>(null);

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
			// Cascade-deletes books/series/authors/progress — flush every cache.
			queryClient.invalidateQueries();
			toast.success(m["library.deleted"]());
			onBack();
		},
		onError: (err) => toast.error(err.message),
	});

	const pathCount = library.paths?.length ?? 0;
	const hasEnabledPaths = (library.paths ?? []).some(
		(path) => path.isEnabled !== false,
	);
	const libraryName = library.name ?? m["library.untitled"]();
	const LibraryIcon = library.mediaType === "audiobook" ? Headphones : BookOpen;
	const typeLabel =
		library.mediaType === "audiobook"
			? m["media.audiobook"]()
			: m["media.ebook"]();

	const openCategory = (category: LibrarySettingsCategory) => {
		setCategoryDirty(false);
		setActiveCategory(category);
		requestAnimationFrame(() => sectionTitleRef.current?.focus());
	};

	const leaveCategory = () => {
		if (!activeCategory) return;
		const previous = activeCategory;
		setCategoryDirty(false);
		setActiveCategory(null);
		requestAnimationFrame(() => categoryButtons.current[previous]?.focus());
	};

	const handleBack = () => {
		if (activeCategory !== null) {
			if (categoryDirty) {
				setDiscardOpen(true);
				return;
			}
			leaveCategory();
			return;
		}
		onBack();
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
						{activeCategory !== null
							? m["library.category_back"]()
							: m["library.breadcrumb"]()}
					</Button>

					<div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
						<div className="flex min-w-0 items-center gap-3">
							<div className="grid size-11 shrink-0 place-items-center rounded-xl bg-secondary text-secondary-foreground">
								<LibraryIcon className="size-5" weight="duotone" />
							</div>
							<div className="min-w-0">
								<h2 className="truncate font-semibold text-foreground text-xl">
									{libraryName}
								</h2>
								<p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-muted-foreground text-sm">
									<span>{typeLabel}</span>
									<span aria-hidden>·</span>
									<span>{m["library.folder_count"]({ count: pathCount })}</span>
									{library.isCronWatch && (
										<span className="flex items-center gap-1">
											<span aria-hidden>·</span>
											<CalendarDots className="size-3.5" />
											{m["library.scheduled_scan"]()}
										</span>
									)}
								</p>
							</div>
						</div>

						{activeCategory === null && (
							<div className="flex shrink-0 flex-col items-start gap-1.5 sm:items-end">
								<div className="flex flex-wrap gap-1.5 sm:justify-end">
									{canUpload && (
										<Button
											size="sm"
											onClick={() => setUploadOpen(true)}
											disabled={!hasEnabledPaths}
										>
											<UploadSimple data-icon="inline-start" />
											{m["library.upload_books"]()}
										</Button>
									)}
									{canScan && (
										<Button
											variant="outline"
											size="sm"
											onClick={() =>
												scanMutation.mutate({ libraryUuid: library.uuid })
											}
											disabled={scanMutation.isPending}
										>
											{scanMutation.isPending ? (
												<CircleNotch
													data-icon="inline-start"
													className="animate-spin"
												/>
											) : (
												<ArrowsClockwise data-icon="inline-start" />
											)}
											{m["library.scan_now"]()}
										</Button>
									)}
									{canScan && library.mediaType !== "audiobook" && (
										<DropdownMenu>
											<DropdownMenuTrigger asChild>
												<Button
													variant="outline"
													size="icon-sm"
													aria-label={m["aria.more_actions"]()}
												>
													<DotsThree weight="bold" />
												</Button>
											</DropdownMenuTrigger>
											<DropdownMenuContent align="end" className="w-72">
												<DropdownMenuGroup>
													<DropdownMenuItem
														disabled={reprocessMutation.isPending}
														onClick={() =>
															reprocessMutation.mutate({
																libraryUuid: library.uuid,
															})
														}
													>
														{reprocessMutation.isPending ? (
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
													<DropdownMenuItem
														disabled={regroupMutation.isPending}
														onClick={() => setRegroupOpen(true)}
													>
														{regroupMutation.isPending ? (
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
													<DropdownMenuItem
														disabled={enrichMutation.isPending}
														onClick={() =>
															enrichMutation.mutate({
																libraryUuid: library.uuid,
															})
														}
													>
														{enrichMutation.isPending ? (
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
													<DropdownMenuItem asChild>
														<Link to="/dashboard/metadata">
															<ListMagnifyingGlass />
															<span>
																{m["enrichment.open_match_manager"]()}
															</span>
														</Link>
													</DropdownMenuItem>
												</DropdownMenuGroup>
											</DropdownMenuContent>
										</DropdownMenu>
									)}
								</div>
								{canUpload && !hasEnabledPaths && (
									<p className="text-muted-foreground text-xs">
										{m["library.upload_requires_folder"]()}
									</p>
								)}
							</div>
						)}
					</div>
				</header>

				<div className="flex flex-col gap-8">
					{activeCategory === null && (
						<ul className="flex flex-col">
							<CategoryButton
								icon={GearSix}
								label={m["library.section_general"]()}
								description={m["library.section_general_menu_desc"]()}
								status={m["library.folder_count"]({ count: pathCount })}
								showSeparator
								buttonRef={(element) => {
									categoryButtons.current.general = element;
								}}
								onClick={() => openCategory("general")}
							/>
							<CategoryButton
								icon={Database}
								label={m["library.section_metadata"]()}
								description={m["library.section_metadata_desc"]()}
								showSeparator
								buttonRef={(element) => {
									categoryButtons.current.metadata = element;
								}}
								onClick={() => openCategory("metadata")}
							/>
							<CategoryButton
								icon={ArrowsClockwise}
								label={m["library.section_scanning"]()}
								description={m["library.section_scanning_desc"]()}
								status={
									library.isCronWatch
										? m["library.scheduled_scan"]()
										: m["library.scan_manual"]()
								}
								showSeparator={canManageAccess}
								buttonRef={(element) => {
									categoryButtons.current.scanning = element;
								}}
								onClick={() => openCategory("scanning")}
							/>
							{canManageAccess && (
								<CategoryButton
									icon={LockKey}
									label={m["library.section_access"]()}
									description={m["library.section_access_desc"]()}
									buttonRef={(element) => {
										categoryButtons.current.access = element;
									}}
									onClick={() => openCategory("access")}
								/>
							)}
						</ul>
					)}

					{activeCategory === "general" && (
						<div className="flex flex-col gap-12">
							<SettingsSection
								headingRef={sectionTitleRef}
								title={m["library.section_general"]()}
								description={m["library.section_general_desc"]()}
							>
								<GeneralSection library={library} canManage={canManage} />
							</SettingsSection>

							<SettingsSection
								title={m["library.section_folders"]()}
								description={m["library.folders_hint"]()}
							>
								<FoldersSection library={library} canManage={canManagePaths} />
							</SettingsSection>

							{canDelete && (
								<section className="flex flex-col gap-6">
									<h2 className="font-semibold text-foreground text-xl">
										{m["settings.org.danger_zone"]()}
									</h2>
									<div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between sm:gap-8">
										<div className="flex min-w-0 flex-col gap-1">
											<h3 className="font-medium text-base text-foreground">
												{m["library.delete_library"]()}
											</h3>
											<p className="max-w-2xl text-muted-foreground text-sm leading-relaxed">
												{m["library.delete_desc"]({ name: libraryName })}
											</p>
										</div>
										<Button
											type="button"
											variant="destructive"
											size="sm"
											className="shrink-0 self-start sm:self-auto"
											onClick={() => setDeleteOpen(true)}
										>
											{m["common.delete"]()}
										</Button>
									</div>
								</section>
							)}
						</div>
					)}

					{activeCategory === "metadata" && (
						<div>
							<SettingsSection
								headingRef={sectionTitleRef}
								title={m["library.section_metadata"]()}
								description={m["library.section_metadata_desc"]()}
							>
								<MetadataSection
									library={library}
									canManage={canManageProviders}
									onDirtyChange={setCategoryDirty}
								/>
							</SettingsSection>
						</div>
					)}

					{activeCategory === "scanning" && (
						<div>
							<SettingsSection
								headingRef={sectionTitleRef}
								title={m["library.section_scanning"]()}
								description={m["library.section_scanning_desc"]()}
							>
								<ScanningSection
									library={library}
									canManage={canManage}
									onDirtyChange={setCategoryDirty}
								/>
							</SettingsSection>
						</div>
					)}

					{canManageAccess && activeCategory === "access" && (
						<div>
							<SettingsSection
								headingRef={sectionTitleRef}
								title={m["library.section_access"]()}
								description={m["library.section_access_desc"]()}
							>
								<LibraryPermissionsPanel
									libraryId={library.id}
									onDirtyChange={setCategoryDirty}
								/>
							</SettingsSection>
						</div>
					)}
				</div>
			</div>

			{canUpload && (
				<UploadBooksModal
					libraries={[library]}
					open={uploadOpen}
					onOpenChange={setUploadOpen}
				/>
			)}

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
							{m["common.delete"]()}
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
								leaveCategory();
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

function CategoryButton({
	icon: Icon,
	label,
	description,
	status,
	showSeparator = false,
	buttonRef,
	onClick,
}: {
	icon: typeof GearSix;
	label: string;
	description: string;
	status?: string;
	showSeparator?: boolean;
	buttonRef: (element: HTMLButtonElement | null) => void;
	onClick: () => void;
}) {
	return (
		<li>
			<button
				ref={buttonRef}
				type="button"
				onClick={onClick}
				className="group flex w-full items-center gap-3 rounded-xl px-3 py-3.5 text-left outline-none transition-colors hover:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring/30 motion-reduce:transition-none"
			>
				<span className="grid size-10 shrink-0 place-items-center rounded-xl bg-secondary text-secondary-foreground">
					<Icon className="size-4.5" weight="duotone" />
				</span>
				<span className="flex min-w-0 flex-1 flex-col gap-0.5">
					<span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 font-medium text-foreground text-sm">
						{label}
						{status && (
							<span className="font-normal text-muted-foreground text-xs">
								{status}
							</span>
						)}
					</span>
					<span className="line-clamp-1 text-muted-foreground text-xs">
						{description}
					</span>
				</span>
				<CaretRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" />
			</button>
			{showSeparator && <Separator className="bg-border/60" />}
		</li>
	);
}

function SettingsSection({
	title,
	description,
	children,
	headingRef,
}: {
	title: string;
	description: string;
	children: ReactNode;
	headingRef?: RefObject<HTMLHeadingElement | null>;
}) {
	return (
		<section className="flex flex-col gap-6">
			<div className="flex flex-col gap-1">
				<h2
					ref={headingRef}
					tabIndex={headingRef ? -1 : undefined}
					className="font-semibold text-foreground text-xl outline-none"
				>
					{title}
				</h2>
				<p className="max-w-2xl text-muted-foreground text-sm">{description}</p>
			</div>
			{children}
		</section>
	);
}
