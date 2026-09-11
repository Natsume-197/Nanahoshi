import {
	type CreateLibraryData,
	CreateLibraryWizard,
} from "@/components/libraries/create-library-wizard";
import {
	UploadBooksModal,
	type UploadTargetLibrary,
} from "@/components/libraries/upload-books-modal";
import { CreateCollectionDialog } from "@/components/shared/create-collection-button";
import { useCreateLibrary } from "@/hooks/use-create-library";

export function CreateMenuDialogs({
	canCreateLibrary,
	canCreateCollection,
	canUpload,
	libraries,
	showLibraryWizard,
	setShowLibraryWizard,
	showCollectionDialog,
	setShowCollectionDialog,
	showUploadModal,
	setShowUploadModal,
}: {
	canCreateLibrary: boolean;
	canCreateCollection: boolean;
	canUpload: boolean;
	libraries: UploadTargetLibrary[];
	showLibraryWizard: boolean;
	setShowLibraryWizard: (open: boolean) => void;
	showCollectionDialog: boolean;
	setShowCollectionDialog: (open: boolean) => void;
	showUploadModal: boolean;
	setShowUploadModal: (open: boolean) => void;
}) {
	const createLibrary = useCreateLibrary({
		onCreated: () => setShowLibraryWizard(false),
	});

	return (
		<>
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
			{canUpload && (
				<UploadBooksModal
					libraries={libraries}
					open={showUploadModal}
					onOpenChange={setShowUploadModal}
					showLibraryPicker
				/>
			)}
		</>
	);
}
