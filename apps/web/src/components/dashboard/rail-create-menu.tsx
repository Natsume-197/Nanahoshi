import { Books, FolderPlus, Plus, UploadSimple } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import {
	type CreateLibraryData,
	CreateLibraryWizard,
} from "@/components/libraries/create-library-wizard";
import { getUploadableLibraries } from "@/components/libraries/library-ui-state";
import { UploadBooksModal } from "@/components/libraries/upload-books-modal";
import { CreateCollectionDialog } from "@/components/shared/create-collection-button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAbilities } from "@/hooks/use-abilities";
import { useCreateLibrary } from "@/hooks/use-create-library";
import { m } from "@/paraglide/messages";
import { orpc } from "@/utils/orpc";

/**
 * The rail's create shortcut: one "+" that opens what the user is allowed to
 * make — a library, a collection, an upload — so none of them is buried in
 * settings or on its own page. Renders nothing when they can do none.
 */
export function RailCreateMenu() {
	const { can } = useAbilities();
	const [showLibraryWizard, setShowLibraryWizard] = useState(false);
	const [showCollectionDialog, setShowCollectionDialog] = useState(false);
	const [showUploadModal, setShowUploadModal] = useState(false);

	const canCreateLibrary = can("library", "create");
	const canCreateCollection = can("collection", "create");
	const canUpload = can("library", "upload");

	// Uploading needs somewhere to put the files, so the entry only appears once
	// a library can actually receive them.
	const { data: libraries } = useQuery({
		...orpc.libraries.getLibraries.queryOptions(),
		enabled: canUpload,
	});
	const uploadable = getUploadableLibraries(libraries ?? []);
	const canUploadHere = canUpload && uploadable.length > 0;

	const createLibrary = useCreateLibrary({
		onCreated: () => setShowLibraryWizard(false),
	});

	if (!canCreateLibrary && !canCreateCollection && !canUploadHere) return null;

	return (
		<>
			<DropdownMenu>
				<DropdownMenuTrigger
					type="button"
					aria-label={m["nav.create"]()}
					title={m["nav.create"]()}
					className="grid size-9 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors duration-150 ease-out-quart hover:bg-sidebar-accent/60 hover:text-sidebar-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring/50 aria-expanded:bg-sidebar-accent/60 aria-expanded:text-sidebar-foreground"
				>
					<Plus className="size-5" />
				</DropdownMenuTrigger>
				<DropdownMenuContent
					side="right"
					align="end"
					sideOffset={8}
					className="w-auto min-w-52"
				>
					{canCreateLibrary && (
						<DropdownMenuItem
							className="gap-2.5"
							onClick={() => setShowLibraryWizard(true)}
						>
							<Books />
							<span className="flex-1">{m["library.new"]()}</span>
						</DropdownMenuItem>
					)}
					{canCreateCollection && (
						<DropdownMenuItem
							className="gap-2.5"
							onClick={() => setShowCollectionDialog(true)}
						>
							<FolderPlus />
							<span className="flex-1">{m["collection.new"]()}</span>
						</DropdownMenuItem>
					)}
					{canUploadHere && (
						<DropdownMenuItem
							className="gap-2.5"
							onClick={() => setShowUploadModal(true)}
						>
							<UploadSimple />
							<span className="flex-1">{m["nav.upload"]()}</span>
						</DropdownMenuItem>
					)}
				</DropdownMenuContent>
			</DropdownMenu>

			{canCreateLibrary && (
				<CreateLibraryWizard
					key={showLibraryWizard ? "open" : "closed"}
					open={showLibraryWizard}
					onOpenChange={setShowLibraryWizard}
					onSubmit={(data: CreateLibraryData) => createLibrary.mutate(data)}
					isPending={createLibrary.isPending}
				/>
			)}
			{canCreateCollection && (
				<CreateCollectionDialog
					open={showCollectionDialog}
					onOpenChange={setShowCollectionDialog}
				/>
			)}
			{canUploadHere && (
				<UploadBooksModal
					libraries={uploadable}
					open={showUploadModal}
					onOpenChange={setShowUploadModal}
					showLibraryPicker
				/>
			)}
		</>
	);
}
