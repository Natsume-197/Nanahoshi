import {
	BookOpen,
	BookmarkPlus,
	Check,
	Clock,
	Download,
	ExternalLink,
	FolderPlus,
	Globe,
	Heart,
	Loader2,
	Lock,
	Minus,
	Plus,
	X,
} from "lucide-react";
import {
	createContext,
	type FormEvent,
	type ReactNode,
	useCallback,
	useContext,
	useId,
	useState,
} from "react";
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
import { useBookContextMenuActions } from "@/hooks/books/use-book-context-menu-actions";

const SHELF_OPTIONS = [
	{ value: "completed", label: "Completed", icon: Check },
	{ value: "reading", label: "Reading", icon: BookOpen },
	{ value: "backlog", label: "Backlog", icon: Clock },
	{ value: "want_to_read", label: "Want to read", icon: Heart },
] as const;

type SelectBookContextValue = (bookUuid: string) => void;

const BookContextMenuSelectionContext =
	createContext<SelectBookContextValue | null>(null);

interface BookContextMenuRootProps {
	children: ReactNode;
}

interface BookContextMenuProps {
	bookUuid: string;
	title?: string;
	children: ReactNode;
}

interface BookContextMenuTriggerProps {
	bookUuid: string;
	children: ReactNode;
	className?: string;
}

function useBookContextMenuSelection(): SelectBookContextValue {
	const context = useContext(BookContextMenuSelectionContext);
	if (!context) {
		throw new Error(
			"BookContextMenuTrigger must be used inside BookContextMenuRoot",
		);
	}
	return context;
}

export function BookContextMenuRoot({ children }: BookContextMenuRootProps) {
	const [activeBookUuid, setActiveBookUuid] = useState("");
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
	} = useBookContextMenuActions(activeBookUuid);

	const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
	const [collectionName, setCollectionName] = useState("");
	const [isPublicCollection, setIsPublicCollection] = useState(false);
	const publicCollectionFieldId = useId();

	const resetCreateCollectionForm = useCallback(() => {
		setCollectionName("");
		setIsPublicCollection(false);
	}, []);
	const selectActiveBookUuid = useCallback(
		(bookUuid: string) => {
			setActiveBookUuid((current) =>
				current === bookUuid ? current : bookUuid,
			);
			prepareBookContext(bookUuid);
		},
		[prepareBookContext],
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
		<BookContextMenuSelectionContext.Provider value={selectActiveBookUuid}>
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
					{children}
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
									Checking reading status...
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
										<Minus />
									)}
									Remove from Continue Reading
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
												{SHELF_OPTIONS.map((option) => {
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
		</BookContextMenuSelectionContext.Provider>
	);
}

export function BookContextMenuTrigger({
	bookUuid,
	children,
	className = "block",
}: BookContextMenuTriggerProps) {
	const setActiveBookUuid = useBookContextMenuSelection();

	return (
		<ContextMenuTrigger
			className={className}
			onFocusCapture={() => {
				setActiveBookUuid(bookUuid);
			}}
			onPointerDownCapture={() => {
				setActiveBookUuid(bookUuid);
			}}
			onContextMenuCapture={() => {
				setActiveBookUuid(bookUuid);
			}}
		>
			{children}
		</ContextMenuTrigger>
	);
}

export function BookContextMenu({ bookUuid, children }: BookContextMenuProps) {
	return (
		<BookContextMenuRoot>
			<BookContextMenuTrigger bookUuid={bookUuid}>
				{children}
			</BookContextMenuTrigger>
		</BookContextMenuRoot>
	);
}
