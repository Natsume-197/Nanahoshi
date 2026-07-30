import type { ForUserOutput } from "@nanahoshi-v2/api/routers/recommendations/recommendations.model";
import {
	ArrowSquareOut,
	BookmarkSimple,
	CircleNotch,
	DeviceTablet,
	DownloadSimple,
	Heart,
	Minus,
	ThumbsDown,
} from "@phosphor-icons/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { lazy, Suspense, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { AddToListModal } from "@/components/books/add-to-list-modal";
import { useBookContextMenu } from "@/components/books/book-context-menu";
import {
	ContextMenuContent,
	ContextMenuGroup,
	ContextMenuItem,
	ContextMenuSeparator,
} from "@/components/ui/context-menu";
import { useBookContextMenuActions } from "@/hooks/books/use-book-context-menu-actions";
import { useAbilities } from "@/hooks/use-abilities";
import { m } from "@/paraglide/messages";
import { orpc } from "@/utils/orpc";

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
		handleDownload,
		handleOpenInNewTab,
		handleRemoveFromContinueReading,
		handleToggleLike,
		isAudiobook,
		isInContinueReading,
		isLiked,
		isLikeActionBusy,
		isReadingProgressActionBusy,
		isReadingProgressLoading,
		likeActionLabel,
	} = useBookContextMenuActions(activeBookUuid, activeMediaType);

	const { can } = useAbilities();
	const canDownload = isAudiobook
		? can("audiobook", "download")
		: can("book", "download");
	const canLike = can("like", "create");

	const [isAddToListOpen, setIsAddToListOpen] = useState(false);
	const [isKindleDialogOpen, setIsKindleDialogOpen] = useState(false);

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
					<ContextMenuItem
						disabled={!hasActiveBook}
						onClick={() => {
							setIsAddToListOpen(true);
						}}
					>
						<BookmarkSimple />
						{m["add_to_list.title"]()}
					</ContextMenuItem>
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

			{hasActiveBook && (
				<AddToListModal
					bookUuid={activeBookUuid}
					mediaType={activeMediaType}
					open={isAddToListOpen}
					onOpenChange={setIsAddToListOpen}
				/>
			)}
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
