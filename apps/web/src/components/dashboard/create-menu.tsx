import { Books, FolderPlus, Plus, UploadSimple } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { lazy, Suspense, useState } from "react";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAbilities } from "@/hooks/use-abilities";
import { m } from "@/paraglide/messages";
import { orpc } from "@/utils/orpc";

const CreateMenuDialogs = lazy(async () => {
	const module = await import("@/components/dashboard/create-menu-dialogs");
	return { default: module.CreateMenuDialogs };
});

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
	const [dialogsMounted, setDialogsMounted] = useState(false);

	const canCreateLibrary = can("library", "create");
	const canCreateCollection = can("collection", "create");
	const canUpload = can("library", "upload");

	// Uploading needs somewhere to put the files, so the entry only appears once
	// the server reports an uploadable target. `getUploadTargets` is already
	// scoped to ebook libraries with an enabled folder (and to holders of the
	// upload permission), so no client-side filtering is needed.
	const { data: libraries } = useQuery({
		...orpc.libraries.getUploadTargets.queryOptions(),
		enabled: canUpload,
	});
	const uploadable = libraries ?? [];
	const canUploadHere = canUpload && uploadable.length > 0;

	if (!canCreateLibrary && !canCreateCollection && !canUploadHere) return null;
	const openDialog = (open: () => void) => {
		setDialogsMounted(true);
		open();
	};

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
						className="rounded-full text-foreground [&_svg]:size-[18px]"
					>
						<Plus weight="bold" />
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end" sideOffset={8} className="w-56">
					{canCreateLibrary && (
						<DropdownMenuItem
							className="gap-2.5"
							onClick={() => openDialog(() => setShowLibraryWizard(true))}
						>
							<Books />
							<span className="flex-1">{m["library.new"]()}</span>
						</DropdownMenuItem>
					)}
					{canCreateCollection && (
						<DropdownMenuItem
							className="gap-2.5"
							onClick={() => openDialog(() => setShowCollectionDialog(true))}
						>
							<FolderPlus />
							<span className="flex-1">{m["collection.new"]()}</span>
						</DropdownMenuItem>
					)}
					{canUploadHere && (
						<DropdownMenuItem
							className="gap-2.5"
							onClick={() => openDialog(() => setShowUploadModal(true))}
						>
							<UploadSimple />
							<span className="flex-1">{m["nav.upload"]()}</span>
						</DropdownMenuItem>
					)}
				</DropdownMenuContent>
			</DropdownMenu>

			{dialogsMounted && (
				<Suspense fallback={null}>
					<CreateMenuDialogs
						canCreateLibrary={canCreateLibrary}
						canCreateCollection={canCreateCollection}
						canUpload={canUploadHere}
						libraries={uploadable}
						showLibraryWizard={showLibraryWizard}
						setShowLibraryWizard={setShowLibraryWizard}
						showCollectionDialog={showCollectionDialog}
						setShowCollectionDialog={setShowCollectionDialog}
						showUploadModal={showUploadModal}
						setShowUploadModal={setShowUploadModal}
					/>
				</Suspense>
			)}
		</>
	);
}
