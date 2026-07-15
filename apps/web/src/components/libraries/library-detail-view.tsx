import type { LibraryComplete } from "@nanahoshi-v2/api/routers/libraries/library.model";
import {
	ArrowsClockwise,
	CalendarDots,
	CaretRight,
	CircleNotch,
	MagicWand,
	Trash,
	UploadSimple,
} from "@phosphor-icons/react";
import { useMutation } from "@tanstack/react-query";
import { type ReactNode, useState } from "react";
import { toast } from "sonner";
import { LibraryPermissionsPanel } from "@/components/libraries/library-permissions-panel";
import { UploadBooksModal } from "@/components/libraries/upload-books-modal";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useAbilities } from "@/hooks/use-abilities";
import { m } from "@/paraglide/messages";
import { orpc, queryClient } from "@/utils/orpc";
import { FoldersSection } from "./library-detail/folders-section";
import { GeneralSection } from "./library-detail/general-section";
import { MetadataSection } from "./library-detail/metadata-section";
import { ScanningSection } from "./library-detail/scanning-section";

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
	const canScan = can("library", "scan");
	const canUpload =
		can("library", "upload") && library.mediaType !== "audiobook";
	const canManageAccess = can("library", "manageAccess");

	const [uploadOpen, setUploadOpen] = useState(false);

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

	const deleteMutation = useMutation({
		...orpc.libraries.deleteLibrary.mutationOptions(),
		onSuccess: () => {
			// Cascade-deletes books/series/authors/progress — flush every cache.
			queryClient.invalidateQueries();
			toast.success(m["library.deleted"]());
			onBack();
		},
		onError: (err) => toast.error(err.message),
	});

	const handleDelete = () => {
		if (
			window.confirm(
				m["library.delete_confirm"]({
					name: library.name ?? m["library.untitled"](),
				}),
			)
		) {
			deleteMutation.mutate({ uuid: library.uuid });
		}
	};

	const pathCount = library.paths?.length ?? 0;

	return (
		<div className="-mt-4 space-y-6 lg:-mt-8">
			<div className="space-y-3">
				<nav aria-label="Breadcrumb">
					<ol className="flex items-center gap-1.5 text-lg">
						<li>
							<button
								type="button"
								onClick={onBack}
								className="font-medium text-muted-foreground transition-colors hover:text-foreground"
							>
								{m["library.breadcrumb"]()}
							</button>
						</li>
						<li aria-hidden className="text-muted-foreground/50">
							<CaretRight className="size-5" />
						</li>
						<li className="min-w-0 truncate font-semibold text-foreground">
							{library.name ?? m["library.untitled"]()}
						</li>
					</ol>
				</nav>

				<div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
					<div className="min-w-0">
						<h2 className="truncate font-bold text-2xl tracking-tight">
							{library.name ?? m["library.untitled"]()}
						</h2>
						<p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-muted-foreground text-sm">
							<span>{m["library.folder_count"]({ count: pathCount })}</span>
							{library.isCronWatch && (
								<span className="flex items-center gap-1">
									<span>·</span>
									<CalendarDots className="size-3.5" />
									{m["library.scheduled_scan"]()}
								</span>
							)}
						</p>
					</div>

					<div className="flex shrink-0 flex-wrap gap-1.5 sm:justify-end">
						{canUpload && (
							<Button
								variant="outline"
								size="sm"
								onClick={() => setUploadOpen(true)}
							>
								<UploadSimple className="mr-1.5 size-3.5" />
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
									<CircleNotch className="mr-1.5 size-3.5 animate-spin" />
								) : (
									<ArrowsClockwise className="mr-1.5 size-3.5" />
								)}
								{m["library.scan_now"]()}
							</Button>
						)}
						{canScan && library.mediaType !== "audiobook" && (
							<Button
								variant="outline"
								size="sm"
								onClick={() =>
									reprocessMutation.mutate({ libraryUuid: library.uuid })
								}
								disabled={reprocessMutation.isPending}
								title={m["library.reprocess_hint"]()}
							>
								{reprocessMutation.isPending ? (
									<CircleNotch className="mr-1.5 size-3.5 animate-spin" />
								) : (
									<MagicWand className="mr-1.5 size-3.5" />
								)}
								{m["library.reprocess"]()}
							</Button>
						)}
						{can("library", "delete") && (
							<Button
								variant="outline"
								size="icon-sm"
								onClick={handleDelete}
								disabled={deleteMutation.isPending}
								title={m["library.delete_library"]()}
							>
								{deleteMutation.isPending ? (
									<CircleNotch className="animate-spin" />
								) : (
									<Trash />
								)}
							</Button>
						)}
					</div>
				</div>
			</div>

			<div className="space-y-10">
				<SettingsSection
					title={m["library.section_general"]()}
					description={m["library.section_general_desc"]()}
				>
					<GeneralSection library={library} canManage={canManage} />
				</SettingsSection>

				<Separator />

				<SettingsSection
					title={m["library.section_folders"]()}
					description={m["library.section_folders_desc"]()}
				>
					<FoldersSection library={library} canManage={canManagePaths} />
				</SettingsSection>

				<Separator />

				<SettingsSection
					title={m["library.section_metadata"]()}
					description={m["library.section_metadata_desc"]()}
				>
					<MetadataSection library={library} canManage={canManage} />
				</SettingsSection>

				<Separator />

				<SettingsSection
					title={m["library.section_scanning"]()}
					description={m["library.section_scanning_desc"]()}
				>
					<ScanningSection library={library} canManage={canManage} />
				</SettingsSection>

				{canManageAccess && (
					<>
						<Separator />
						<SettingsSection
							title={m["library.section_access"]()}
							description={m["library.section_access_desc"]()}
						>
							<LibraryPermissionsPanel libraryId={library.id} />
						</SettingsSection>
					</>
				)}
			</div>

			{canUpload && (
				<UploadBooksModal
					library={library}
					open={uploadOpen}
					onOpenChange={setUploadOpen}
				/>
			)}
		</div>
	);
}

function SettingsSection({
	title,
	description,
	children,
}: {
	title: string;
	description: string;
	children: ReactNode;
}) {
	return (
		<section className="grid gap-x-8 gap-y-4 md:grid-cols-[220px_1fr]">
			<div className="space-y-1">
				<h3 className="font-semibold text-base tracking-tight">{title}</h3>
				<p className="text-muted-foreground text-sm">{description}</p>
			</div>
			<div>{children}</div>
		</section>
	);
}
