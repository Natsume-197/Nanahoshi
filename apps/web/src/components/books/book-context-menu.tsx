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
	createContext,
	type FormEvent,
	type ReactNode,
	useCallback,
	useContext,
	useId,
	useMemo,
	useRef,
	useState,
} from "react";
import { SendToKindleDialog } from "@/components/books/send-to-kindle-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
	ContextMenu,
	ContextMenuCheckboxItem,
	ContextMenuContent,
	ContextMenuGroup,
	ContextMenuItem,
	ContextMenuSeparator,
	ContextMenuSub,
	ContextMenuSubContent,
	ContextMenuSubTrigger,
	ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	type MediaType,
	useBookContextMenuActions,
} from "@/hooks/books/use-book-context-menu-actions";

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

type BookContextMenuContextValue = {
	selectBook: (bookUuid: string, mediaType?: MediaType) => void;
	prepareBook: (bookUuid: string, mediaType?: MediaType) => void;
	bookTargetedRef: React.MutableRefObject<boolean>;
};

const BookContextMenuSelectionContext =
	createContext<BookContextMenuContextValue | null>(null);

interface BookContextMenuRootProps {
	children: ReactNode;
	mediaType?: MediaType;
}

interface BookContextMenuProps {
	bookUuid: string;
	title?: string;
	children: ReactNode;
	mediaType?: MediaType;
}

interface BookContextMenuTriggerProps {
	bookUuid: string;
	children: ReactNode;
	className?: string;
	mediaType?: MediaType;
}

function useBookContextMenu(): BookContextMenuContextValue {
	const context = useContext(BookContextMenuSelectionContext);
	if (!context) {
		throw new Error(
			"BookContextMenuTrigger must be used inside BookContextMenuRoot",
		);
	}
	return context;
}

export function BookContextMenuRoot({
	children,
	mediaType: rootMediaType,
}: BookContextMenuRootProps) {
	const [activeBookUuid, setActiveBookUuid] = useState("");
	const [activeMediaType, setActiveMediaType] = useState<MediaType>(
		rootMediaType ?? "ebook",
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
		prepareBookContext,
	} = useBookContextMenuActions(activeBookUuid, activeMediaType);

	const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
	const [isKindleDialogOpen, setIsKindleDialogOpen] = useState(false);
	const [collectionName, setCollectionName] = useState("");
	const [isPublicCollection, setIsPublicCollection] = useState(false);
	const publicCollectionFieldId = useId();

	const resetCreateCollectionForm = useCallback(() => {
		setCollectionName("");
		setIsPublicCollection(false);
	}, []);
	const bookTargetedRef = useRef(false);
	// Only updates the active book/media state — no network. Bound to the
	// frequent pointer-down/focus path so plain clicks/taps stay cheap.
	const selectActiveBookUuid = useCallback(
		(bookUuid: string, mediaType?: MediaType) => {
			setActiveBookUuid((current) =>
				current === bookUuid ? current : bookUuid,
			);
			setActiveMediaType(mediaType ?? rootMediaType ?? "ebook");
		},
		[rootMediaType],
	);
	// Prefetches the menu's data. Bound to hover-intent and the actual
	// menu-open path (right-click / long-press) so we never fire requests on
	// ordinary navigation taps.
	const prepareBook = useCallback(
		(bookUuid: string, mediaType?: MediaType) => {
			prepareBookContext(bookUuid, mediaType ?? rootMediaType ?? "ebook");
		},
		[prepareBookContext, rootMediaType],
	);

	const contextValue = useMemo<BookContextMenuContextValue>(
		() => ({
			selectBook: selectActiveBookUuid,
			prepareBook,
			bookTargetedRef,
		}),
		[selectActiveBookUuid, prepareBook],
	);

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
		<BookContextMenuSelectionContext.Provider value={contextValue}>
			<Dialog
				open={isCreateDialogOpen}
				onOpenChange={(open) => {
					setIsCreateDialogOpen(open);
					if (!open) {
						resetCreateCollectionForm();
					}
				}}
			>
				<ContextMenu
					onOpenChange={(open) => {
						if (!open || !activeBookUuid) return;
						prepareBookContext(activeBookUuid);
					}}
				>
					<ContextMenuTrigger asChild>
						<div>
							{/* biome-ignore lint/a11y/noStaticElementInteractions: wrapper only delegates the contextmenu (right-click) event; it is not a click target */}
							<div
								onContextMenu={(e) => {
									if (!bookTargetedRef.current) {
										e.stopPropagation();
										return;
									}
									bookTargetedRef.current = false;
									requestAnimationFrame(() => {
										window.dispatchEvent(new Event("resize"));
									});
								}}
							>
								{children}
							</div>
						</div>
					</ContextMenuTrigger>
					<ContextMenuContent className="w-56">
						<ContextMenuGroup>
							<ContextMenuItem
								disabled={!hasActiveBook}
								onClick={handleOpenInNewTab}
							>
								<ExternalLink />
								Open in New Tab
							</ContextMenuItem>
							<ContextMenuItem
								disabled={!hasActiveBook}
								onClick={() => {
									void handleDownload();
								}}
							>
								<Download />
								Download
							</ContextMenuItem>
							{!isAudiobook && (
								<ContextMenuItem
									disabled={!hasActiveBook}
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
							<ContextMenuItem
								disabled={!hasActiveBook || isLikeActionBusy}
								onClick={handleToggleLike}
							>
								<Heart className={isLiked ? "fill-current" : undefined} />
								{likeActionLabel}
							</ContextMenuItem>
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
										<ContextMenuItem disabled>
											Select a book first
										</ContextMenuItem>
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
													disabled={isCollectionActionBusy}
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
								</ContextMenuSubContent>
							</ContextMenuSub>
						</ContextMenuGroup>
					</ContextMenuContent>
				</ContextMenu>

				<DialogContent>
					<form
						className="space-y-4"
						onSubmit={(event) => void handleCreateCollectionSubmit(event)}
					>
						<DialogHeader>
							<DialogTitle>Create collection</DialogTitle>
							<DialogDescription>
								Create a new collection and choose if it is public or private.
							</DialogDescription>
						</DialogHeader>

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

						<DialogFooter>
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
						</DialogFooter>
					</form>
				</DialogContent>
			</Dialog>
			{hasActiveBook && !isAudiobook && (
				<SendToKindleDialog
					bookUuid={activeBookUuid}
					open={isKindleDialogOpen}
					onOpenChange={setIsKindleDialogOpen}
				/>
			)}
		</BookContextMenuSelectionContext.Provider>
	);
}

export function BookContextMenuTrigger({
	bookUuid,
	children,
	className = "block",
	mediaType,
}: BookContextMenuTriggerProps) {
	const { selectBook, prepareBook, bookTargetedRef } = useBookContextMenu();

	return (
		<div
			className={className}
			onPointerEnter={() => {
				prepareBook(bookUuid, mediaType);
			}}
			onFocusCapture={() => {
				selectBook(bookUuid, mediaType);
			}}
			onPointerDownCapture={() => {
				selectBook(bookUuid, mediaType);
			}}
			onContextMenuCapture={() => {
				bookTargetedRef.current = true;
				selectBook(bookUuid, mediaType);
				prepareBook(bookUuid, mediaType);
			}}
		>
			{children}
		</div>
	);
}

export function BookContextMenu({
	bookUuid,
	children,
	mediaType,
}: BookContextMenuProps) {
	return (
		<BookContextMenuRoot mediaType={mediaType}>
			<BookContextMenuTrigger bookUuid={bookUuid} mediaType={mediaType}>
				{children}
			</BookContextMenuTrigger>
		</BookContextMenuRoot>
	);
}
