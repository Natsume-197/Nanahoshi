import type { LibraryComplete } from "@nanahoshi-v2/api/routers/libraries/library.model";
import { useMutation } from "@tanstack/react-query";
import {
	CalendarClock,
	ChevronRight,
	Loader2,
	RefreshCw,
	Trash2,
	Upload,
} from "lucide-react";
import { type ReactNode, useState } from "react";
import { toast } from "sonner";
import { LibraryPermissionsPanel } from "@/components/libraries/library-permissions-panel";
import { UploadBooksModal } from "@/components/libraries/upload-books-modal";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useAbilities } from "@/hooks/use-abilities";
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
		onSuccess: () => toast.success("Library scan started"),
		onError: (err) => toast.error(err.message),
	});

	const deleteMutation = useMutation({
		...orpc.libraries.deleteLibrary.mutationOptions(),
		onSuccess: () => {
			// Cascade-deletes books/series/authors/progress — flush every cache.
			queryClient.invalidateQueries();
			toast.success("Library deleted");
			onBack();
		},
		onError: (err) => toast.error(err.message),
	});

	const handleDelete = () => {
		if (
			window.confirm(
				`Delete "${library.name ?? "Untitled"}"? This will also remove all associated books.`,
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
								Libraries
							</button>
						</li>
						<li aria-hidden className="text-muted-foreground/50">
							<ChevronRight className="size-5" />
						</li>
						<li className="min-w-0 truncate font-semibold text-foreground">
							{library.name ?? "Untitled Library"}
						</li>
					</ol>
				</nav>

				<div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
					<div className="min-w-0">
						<h2 className="truncate font-bold text-2xl tracking-tight">
							{library.name ?? "Untitled Library"}
						</h2>
						<p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-muted-foreground text-sm">
							<span>
								{pathCount} folder{pathCount === 1 ? "" : "s"}
							</span>
							{library.isCronWatch && (
								<span className="flex items-center gap-1">
									<span>·</span>
									<CalendarClock className="size-3.5" />
									Scheduled
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
								<Upload className="mr-1.5 size-3.5" />
								Upload books
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
									<Loader2 className="mr-1.5 size-3.5 animate-spin" />
								) : (
									<RefreshCw className="mr-1.5 size-3.5" />
								)}
								Scan now
							</Button>
						)}
						{can("library", "delete") && (
							<Button
								variant="outline"
								size="icon-sm"
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
						)}
					</div>
				</div>
			</div>

			<div className="space-y-10">
				<SettingsSection
					title="General"
					description="Basic library details and visibility."
				>
					<GeneralSection library={library} canManage={canManage} />
				</SettingsSection>

				<Separator />

				<SettingsSection
					title="Folders"
					description="Filesystem paths scanned for this library."
				>
					<FoldersSection library={library} canManage={canManagePaths} />
				</SettingsSection>

				<Separator />

				<SettingsSection
					title="Metadata"
					description="How metadata is fetched and applied to books."
				>
					<MetadataSection library={library} canManage={canManage} />
				</SettingsSection>

				<Separator />

				<SettingsSection
					title="Scanning"
					description="When and how this library is scanned."
				>
					<ScanningSection library={library} canManage={canManage} />
				</SettingsSection>

				{canManageAccess && (
					<>
						<Separator />
						<SettingsSection
							title="Access"
							description="Control who can view and manage this library."
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
