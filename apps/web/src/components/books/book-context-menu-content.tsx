import {
	BookmarkPlus,
	BookOpen,
	Check,
	Clock,
	Download,
	ExternalLink,
	FolderPlus,
	Globe,
	Headphones,
	Heart,
	ListMinus,
	Loader2,
	Lock,
	Plus,
	Tablet,
	X,
} from "lucide-react";
import {
	type FormEvent,
	lazy,
	Suspense,
	useCallback,
	useId,
	useState,
	useSyncExternalStore,
} from "react";
import { useBookContextMenu } from "@/components/books/book-context-menu";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
	ContextMenuCheckboxItem,
	ContextMenuContent,
	ContextMenuGroup,
	ContextMenuItem,
	ContextMenuSeparator,
	ContextMenuSub,
	ContextMenuSubContent,
	ContextMenuSubTrigger,
} from "@/components/ui/context-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { useBookContextMenuActions } from "@/hooks/books/use-book-context-menu-actions";
import { useAbilities } from "@/hooks/use-abilities";

const EBOOK_SHELF_OPTIONS = [
	{ value: "completed", label: "Completed", icon: Check },
	{ value: "reading", label: "Reading", icon: BookOpen },
	{ value: "backlog", label: "Backlog", icon: Clock },
	{ value: "want_to_read", label: "Want to read", icon: Heart },
] as const;

const AUDIOBOOK_SHELF_OPTIONS = [
	{ value: "completed", label: "Completed", icon: Check },
	{ value: "listening", label: "Listening", icon: Headphones },
	{ value: "backlog", label: "Backlog", icon: Clock },
	{ value: "want_to_listen", label: "Want to listen", icon: Heart },
] as const;

const SendToKindleDialog = lazy(async () => {
	const module = await import("@/components/books/send-to-kindle-dialog");
	return { default: module.SendToKindleDialog };
});

function preloadSendToKindleDialog() {
	void import("@/components/books/send-to-kindle-dialog");
}

export function BookContextMenuContentPanel() {
	const { getSelectedBook, subscribeSelectedBook } = useBookContextMenu();
	const { bookUuid: activeBookUuid, mediaType: activeMediaType } =
		useSyncExternalStore(
			subscribeSelectedBook,
			getSelectedBook,
			getSelectedBook,
		);
	const {
		collectionsMemberships,
		currentShelfStatus,
		handleCreateCollection,
		handleDownload,
		handleOpenInNewTab,
		handleRemoveFromContinueReading,
		handleRemoveShelf,
		handleSetCollectionMembership,
		handleSetShelf,
		handleToggleLike,
		isAudiobook,
		isCollectionActionBusy,
		isCollectionsLoading,
		isInContinueReading,
		isLiked,
		isLikeActionBusy,
		isReadingProgressActionBusy,
		isReadingProgressLoading,
		isShelfActionBusy,
		isShelfLoading,
		likeActionLabel,
	} = useBookContextMenuActions(activeBookUuid, activeMediaType);

	const { can } = useAbilities();
	const canDownload = can("book", "download");
	const canLike = can("like", "create");
	const canReadCollections = can("collection", "read");
	const canCreateCollection = can("collection", "create");
	const canUpdateCollection = can("collection", "update");
	const canMakePublicCollection = can("collection", "makePublic");

	const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
	const [isKindleDialogOpen, setIsKindleDialogOpen] = useState(false);
	const [collectionName, setCollectionName] = useState("");
	const [isPublicCollection, setIsPublicCollection] = useState(false);
	const publicCollectionFieldId = useId();

	const resetCreateCollectionForm = useCallback(() => {
		setCollectionName("");
		setIsPublicCollection(false);
	}, []);

	const hasActiveBook = activeBookUuid.length > 0;

	const handleCreateCollectionSubmit = async (
		event: FormEvent<HTMLFormElement>,
	) => {
		event.preventDefault();
		const created = await handleCreateCollection(
			collectionName,
			isPublicCollection,
		);
		if (!created) return;
		setIsCreateDialogOpen(false);
		resetCreateCollectionForm();
	};

	return (
		<>
			<ContextMenuContent className="w-56">
				<ContextMenuGroup>
					<ContextMenuItem
						disabled={!hasActiveBook}
						onClick={handleOpenInNewTab}
					>
						<ExternalLink />
						Open in New Tab
					</ContextMenuItem>
					{canDownload && (
						<ContextMenuItem
							disabled={!hasActiveBook}
							onClick={() => {
								void handleDownload();
							}}
						>
							<Download />
							Download
						</ContextMenuItem>
					)}
					{!isAudiobook && canDownload && (
						<ContextMenuItem
							disabled={!hasActiveBook}
							onFocus={preloadSendToKindleDialog}
							onPointerEnter={preloadSendToKindleDialog}
							onClick={() => {
								setIsKindleDialogOpen(true);
							}}
						>
							<Tablet />
							Send to Kindle
						</ContextMenuItem>
					)}
				</ContextMenuGroup>
				<ContextMenuSeparator />
				<ContextMenuGroup>
					{canLike && (
						<ContextMenuItem
							disabled={!hasActiveBook || isLikeActionBusy}
							onClick={handleToggleLike}
						>
							<Heart className={isLiked ? "fill-current" : undefined} />
							{likeActionLabel}
						</ContextMenuItem>
					)}
					{hasActiveBook && isReadingProgressLoading ? (
						<ContextMenuItem disabled>
							<Loader2 className="animate-spin" />
							{isAudiobook
								? "Checking listening status..."
								: "Checking reading status..."}
						</ContextMenuItem>
					) : null}
					{hasActiveBook && isInContinueReading ? (
						<ContextMenuItem
							disabled={isReadingProgressActionBusy}
							onClick={handleRemoveFromContinueReading}
						>
							{isReadingProgressActionBusy ? (
								<Loader2 className="animate-spin" />
							) : (
								<ListMinus />
							)}
							{isAudiobook
								? "Remove from Continue Listening"
								: "Remove from Continue Reading"}
						</ContextMenuItem>
					) : null}
				</ContextMenuGroup>
				<ContextMenuSeparator />
				<ContextMenuGroup>
					<ContextMenuSub>
						<ContextMenuSubTrigger>
							<BookmarkPlus />
							Shelf
						</ContextMenuSubTrigger>
						<ContextMenuSubContent className="w-48">
							{!hasActiveBook ? (
								<ContextMenuItem disabled>Select a book first</ContextMenuItem>
							) : isShelfLoading ? (
								<ContextMenuItem disabled>
									<Loader2 className="animate-spin" />
									Loading...
								</ContextMenuItem>
							) : (
								<>
									<ContextMenuGroup>
										{(isAudiobook
											? AUDIOBOOK_SHELF_OPTIONS
											: EBOOK_SHELF_OPTIONS
										).map((option) => {
											const Icon = option.icon;
											const isActive = currentShelfStatus === option.value;
											return (
												<ContextMenuCheckboxItem
													key={option.value}
													checked={isActive}
													disabled={isShelfActionBusy || isActive}
													onCheckedChange={() => {
														handleSetShelf(option.value);
													}}
												>
													<Icon className="mr-1.5 size-4" />
													{option.label}
												</ContextMenuCheckboxItem>
											);
										})}
									</ContextMenuGroup>
									{currentShelfStatus && (
										<>
											<ContextMenuSeparator />
											<ContextMenuItem
												disabled={isShelfActionBusy}
												onClick={handleRemoveShelf}
											>
												<X />
												Remove from shelf
											</ContextMenuItem>
										</>
									)}
								</>
							)}
						</ContextMenuSubContent>
					</ContextMenuSub>
				</ContextMenuGroup>
				{(canReadCollections || canUpdateCollection || canCreateCollection) && (
					<>
						<ContextMenuSeparator />
						<ContextMenuGroup>
							<ContextMenuSub>
								<ContextMenuSubTrigger>
									<FolderPlus />
									Collections
								</ContextMenuSubTrigger>
								<ContextMenuSubContent className="w-64">
									<ContextMenuGroup>
										{!hasActiveBook ? (
											<ContextMenuItem disabled>
												<FolderPlus />
												Select a book first
											</ContextMenuItem>
										) : isCollectionsLoading ? (
											<ContextMenuItem disabled>
												<Loader2 className="animate-spin" />
												Loading...
											</ContextMenuItem>
										) : collectionsMemberships.length > 0 ? (
											collectionsMemberships.map((membership) => (
												<ContextMenuCheckboxItem
													key={membership.id}
													checked={membership.inCollection}
													disabled={
														isCollectionActionBusy || !canUpdateCollection
													}
													onCheckedChange={(checked) => {
														handleSetCollectionMembership(
															membership.id,
															checked === true,
														);
													}}
												>
													<span className="max-w-[170px] truncate">
														{membership.name}
													</span>
													{membership.isPublic ? (
														<Globe className="ml-auto text-muted-foreground/70" />
													) : (
														<Lock className="ml-auto text-muted-foreground/70" />
													)}
												</ContextMenuCheckboxItem>
											))
										) : (
											<ContextMenuItem disabled>
												<FolderPlus />
												No collections yet
											</ContextMenuItem>
										)}
									</ContextMenuGroup>
									{canCreateCollection && (
										<>
											<ContextMenuSeparator />
											<ContextMenuGroup>
												<ContextMenuItem
													disabled={!hasActiveBook || isCollectionActionBusy}
													onClick={() => {
														setIsCreateDialogOpen(true);
													}}
												>
													<Plus />
													Create collection
												</ContextMenuItem>
											</ContextMenuGroup>
										</>
									)}
								</ContextMenuSubContent>
							</ContextMenuSub>
						</ContextMenuGroup>
					</>
				)}
			</ContextMenuContent>

			<Modal
				open={isCreateDialogOpen}
				onOpenChange={(open) => {
					setIsCreateDialogOpen(open);
					if (!open) {
						resetCreateCollectionForm();
					}
				}}
				title="Create collection"
				description="Create a new collection and choose if it is public or private."
				onSubmit={(event) => void handleCreateCollectionSubmit(event)}
				footer={
					<>
						<Button
							type="button"
							variant="outline"
							disabled={isCollectionActionBusy}
							onClick={() => {
								setIsCreateDialogOpen(false);
								resetCreateCollectionForm();
							}}
						>
							Cancel
						</Button>
						<Button
							type="submit"
							disabled={
								!hasActiveBook ||
								isCollectionActionBusy ||
								collectionName.trim().length === 0
							}
						>
							{isCollectionActionBusy ? (
								<Loader2 className="animate-spin" data-icon="inline-start" />
							) : (
								<Plus data-icon="inline-start" />
							)}
							Create collection
						</Button>
					</>
				}
			>
				<div className="space-y-1.5">
					<Label htmlFor="new-collection-name">Collection name</Label>
					<Input
						id="new-collection-name"
						value={collectionName}
						onChange={(event) => setCollectionName(event.target.value)}
						placeholder="Favorites, Weekend Reads..."
						maxLength={80}
						autoFocus
					/>
				</div>

				{canMakePublicCollection && (
					<Label
						htmlFor={publicCollectionFieldId}
						className="justify-between rounded-md border border-border/70 bg-background/60 px-3 py-2"
					>
						<div className="space-y-0.5">
							<p className="font-medium text-sm">Public collection</p>
							<p className="text-muted-foreground text-xs">
								Others can discover this collection.
							</p>
						</div>
						<Checkbox
							id={publicCollectionFieldId}
							checked={isPublicCollection}
							onCheckedChange={(checked) => {
								setIsPublicCollection(checked === true);
							}}
						/>
					</Label>
				)}
			</Modal>
			{hasActiveBook && !isAudiobook && isKindleDialogOpen && (
				<Suspense fallback={null}>
					<SendToKindleDialog
						bookUuid={activeBookUuid}
						open={isKindleDialogOpen}
						onOpenChange={setIsKindleDialogOpen}
					/>
				</Suspense>
			)}
		</>
	);
}
