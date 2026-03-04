import {
	Download,
	FolderPlus,
	Globe,
	Heart,
	Loader2,
	Lock,
	Plus,
	Sparkles,
} from "lucide-react";
import {
	createContext,
	type FormEvent,
	type ReactNode,
	useContext,
	useState,
} from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
	ContextMenu,
	ContextMenuCheckboxItem,
	ContextMenuContent,
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
		handleCreateCollection,
		handleDownload,
		handleSetCollectionMembership,
		handleToggleLike,
		isCollectionActionBusy,
		isCollectionsLoading,
		isLiked,
		isLikeActionBusy,
		likeActionLabel,
		prepareBookContext,
	} = useBookContextMenuActions(activeBookUuid);

	const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
	const [collectionName, setCollectionName] = useState("");
	const [isPublicCollection, setIsPublicCollection] = useState(false);

	const resetCreateCollectionForm = () => {
		setCollectionName("");
		setIsPublicCollection(false);
	};
	const selectActiveBookUuid = (bookUuid: string) => {
		setActiveBookUuid((current) => (current === bookUuid ? current : bookUuid));
		prepareBookContext(bookUuid);
	};

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
						<ContextMenuItem
							disabled={!hasActiveBook}
							onClick={() => {
								void handleDownload();
							}}
						>
							<Download className="size-4" />
							Download
						</ContextMenuItem>
						<ContextMenuItem
							disabled={!hasActiveBook || isLikeActionBusy}
							onClick={handleToggleLike}
						>
							<Heart className={`size-4 ${isLiked ? "fill-current" : ""}`} />
							{likeActionLabel}
						</ContextMenuItem>
						<ContextMenuSub>
							<ContextMenuSubTrigger>
								<FolderPlus className="size-4" />
								Collections
							</ContextMenuSubTrigger>
							<ContextMenuSubContent className="w-64">
								{!hasActiveBook ? (
									<ContextMenuItem disabled>
										<FolderPlus className="size-4" />
										Select a book first
									</ContextMenuItem>
								) : isCollectionsLoading ? (
									<ContextMenuItem disabled>
										<Sparkles className="size-4" />
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
												<Globe className="ml-auto size-3.5 text-muted-foreground/70" />
											) : (
												<Lock className="ml-auto size-3.5 text-muted-foreground/70" />
											)}
										</ContextMenuCheckboxItem>
									))
								) : (
									<ContextMenuItem disabled>
										<FolderPlus className="size-4" />
										No collections yet
									</ContextMenuItem>
								)}
								<ContextMenuSeparator />
								<ContextMenuItem
									disabled={!hasActiveBook || isCollectionActionBusy}
									onClick={() => {
										setIsCreateDialogOpen(true);
									}}
								>
									<Plus className="size-4" />
									Create collection
								</ContextMenuItem>
							</ContextMenuSubContent>
						</ContextMenuSub>
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

						<div className="flex items-center justify-between rounded-md border border-border/70 bg-background/60 px-3 py-2">
							<div className="space-y-0.5">
								<p className="font-medium text-sm">Public collection</p>
								<p className="text-muted-foreground text-xs">
									Others can discover this collection.
								</p>
							</div>
							<Checkbox
								checked={isPublicCollection}
								onCheckedChange={(checked) => {
									setIsPublicCollection(checked === true);
								}}
							/>
						</div>

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
									<Loader2 className="size-4 animate-spin" />
								) : (
									<Plus className="size-4" />
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
