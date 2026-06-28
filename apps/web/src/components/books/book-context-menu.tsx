import { useQueryClient } from "@tanstack/react-query";
import {
	createContext,
	lazy,
	type MutableRefObject,
	type ReactNode,
	Suspense,
	useCallback,
	useContext,
	useMemo,
	useRef,
	useState,
} from "react";
import { ContextMenu, ContextMenuTrigger } from "@/components/ui/context-menu";
import type { MediaType } from "@/hooks/books/use-book-context-menu-actions";
import { useMountEffect } from "@/hooks/use-mount-effect";
import { orpc } from "@/utils/orpc";

const MENU_STALE_TIME = 60_000;
const MENU_IDLE_PRELOAD_DELAY_MS = 1200;

const LazyBookContextMenuContentPanel = lazy(async () => {
	const module = await import("@/components/books/book-context-menu-content");
	return { default: module.BookContextMenuContentPanel };
});

function preloadBookContextMenuContent() {
	void import("@/components/books/book-context-menu-content");
}

type BookContextMenuContextValue = {
	selectBook: (bookUuid: string, mediaType?: MediaType) => void;
	prepareBook: (bookUuid: string, mediaType?: MediaType) => void;
	getSelectedBook: () => ActiveBookSelection;
	subscribeSelectedBook: (listener: () => void) => () => void;
	bookTargetedRef: MutableRefObject<boolean>;
};

type ActiveBookSelection = {
	bookUuid: string;
	mediaType: MediaType;
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

export function useBookContextMenu(): BookContextMenuContextValue {
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
	const queryClient = useQueryClient();
	const bookTargetedRef = useRef(false);
	const selectedBookRef = useRef<ActiveBookSelection>({
		bookUuid: "",
		mediaType: rootMediaType ?? "ebook",
	});
	const selectedBookListenersRef = useRef(new Set<() => void>());
	const [shouldMountContent, setShouldMountContent] = useState(false);

	const mountContent = useCallback(() => {
		preloadBookContextMenuContent();
		setShouldMountContent(true);
	}, []);

	// Warm the menu module once the page is idle, so the first right-click opens
	// instantly without a chunk load. Per-book data is fetched lazily on open.
	useMountEffect(() => {
		const timeoutId = window.setTimeout(
			mountContent,
			MENU_IDLE_PRELOAD_DELAY_MS,
		);
		return () => window.clearTimeout(timeoutId);
	});

	// Only updates the active book/media state — no network. Bound to the
	// frequent pointer-down/focus path so plain clicks/taps stay cheap.
	const selectActiveBook = useCallback(
		(bookUuid: string, mediaType?: MediaType) => {
			const nextSelection = {
				bookUuid,
				mediaType: mediaType ?? rootMediaType ?? "ebook",
			};
			const current = selectedBookRef.current;
			if (
				current.bookUuid === nextSelection.bookUuid &&
				current.mediaType === nextSelection.mediaType
			) {
				return;
			}
			selectedBookRef.current = nextSelection;
			for (const listener of selectedBookListenersRef.current) {
				listener();
			}
		},
		[rootMediaType],
	);

	const getSelectedBook = useCallback(() => selectedBookRef.current, []);
	const subscribeSelectedBook = useCallback((listener: () => void) => {
		selectedBookListenersRef.current.add(listener);
		return () => {
			selectedBookListenersRef.current.delete(listener);
		};
	}, []);

	// Prefetches the menu module and the selected book's data. Bound to the
	// menu-open path only (right-click / long-press), so plain hovering and
	// navigation taps never hit the network.
	const prepareBook = useCallback(
		(bookUuid: string, mediaType?: MediaType) => {
			if (!bookUuid) return;
			mountContent();
			const targetMediaType = mediaType ?? rootMediaType ?? "ebook";
			const targetIsAudiobook = targetMediaType === "audiobook";
			const input = { bookUuid };
			void queryClient.prefetchQuery({
				...orpc.likedBooks.getLikeStatus.queryOptions({ input }),
				staleTime: MENU_STALE_TIME,
			});
			void queryClient.prefetchQuery({
				...orpc.collections.listBookMemberships.queryOptions({ input }),
				staleTime: MENU_STALE_TIME,
			});
			if (targetIsAudiobook) {
				void queryClient.prefetchQuery({
					...orpc.listeningProgress.getProgress.queryOptions({ input }),
					staleTime: MENU_STALE_TIME,
				});
				void queryClient.prefetchQuery({
					...orpc.audiobookShelf.get.queryOptions({ input }),
					staleTime: MENU_STALE_TIME,
				});
				return;
			}
			void queryClient.prefetchQuery({
				...orpc.readingProgress.getProgress.queryOptions({ input }),
				staleTime: MENU_STALE_TIME,
			});
			void queryClient.prefetchQuery({
				...orpc.bookShelf.get.queryOptions({ input }),
				staleTime: MENU_STALE_TIME,
			});
		},
		[mountContent, queryClient, rootMediaType],
	);

	const contextValue = useMemo<BookContextMenuContextValue>(
		() => ({
			selectBook: selectActiveBook,
			prepareBook,
			getSelectedBook,
			subscribeSelectedBook,
			bookTargetedRef,
		}),
		[selectActiveBook, prepareBook, getSelectedBook, subscribeSelectedBook],
	);

	return (
		<BookContextMenuSelectionContext.Provider value={contextValue}>
			<ContextMenu
				onOpenChange={(open) => {
					const selection = selectedBookRef.current;
					if (!open || !selection.bookUuid) return;
					prepareBook(selection.bookUuid, selection.mediaType);
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
				{shouldMountContent && (
					<Suspense fallback={null}>
						<LazyBookContextMenuContentPanel />
					</Suspense>
				)}
			</ContextMenu>
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

	// Selecting a book is cheap (just marks which book a right-click targets), so
	// it runs on focus and pointer-down. The network prefetch only runs when a
	// menu is actually being opened (right-click / long-press) — never on hover.
	return (
		<div
			className={className}
			onFocusCapture={() => {
				selectBook(bookUuid, mediaType);
			}}
			onPointerDownCapture={(event) => {
				selectBook(bookUuid, mediaType);
				if (event.button === 2) {
					prepareBook(bookUuid, mediaType);
				}
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
