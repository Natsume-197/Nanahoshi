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
import { Button } from "@/components/ui/button";
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
 * The header's create shortcut: one "+" that opens what the user is allowed to
 * make — a library, a collection, an upload — so none of them is buried in
 * settings or on its own page. Renders nothing when they can do none.
 */
export function CreateMenu() {
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
				<DropdownMenuTrigger asChild>
					<Button
						type="button"
						variant="ghost"
						size="icon-lg"
						aria-label={m["nav.create"]()}
						title={m["nav.create"]()}
						className="rounded-full text-muted-foreground [&_svg]:size-[18px]"
					>
						<Plus />
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent
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
