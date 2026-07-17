import type { ForUserOutput } from "@nanahoshi-v2/api/routers/recommendations/recommendations.model";
import {
	ArrowSquareOut,
	BookmarkSimple,
	BookOpen,
	Check,
	CircleNotch,
	Clock,
	DeviceTablet,
	DownloadSimple,
	FolderPlus,
	Globe,
	Headphones,
	Heart,
	Lock,
	Minus,
	Plus,
	ThumbsDown,
	X,
} from "@phosphor-icons/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
	type FormEvent,
	lazy,
	Suspense,
	useCallback,
	useId,
	useState,
	useSyncExternalStore,
} from "react";
import { toast } from "sonner";
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
import { m } from "@/paraglide/messages";
import { orpc } from "@/utils/orpc";

const EBOOK_SHELF_OPTIONS = [
	{ value: "completed", label: m["book.shelf_completed"], icon: Check },
	{ value: "reading", label: m["book.shelf_reading"], icon: BookOpen },
	{ value: "backlog", label: m["book.shelf_backlog"], icon: Clock },
	{ value: "want_to_read", label: m["book.shelf_want_to_read"], icon: Heart },
] as const;

const AUDIOBOOK_SHELF_OPTIONS = [
	{ value: "completed", label: m["book.shelf_completed"], icon: Check },
	{ value: "listening", label: m["book.shelf_listening"], icon: Headphones },
	{ value: "backlog", label: m["book.shelf_backlog"], icon: Clock },
	{
		value: "want_to_listen",
		label: m["book.shelf_want_to_listen"],
		icon: Heart,
	},
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
	const {
		bookUuid: activeBookUuid,
		mediaType: activeMediaType,
		isRecommendation: activeIsRecommendation,
	} = useSyncExternalStore(
		subscribeSelectedBook,
		getSelectedBook,
		getSelectedBook,
	);
	const queryClient = useQueryClient();
	const notInterested = useMutation(
		orpc.recommendations.notInterested.mutationOptions(),
	);
	const undoNotInterested = useMutation(
		orpc.recommendations.undoNotInterested.mutationOptions(),
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
	const canDownload = isAudiobook
		? can("audiobook", "download")
		: can("book", "download");
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

	// "Not interested": a book always resolves to its work server-side. Optimistic
	// removal from every cached recommendation feed, with an undo affordance.
	const FOR_USER_KEY = [["recommendations", "forUser"]];
	const removeFromFeed = (uuid: string) => {
		queryClient.setQueriesData<ForUserOutput>(
			{ queryKey: FOR_USER_KEY },
			(old) =>
				old
					? {
							...old,
							mixes: old.mixes.map((mix) => ({
								...mix,
								items: mix.items.filter((item) => item.book.uuid !== uuid),
							})),
						}
					: old,
		);
	};
	const restoreFeed = () => {
		void queryClient.invalidateQueries({ queryKey: FOR_USER_KEY });
	};
	const handleNotInterested = () => {
		const uuid = activeBookUuid;
		if (!uuid) return;
		removeFromFeed(uuid);
		notInterested.mutate({ bookUuid: uuid }, { onError: restoreFeed });
		toast(m["recs.not_interested_toast"](), {
			action: {
				label: m["common.undo"](),
				onClick: () => {
					undoNotInterested.mutate(
						{ bookUuid: uuid },
						{ onSuccess: restoreFeed },
					);
				},
			},
		});
	};

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
						<ArrowSquareOut />
						{m["common.open_new_tab"]()}
					</ContextMenuItem>
					{canDownload && (
						<ContextMenuItem
							disabled={!hasActiveBook}
							onClick={() => {
								void handleDownload();
							}}
						>
							<DownloadSimple />
							{m["common.download"]()}
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
							<DeviceTablet />
							{m["book.send_to_kindle"]()}
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
							<Heart weight={isLiked ? "fill" : "regular"} />
							{likeActionLabel}
						</ContextMenuItem>
					)}
					{hasActiveBook && isReadingProgressLoading ? (
						<ContextMenuItem disabled>
							<CircleNotch className="animate-spin" />
							{isAudiobook
								? m["book.checking_listening_status"]()
								: m["book.checking_reading_status"]()}
						</ContextMenuItem>
					) : null}
					{hasActiveBook && isInContinueReading ? (
						<ContextMenuItem
							disabled={isReadingProgressActionBusy}
							onClick={handleRemoveFromContinueReading}
						>
							{isReadingProgressActionBusy ? (
								<CircleNotch className="animate-spin" />
							) : (
								<Minus />
							)}
							{isAudiobook
								? m["book.remove_continue_listening"]()
								: m["book.remove_continue_reading"]()}
						</ContextMenuItem>
					) : null}
				</ContextMenuGroup>
				<ContextMenuSeparator />
				<ContextMenuGroup>
					<ContextMenuSub>
						<ContextMenuSubTrigger>
							<BookmarkSimple />
							{m["book.shelf"]()}
						</ContextMenuSubTrigger>
						<ContextMenuSubContent className="w-48">
							{!hasActiveBook ? (
								<ContextMenuItem disabled>
									{m["book.select_first"]()}
								</ContextMenuItem>
							) : isShelfLoading ? (
								<ContextMenuItem disabled>
									<CircleNotch className="animate-spin" />
									{m["common.loading"]()}
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
													<Icon className="size-4" />
													{option.label()}
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
												{m["book.remove_from_shelf"]()}
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
									{m["nav.collections"]()}
								</ContextMenuSubTrigger>
								<ContextMenuSubContent className="w-64">
									<ContextMenuGroup>
										{!hasActiveBook ? (
											<ContextMenuItem disabled>
												<FolderPlus />
												{m["book.select_first"]()}
											</ContextMenuItem>
										) : isCollectionsLoading ? (
											<ContextMenuItem disabled>
												<CircleNotch className="animate-spin" />
												{m["common.loading"]()}
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
												{m["collection.none"]()}
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
													{m["collection.create_title"]()}
												</ContextMenuItem>
											</ContextMenuGroup>
										</>
									)}
								</ContextMenuSubContent>
							</ContextMenuSub>
						</ContextMenuGroup>
					</>
				)}
				{activeIsRecommendation && (
					<>
						<ContextMenuSeparator />
						<ContextMenuGroup>
							<ContextMenuItem
								disabled={!hasActiveBook}
								onClick={handleNotInterested}
							>
								<ThumbsDown />
								{m["recs.not_interested"]()}
							</ContextMenuItem>
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
				title={m["collection.create_title"]()}
				description={m["collection.create_desc"]()}
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
							{m["common.cancel"]()}
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
								<CircleNotch
									className="animate-spin"
									data-icon="inline-start"
								/>
							) : (
								<Plus data-icon="inline-start" />
							)}
							{m["collection.create_title"]()}
						</Button>
					</>
				}
			>
				<div className="space-y-1.5">
					<Label htmlFor="new-collection-name">
						{m["collection.name_label"]()}
					</Label>
					<Input
						id="new-collection-name"
						value={collectionName}
						onChange={(event) => setCollectionName(event.target.value)}
						placeholder={m["collection.create_placeholder"]()}
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
							<p className="font-medium text-sm">
								{m["collection.public_title"]()}
							</p>
							<p className="text-muted-foreground text-xs">
								{m["collection.public_desc"]()}
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
