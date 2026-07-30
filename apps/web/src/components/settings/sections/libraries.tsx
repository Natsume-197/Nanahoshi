import { Plus } from "@phosphor-icons/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import {
	type CreateLibraryData,
	CreateLibraryWizard,
} from "@/components/libraries/create-library-wizard";
import { LibraryDetailView } from "@/components/libraries/library-detail-view";
import {
	type LibraryRowItem,
	LibraryRows,
} from "@/components/libraries/library-rows";
import { hasEnabledLibraryPath } from "@/components/libraries/library-ui-state";
import { QueryErrorState } from "@/components/libraries/query-error-state";
import { UploadBooksModal } from "@/components/libraries/upload-books-modal";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { useAbilities } from "@/hooks/use-abilities";
import { useCreateLibrary } from "@/hooks/use-create-library";
import { m } from "@/paraglide/messages";
import { orpc, queryClient } from "@/utils/orpc";

export function LibrariesSettings({
	openWizardOnMount = false,
}: {
	openWizardOnMount?: boolean;
} = {}) {
	const { can } = useAbilities();
	const canManageLibraries = can("library", "create");
	// Deep-linked from the home getting-started card: open the create wizard
	// straight away instead of making the admin hunt for the "+" button.
	const [showWizard, setShowWizard] = useState(
		() => openWizardOnMount && canManageLibraries,
	);
	const [selectedLibraryId, setSelectedLibraryId] = useState<number | null>(
		null,
	);
	const [openIntent, setOpenIntent] = useState<"folders" | "rename" | null>(
		null,
	);
	const [uploadTarget, setUploadTarget] = useState<number | null>(null);
	const [deleteTarget, setDeleteTarget] = useState<LibraryRowItem | null>(null);

	const {
		data: libraries,
		isLoading,
		isError,
		refetch,
	} = useQuery(orpc.libraries.getLibraries.queryOptions());
	const { data: overviews } = useQuery(
		orpc.libraries.getLibrariesOverview.queryOptions(),
	);
	// Probes the filesystem on every visit: a drive that went offline has to be
	// visible here, not only after someone opens the library or a scan runs.
	const { data: folderIssues } = useQuery({
		...orpc.libraries.getLibraryFolderIssues.queryOptions(),
		staleTime: 0,
		refetchOnMount: "always",
	});

	const createMutation = useCreateLibrary({
		onCreated: () => setShowWizard(false),
	});

	const scanMutation = useMutation({
		...orpc.libraries.scanLibrary.mutationOptions(),
		onSuccess: () => toast.success(m["library.scan_started"]()),
		onError: (err) => toast.error(err.message),
	});

	const deleteMutation = useMutation({
		...orpc.libraries.deleteLibrary.mutationOptions(),
		onSuccess: () => {
			// Deleting a library cascade-deletes its books — flush every cache.
			queryClient.invalidateQueries();
			setDeleteTarget(null);
			toast.success(m["library.deleted"]());
		},
		onError: (err) => toast.error(err.message),
	});

	const selected =
		selectedLibraryId !== null
			? libraries?.find((library) => library.id === selectedLibraryId)
			: undefined;
	const uploadLibrary =
		uploadTarget !== null
			? libraries?.find((library) => library.id === uploadTarget)
			: undefined;
	const overviewByUuid = new Map(
		(overviews ?? []).map((overview) => [overview.uuid, overview]),
	);
	const issuesByUuid = new Map(
		(folderIssues ?? []).map((issue) => [issue.uuid, issue.unreachableCount]),
	);

	const items: LibraryRowItem[] = (libraries ?? []).map((library) => {
		const overview = overviewByUuid.get(library.uuid);
		return {
			id: library.id,
			uuid: library.uuid,
			name: library.name ?? m["library.untitled"](),
			mediaType: library.mediaType,
			bookCount: overview?.bookCount ?? null,
			pathCount: library.paths?.length ?? 0,
			hasEnabledPath: hasEnabledLibraryPath(library),
			// Fresh probe when it has answered; the persisted count until then.
			unreachablePathCount:
				issuesByUuid.get(library.uuid) ?? overview?.unreachablePathCount ?? 0,
			lastScannedAt: overview?.lastScannedAt ?? null,
			previewCovers: overview?.previewCovers ?? [],
		};
	});

	const openLibrary = (item: LibraryRowItem, intent?: "folders" | "rename") => {
		setOpenIntent(intent ?? null);
		setSelectedLibraryId(item.id);
	};

	if (selected) {
		return (
			<LibraryDetailView
				library={selected}
				bookCount={overviewByUuid.get(selected.uuid)?.bookCount}
				lastScannedAt={overviewByUuid.get(selected.uuid)?.lastScannedAt ?? null}
				initialShowAddFolder={openIntent === "folders"}
				initialRename={openIntent === "rename"}
				onBack={() => {
					setSelectedLibraryId(null);
					setOpenIntent(null);
				}}
			/>
		);
	}

	return (
		<div className="flex flex-col gap-7">
			<div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between sm:gap-8">
				<p className="min-w-0 max-w-2xl text-muted-foreground text-sm leading-relaxed">
					{m["library.manage_desc"]()}
				</p>
				{canManageLibraries && (
					<Button
						variant="outline"
						size="sm"
						className="shrink-0 self-start"
						onClick={() => setShowWizard(true)}
					>
						<Plus data-icon="inline-start" />
						{m["library.new"]()}
					</Button>
				)}
			</div>

			{isError && <QueryErrorState onRetry={() => void refetch()} />}

			{!isError &&
				(!isLoading && items.length === 0 ? (
					<EmptyState
						title={m["library.none"]()}
						description={m["library.empty_desc"]()}
					/>
				) : (
					<LibraryRows
						items={items}
						isLoading={isLoading}
						canScan={can("library", "scan")}
						canUpload={can("library", "upload")}
						canDelete={can("library", "delete")}
						onOpen={openLibrary}
						onScan={(item) => scanMutation.mutate({ libraryUuid: item.uuid })}
						onUpload={(item) => setUploadTarget(item.id)}
						onDelete={setDeleteTarget}
					/>
				))}

			{canManageLibraries && (
				<CreateLibraryWizard
					key={showWizard ? "open" : "closed"}
					open={showWizard}
					onOpenChange={setShowWizard}
					onSubmit={(data: CreateLibraryData) => createMutation.mutate(data)}
					isPending={createMutation.isPending}
				/>
			)}

			{uploadLibrary && (
				<UploadBooksModal
					libraries={[uploadLibrary]}
					open
					onOpenChange={(open) => {
						if (!open) setUploadTarget(null);
					}}
				/>
			)}

			<Modal
				open={deleteTarget !== null}
				onOpenChange={(open) => {
					if (!open && !deleteMutation.isPending) setDeleteTarget(null);
				}}
				title={m["library.delete_title"]()}
				description={
					deleteTarget
						? m["library.delete_desc"]({ name: deleteTarget.name })
						: undefined
				}
				footer={
					<>
						<Button
							type="button"
							variant="ghost"
							disabled={deleteMutation.isPending}
							onClick={() => setDeleteTarget(null)}
						>
							{m["common.cancel"]()}
						</Button>
						<Button
							type="button"
							variant="destructive"
							disabled={!deleteTarget || deleteMutation.isPending}
							onClick={() => {
								if (deleteTarget) {
									deleteMutation.mutate({ uuid: deleteTarget.uuid });
								}
							}}
						>
							{m["library.delete_library"]()}
						</Button>
					</>
				}
			/>
		</div>
	);
}
