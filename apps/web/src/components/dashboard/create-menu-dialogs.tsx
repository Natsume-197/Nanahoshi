import {
	UploadBooksModal,
	type UploadTargetLibrary,
} from "@/components/libraries/upload-books-modal";
import { CreateCollectionDialog } from "@/components/shared/create-collection-button";

export function CreateMenuDialogs({
	canCreateCollection,
	canUpload,
	libraries,
	showCollectionDialog,
	setShowCollectionDialog,
	showUploadModal,
	setShowUploadModal,
}: {
	canCreateCollection: boolean;
	canUpload: boolean;
	libraries: UploadTargetLibrary[];
	showCollectionDialog: boolean;
	setShowCollectionDialog: (open: boolean) => void;
	showUploadModal: boolean;
	setShowUploadModal: (open: boolean) => void;
}) {
	return (
		<>
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
