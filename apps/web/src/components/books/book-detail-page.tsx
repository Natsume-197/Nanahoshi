import { ebookSourceFormatForFilename } from "@nanahoshi-v2/api/modules/scanning/supportedExtensions";
import {
	ArrowCounterClockwise,
	BookmarkSimple,
	BookOpen,
	CircleNotch,
	CloudArrowDown,
	DeviceTablet,
	DotsThree,
	DotsThreeVertical,
	DownloadSimple,
	Heart,
	LinkBreak,
	MagnifyingGlass,
	PencilSimple,
	Sparkle,
	Stack,
	Star,
} from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useLoaderData, useRouter } from "@tanstack/react-router";
import { lazy, type ReactNode, Suspense, useId, useRef, useState } from "react";
import { toast } from "sonner";
import { AddToListModal } from "@/components/books/add-to-list-modal";
import { AuthorLinkList } from "@/components/books/author-link-list";
import { BookCard } from "@/components/books/book-card";
import { getShelfOptions } from "@/components/books/shelf-options";
import { EditBookMetadataDialog } from "@/components/metadata/edit-metadata-dialog";
import { BookMatchDialog } from "@/components/metadata/match-metadata-dialog";
import {
	CoverImage,
	CoverPreviewDialog,
	CoverProgressBar,
	DETAIL_CORNER_BUTTON,
	DetailBackButton,
	type GenreChipItem,
	GenreChips,
	getHeroStyle,
} from "@/components/shared/detail-page";
import { ScrollSection } from "@/components/shared/scroll-section";
import { SimilarItemsSection } from "@/components/shared/similar-items-section";
import {
	type DetailListRow,
	SynopsisSection,
} from "@/components/shared/synopsis-section";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import type { getBook } from "@/functions/books/get-book";
import { useToggleLike } from "@/hooks/books/use-toggle-like";
import { useAbilities } from "@/hooks/use-abilities";
import {
	CACHED_BOOKS_QUERY_KEY,
	useCachedBookUuids,
} from "@/hooks/use-cached-books";
import { useDebounce } from "@/hooks/use-debounce";
import { useOnUnmount } from "@/hooks/use-on-unmount";
import { usePop } from "@/hooks/use-pop";
import { authClient } from "@/lib/auth-client";
import { PAGE_GUTTER, PAGE_GUTTER_BLEED } from "@/lib/page-layout";
import { deleteCachedBook } from "@/lib/reader/db";
import {
	fetchAndCacheBook,
	isBookLoadPending,
} from "@/lib/reader/download-book";
import { cn } from "@/lib/utils";
import { m } from "@/paraglide/messages";
import { getLocale } from "@/paraglide/runtime";
import {
	coverPresets,
	getCoverFilename,
	getCoverPresetUrl,
	getCoverSrcSet,
	getCoverUrl,
} from "@/utils/covers";
import {
	formatDate,
	formatFileSize,
	formatNames,
	getErrorMessage,
} from "@/utils/format";
import { client, orpc } from "@/utils/orpc";

type BookData = Awaited<ReturnType<typeof getBook>>["book"];

/** Dwell on the read button before its book starts downloading. Long enough
 *  that crossing the button costs nothing, short enough that a user reaching
 *  for it has a head start by the time they click. */
const PREFETCH_HOVER_DELAY_MS = 120;

// Below sm the triggers share the row in equal parts and wrap their label
// rather than overflowing it, so the bar never becomes a scroller that a
// two- or three-tab set doesn't warrant. From sm they take their natural width.
//
// The trigger fills the bar and its underline sits at `bottom-0`, inside the
// box. The default indicator hangs 5px below the trigger, and since the list is
// an overflow container (overflow-x auto forces overflow-y to auto), anything
// outside the box becomes scrollable overflow — the bar would scroll under the
// wheel and take the underline in and out of view with it.
const BOOK_TAB_TRIGGER_CLASSNAME =
	"h-full min-w-0 flex-1 basis-0 whitespace-normal px-2 text-center font-semibold leading-tight data-active:text-primary group-data-horizontal/tabs:after:bottom-0 sm:flex-none sm:basis-auto sm:whitespace-nowrap sm:px-3 dark:data-active:text-primary after:h-[3px] after:rounded-full after:bg-primary";

// Lazy: the kindle dialog pulls zod (~330KB chunk) via its form schema, which
// must not ship with every book detail. Mounted on first open; the dropdown
// item preloads the chunk on hover so the open still feels instant.
const SendToKindleDialog = lazy(async () => {
	const module = await import("@/components/books/send-to-kindle-dialog");
	return { default: module.SendToKindleDialog };
});

function preloadSendToKindleDialog() {
	void import("@/components/books/send-to-kindle-dialog");
}

/**
 * Books are tens of MB, so never prefetch one against the user's wishes: honour
 * Data Saver, and skip on connections where the download would be a burden
 * rather than a head start (it still downloads on demand when they open it).
 */
function shouldSkipPrefetch(): boolean {
	const connection = (
		navigator as Navigator & {
			connection?: { saveData?: boolean; effectiveType?: string };
		}
	).connection;
	if (!connection) return false;
	if (connection.saveData) return true;
	return (
		connection.effectiveType === "slow-2g" || connection.effectiveType === "2g"
	);
}

/** Genres arrive linked ({uuid, name}) after enrichment, or as bare strings
 *  before it — normalize both into chip items. */
function toGenreChipItems(genres: BookData["genres"]): GenreChipItem[] {
	return (genres ?? []).map((genre) =>
		typeof genre === "string"
			? { name: genre }
			: { uuid: genre.uuid, name: genre.name },
	);
}

export function BookDetailPage() {
	const { book } = useLoaderData({ from: "/dashboard/books/$uuid" });

	const title = book.title ?? book.filename;
	const coverFilename = getCoverFilename(book.cover);
	const coverUrl = coverFilename
		? getCoverPresetUrl(coverFilename, coverPresets.detail)
		: null;
	const coverSrcSet = coverFilename
		? getCoverSrcSet(coverFilename, coverPresets.detail.widths)
		: undefined;
	const coverPreviewUrl = coverFilename
		? getCoverUrl(coverFilename, 2048)
		: null;
	const coverPreviewSrcSet = coverFilename
		? getCoverSrcSet(coverFilename, [400, 600, 800, 1200, 2048])
		: undefined;
	const authorText = formatNames(book.authors);
	const authorLinks = book.authors?.length ? (
		<AuthorLinkList
			authors={book.authors}
			withRole
			showProvider
			linkClassName="underline decoration-foreground/25 underline-offset-4 transition-colors hover:decoration-foreground/60 hover:text-[var(--book-hero-text)]"
			separatorClassName="text-[var(--book-hero-muted)]"
		/>
	) : null;
	// The cover remains the artwork; controls follow the user's application theme.
	const accentColor = "var(--primary)";
	const copiesCount = book.otherCopies?.length ?? 0;
	const [isCoverPreviewOpen, setIsCoverPreviewOpen] = useState(false);

	return (
		<div
			className="relative min-h-full bg-background pb-16"
			style={getHeroStyle(accentColor, "var(--primary-foreground)")}
		>
			<DetailBackButton fallbackTo="/dashboard/books" />
			<section aria-labelledby="book-detail-title">
				{/* Below md the back button floats where the top bar used to be, so the
				    cover starts under it rather than behind it. */}
				<div className={cn(PAGE_GUTTER, "pt-16 pb-12 md:pt-10 lg:pb-16")}>
					<div className="mx-auto max-w-[1400px]">
						{/* `lg:grid-rows-[auto_1fr]`: the cover column spans both rows and
						    outgrows them; without an explicit track the surplus is split
						    between the rows, dropping the tabs far below the title. */}
						<Tabs
							defaultValue="overview"
							className="grid min-w-0 items-start gap-x-14 gap-y-8 lg:grid-cols-[18rem_minmax(0,1fr)] lg:grid-rows-[auto_1fr] lg:gap-y-6 xl:grid-cols-[20rem_minmax(0,1fr)] xl:gap-x-16"
						>
							<header className="order-2 min-w-0 lg:order-none lg:col-start-2 lg:row-start-1">
								<h1
									id="book-detail-title"
									className="max-w-[28ch] text-balance break-words font-bold text-2xl text-[var(--book-hero-text)] leading-tight tracking-tight sm:text-3xl sm:leading-[1.1] lg:text-4xl"
								>
									{title}
								</h1>

								{authorText && (
									<p className="mt-4 text-[var(--book-hero-muted)] text-base leading-relaxed sm:text-lg">
										{authorLinks}
									</p>
								)}

								<HeroRating book={book} />
							</header>

							{/* `contents` below lg so the cover and the actions are grid items
							    in their own right: the cover leads the page, the title block
							    follows it, and the actions sit under both. */}
							<aside className="contents lg:sticky lg:top-8 lg:col-start-1 lg:row-span-2 lg:row-start-1 lg:block">
								{/* mb-2 buys the cover more separation than the grid's row gap,
								    so it reads as its own zone rather than another stacked row. */}
								<div className="relative order-1 mx-auto mb-2 w-full max-w-[13rem] sm:max-w-[15rem] lg:order-none lg:mb-0 lg:max-w-none">
									<CoverImage
										coverUrl={coverUrl}
										coverSrcSet={coverSrcSet}
										title={title}
										aspectRatio="2/3"
										fallback={
											<div className="relative aspect-[2/3] w-full bg-muted">
												<BookOpen
													aria-hidden="true"
													className="absolute top-1/3 left-1/2 size-12 -translate-x-1/2 -translate-y-1/2 text-white/20"
													weight="thin"
												/>
												<div className="absolute inset-x-0 bottom-0 flex flex-col gap-1 bg-gradient-to-t from-black/65 to-transparent px-4 pt-10 pb-4">
													<p className="line-clamp-3 font-semibold text-sm text-white">
														{title}
													</p>
													{authorText && (
														<p className="line-clamp-2 text-white/75 text-xs">
															{authorText}
														</p>
													)}
												</div>
											</div>
										}
										onCoverClick={() => setIsCoverPreviewOpen(true)}
										progressBar={
											<DetailCoverProgress
												bookUuid={book.uuid}
												accentColor={accentColor}
											/>
										}
									/>
								</div>

								<div className="order-3 lg:order-none lg:mt-6">
									<HeroActions
										book={book}
										bookUuid={book.uuid}
										bookTitle={title}
										bookCover={book.cover ?? null}
										fileSizeBytes={
											book.filesizeKb ? book.filesizeKb * 1024 : undefined
										}
									/>
								</div>
							</aside>

							<div className="order-4 min-w-0 lg:order-none lg:col-start-2 lg:row-start-2">
								<SynopsisSection
									description={book.description}
									title={m["book.meta_description"]()}
									// The grid's row gap already separates this from the actions
									// above; the section's own top margin would double it.
									className="mt-0"
									descriptionClassName="text-foreground"
								/>

								<div
									className={cn(
										PAGE_GUTTER_BLEED,
										PAGE_GUTTER,
										// Pins to the very top: below md these routes drop the top bar,
										// so there's no chrome above to sit under.
										"sticky top-0 z-20 mt-6 bg-background/95 py-1 backdrop-blur-xl supports-[backdrop-filter]:bg-background/90 lg:mx-0 lg:px-0",
									)}
								>
									<TabsList
										variant="line"
										aria-label={m["book.tabs_label"]()}
										className="scrollbar-none h-14 w-full justify-start gap-1 p-0 sm:overflow-x-auto"
									>
										<TabsTrigger
											value="overview"
											className={BOOK_TAB_TRIGGER_CLASSNAME}
										>
											{m["book.tab_overview"]()}
										</TabsTrigger>
										<TabsTrigger
											value="file"
											className={BOOK_TAB_TRIGGER_CLASSNAME}
										>
											{m["book.tab_file_metadata"]()}
										</TabsTrigger>
										{copiesCount > 0 && (
											<TabsTrigger
												value="copies"
												className={BOOK_TAB_TRIGGER_CLASSNAME}
											>
												{m["book.tab_copies_short"]({ count: copiesCount })}
											</TabsTrigger>
										)}
									</TabsList>
								</div>

								<TabsContent
									value="overview"
									className="pt-8 data-[state=active]:animate-none"
								>
									<BookDetailsSection book={book} />
								</TabsContent>

								<TabsContent
									value="file"
									className="pt-8 data-[state=active]:animate-none"
								>
									<FileAndMetadataSection book={book} />
								</TabsContent>

								{copiesCount > 0 && (
									<TabsContent
										value="copies"
										className="pt-8 data-[state=active]:animate-none"
									>
										<OtherCopiesSection book={book} />
									</TabsContent>
								)}
							</div>
						</Tabs>

						{book.series?.uuid && book.series.name && (
							<SeriesBooksSection
								seriesUuid={book.series.uuid}
								seriesName={book.series.name}
								currentBookUuid={book.uuid}
							/>
						)}
						<SimilarItemsSection
							bookUuid={book.uuid}
							className="mt-14 sm:mt-16"
						/>
					</div>
				</div>
			</section>

			{coverPreviewUrl && (
				<CoverPreviewDialog
					open={isCoverPreviewOpen}
					onOpenChange={setIsCoverPreviewOpen}
					coverUrl={coverPreviewUrl}
					coverSrcSet={coverPreviewSrcSet}
					placeholderUrl={coverUrl}
					placeholderSrcSet={coverSrcSet}
					title={title}
					aspectRatio="2/3"
				/>
			)}
		</div>
	);
}

function HeroRating({ book }: { book: BookData }) {
	const formattedRatingCount =
		book.ratingCount != null
			? new Intl.NumberFormat(getLocale(), { notation: "compact" }).format(
					book.ratingCount,
				)
			: null;

	if (book.rating == null) return null;

	return (
		<div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-3">
			<div className="flex items-center gap-2">
				<StarRating rating={book.rating} />
				<span aria-hidden="true" className="font-semibold text-sm tabular-nums">
					{book.rating.toFixed(1)}
				</span>
				{book.ratingCount != null && formattedRatingCount && (
					<>
						<span aria-hidden="true" className="text-muted-foreground/60">
							·
						</span>
						<span className="text-muted-foreground text-xs tabular-nums">
							{m["book.rating_count"]({
								count: book.ratingCount,
								formattedCount: formattedRatingCount,
							})}
						</span>
					</>
				)}
				<span aria-hidden="true" className="text-muted-foreground/60">
					·
				</span>
				<span className="text-muted-foreground text-xs">
					{m["book.rating_source_amazon"]()}
				</span>
			</div>
		</div>
	);
}

function DetailCoverProgress({
	bookUuid,
	accentColor,
}: {
	bookUuid: string;
	accentColor: string | null;
}) {
	const progressQuery = useQuery(
		orpc.readingProgress.getProgress.queryOptions({
			input: { bookUuid },
		}),
	);

	const progress = progressQuery.data;
	if (!progress?.bookCharCount || progress.exploredCharCount == null) {
		return null;
	}

	const pct = Math.round(
		(progress.exploredCharCount / progress.bookCharCount) * 100,
	);

	return <CoverProgressBar percentage={pct} accentColor={accentColor} />;
}

type ShelfStatus = "want_to_read" | "backlog" | "reading" | "completed";

function HeroActions({
	book,
	bookUuid,
	bookTitle,
	bookCover,
	fileSizeBytes,
}: {
	book: BookData;
	bookUuid: string;
	bookTitle: string;
	bookCover: string | null;
	fileSizeBytes?: number;
}) {
	const queryClient = useQueryClient();
	const router = useRouter();
	const { can } = useAbilities();
	const canEnrich = can("book", "editMetadata");
	const canDownload = can("book", "download");
	const sourceFormat = ebookSourceFormatForFilename(book.filename) ?? undefined;
	const [isDownloading, setIsDownloading] = useState(false);
	const [isKindleDialogOpen, setIsKindleDialogOpen] = useState(false);
	// Sticky across closes (render-phase ref, see the render site).
	const hasOpenedKindleDialogRef = useRef(false);
	if (isKindleDialogOpen) hasOpenedKindleDialogRef.current = true;
	const hasOpenedKindleDialog = hasOpenedKindleDialogRef.current;
	const [isGroupDialogOpen, setIsGroupDialogOpen] = useState(false);
	const [isEditOpen, setIsEditOpen] = useState(false);
	const [isMatchOpen, setIsMatchOpen] = useState(false);

	const [isAddToListOpen, setIsAddToListOpen] = useState(false);

	// --- Reader prefetch ---
	const { data: activeOrg } = authClient.useActiveOrganization();
	const cachedBookUuids = useCachedBookUuids();
	const isStoredOffline = cachedBookUuids.has(bookUuid);
	const invalidateCachedBooks = () =>
		queryClient.invalidateQueries({ queryKey: CACHED_BOOKS_QUERY_KEY });
	const storeOfflineMutation = useMutation({
		// Awaits the IndexedDB write, not just the parse: the success toast
		// claims the book is stored offline, so it must actually be stored.
		mutationFn: async () => {
			const { written } = await fetchAndCacheBook(
				bookUuid,
				bookTitle,
				fileSizeBytes,
				activeOrg?.id ?? null,
				{ cover: bookCover, sourceFormat },
			);
			await written;
		},
		onSuccess: () => toast.success(m["toast.book_stored_offline"]()),
		onError: (error) =>
			toast.error(getErrorMessage(error, m["toast.store_offline_failed"]())),
		onSettled: invalidateCachedBooks,
	});
	// Intent to read: start the download+parse now so the reader finds the book
	// cached (or joins the in-flight load) instead of starting from scratch on
	// click. Cheap to call repeatedly — a cached or in-flight book is a no-op.
	const startPrefetch = () => {
		if (isStoredOffline || isBookLoadPending(bookUuid)) return;
		if (shouldSkipPrefetch()) return;
		void fetchAndCacheBook(
			bookUuid,
			bookTitle,
			fileSizeBytes,
			activeOrg?.id ?? null,
			{ cover: bookCover, sourceFormat },
		)
			.then(({ written }) => written.then(invalidateCachedBooks))
			// A failed prefetch is silent: the reader will surface the error if
			// the user actually opens the book.
			.catch(() => {});
	};

	// Books run to tens of MB, so a cursor merely crossing the button must not
	// start a download — only a deliberate dwell does. Pointer-down and focus
	// are already commitment, so they skip the wait.
	const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(
		undefined,
	);
	const prefetchOnHover = () => {
		clearTimeout(hoverTimerRef.current);
		hoverTimerRef.current = setTimeout(startPrefetch, PREFETCH_HOVER_DELAY_MS);
	};
	const cancelHoverPrefetch = () => clearTimeout(hoverTimerRef.current);
	useOnUnmount(cancelHoverPrefetch);

	const removeOfflineMutation = useMutation({
		mutationFn: () => deleteCachedBook(bookUuid),
		onSuccess: () => toast.success(m["toast.offline_copy_removed"]()),
		onSettled: invalidateCachedBooks,
	});
	const offlineBusy =
		storeOfflineMutation.isPending || removeOfflineMutation.isPending;

	// --- Shelf ---
	const bookShelfQueryOptions = orpc.bookShelf.get.queryOptions({
		input: { bookUuid },
	});
	const bookShelfQuery = useQuery({
		...bookShelfQueryOptions,
		staleTime: 60_000,
	});

	const currentShelf = bookShelfQuery.data?.status as ShelfStatus | undefined;

	// --- Like ---
	const likeStatusQuery = useQuery(
		orpc.likedBooks.getLikeStatus.queryOptions({ input: { bookUuid } }),
	);
	const toggleLikeMutation = useToggleLike(bookUuid, "ebook");
	const isLiked = likeStatusQuery.data?.liked ?? false;
	const { ref: heartRef, pop: popHeart } = usePop<SVGSVGElement>();

	// --- Reading progress (drives the primary CTA) ---
	const progressQuery = useQuery(
		orpc.readingProgress.getProgress.queryOptions({ input: { bookUuid } }),
	);
	const progress = progressQuery.data;
	const readPct =
		progress?.bookCharCount && progress.exploredCharCount != null
			? Math.round((progress.exploredCharCount / progress.bookCharCount) * 100)
			: null;
	const isInProgress = readPct != null && readPct > 0 && readPct < 100;

	// --- Download / Enrich ---
	const handleDownload = async () => {
		if (isDownloading) return;
		try {
			setIsDownloading(true);
			const { url } = await client.files.getSignedDownloadUrl({
				uuid: bookUuid,
			});
			window.open(url, "_blank", "noopener,noreferrer");
		} catch (error) {
			toast.error(getErrorMessage(error, m["toast.download_failed"]()));
		} finally {
			setIsDownloading(false);
		}
	};

	const enrichMutation = useMutation({
		mutationFn: () => client.books.enrichFromAmazon({ uuid: bookUuid }),
		onSuccess: async (result) => {
			if (result.success) {
				toast.success(m["toast.metadata_enriched"]());
				await router.invalidate();
			} else {
				toast.info(m["toast.metadata_none_found"]());
			}
		},
		onError: (error) => {
			toast.error(getErrorMessage(error, m["toast.metadata_fetch_failed"]()));
		},
	});

	const restoreMutation = useMutation({
		mutationFn: () => client.books.restoreOriginalMetadata({ uuid: bookUuid }),
		onSuccess: async (result) => {
			if (result.success) {
				toast.success(m["toast.metadata_restored"]());
				await router.invalidate();
			} else {
				toast.info(m["toast.metadata_none_original"]());
			}
		},
		onError: (error) => {
			toast.error(getErrorMessage(error, m["toast.metadata_restore_failed"]()));
		},
	});

	const isMetadataBusy = enrichMutation.isPending || restoreMutation.isPending;

	// One list, two triggers: the floating ⋯ below md and the labelled button in
	// the column from md. Only one trigger is ever visible, and the content only
	// mounts on open, so the pair costs nothing.
	const moreMenuItems = (
		<>
			{/* Storing offline downloads the file; removing a local copy doesn't. */}
			{(isStoredOffline || canDownload) && (
				<DropdownMenuItem
					className="min-h-10"
					onClick={() =>
						isStoredOffline
							? removeOfflineMutation.mutate()
							: storeOfflineMutation.mutate()
					}
					disabled={offlineBusy}
				>
					{offlineBusy ? (
						<CircleNotch className="animate-spin motion-reduce:animate-none" />
					) : (
						<CloudArrowDown />
					)}
					{isStoredOffline
						? m["book.remove_offline"]()
						: m["book.store_offline"]()}
				</DropdownMenuItem>
			)}
			{canDownload && (
				<>
					<DropdownMenuItem
						className="min-h-10"
						onClick={handleDownload}
						disabled={isDownloading}
					>
						{isDownloading ? (
							<CircleNotch className="animate-spin motion-reduce:animate-none" />
						) : (
							<DownloadSimple aria-hidden="true" />
						)}
						{m["common.download"]()}
					</DropdownMenuItem>
					<DropdownMenuItem
						className="min-h-10"
						onMouseEnter={preloadSendToKindleDialog}
						onFocus={preloadSendToKindleDialog}
						onClick={() => setIsKindleDialogOpen(true)}
					>
						<DeviceTablet />
						{m["book.send_to_kindle"]()}
					</DropdownMenuItem>
				</>
			)}
			{canEnrich && (
				<>
					{(isStoredOffline || canDownload) && <DropdownMenuSeparator />}
					<DropdownMenuItem
						className="min-h-10"
						onClick={() => setIsEditOpen(true)}
					>
						<PencilSimple />
						{m["book.edit_metadata"]()}
					</DropdownMenuItem>
					<DropdownMenuItem
						className="min-h-10"
						onClick={() => setIsMatchOpen(true)}
					>
						<MagnifyingGlass />
						{m["match.action"]()}
					</DropdownMenuItem>
					<DropdownMenuItem
						className="min-h-10"
						onClick={() => enrichMutation.mutate()}
						disabled={isMetadataBusy}
					>
						{enrichMutation.isPending ? (
							<CircleNotch className="animate-spin motion-reduce:animate-none" />
						) : (
							<Sparkle />
						)}
						{m["book.enrich_metadata"]()}
					</DropdownMenuItem>
					<DropdownMenuItem
						className="min-h-10"
						onClick={() => restoreMutation.mutate()}
						disabled={isMetadataBusy}
					>
						{restoreMutation.isPending ? (
							<CircleNotch className="animate-spin motion-reduce:animate-none" />
						) : (
							<ArrowCounterClockwise />
						)}
						{m["book.restore_metadata"]()}
					</DropdownMenuItem>
					<DropdownMenuItem
						className="min-h-10"
						onClick={() => setIsGroupDialogOpen(true)}
					>
						<Stack />
						{m["book.group_edition"]()}
					</DropdownMenuItem>
				</>
			)}
		</>
	);

	return (
		<>
			{/* Opposite the back button, below md only. Rendered outside the action
			    column so it positions against the page, not the stack. */}
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<button
						type="button"
						aria-label={m["nav.more"]()}
						className={cn(DETAIL_CORNER_BUTTON, "end-3")}
					>
						<DotsThreeVertical
							aria-hidden="true"
							className="size-5"
							weight="bold"
						/>
					</button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end" sideOffset={6}>
					{moreMenuItems}
				</DropdownMenuContent>
			</DropdownMenu>

			<div className="flex flex-col gap-2">
				<div className="flex items-center gap-2">
					<Button asChild className="h-11 flex-1 gap-1.5 font-semibold text-sm">
						<Link
							to="/reader/$uuid"
							params={{ uuid: bookUuid }}
							onPointerEnter={prefetchOnHover}
							onPointerLeave={cancelHoverPrefetch}
							onPointerDown={startPrefetch}
							onFocus={startPrefetch}
						>
							<BookOpen
								aria-hidden="true"
								data-icon="inline-start"
								weight="bold"
							/>
							<span className="truncate">
								{isInProgress ? m["book.continue_reading"]() : m["book.read"]()}
							</span>
							{isInProgress && (
								<span className="shrink-0 tabular-nums opacity-80">
									· {readPct}%
								</span>
							)}
						</Link>
					</Button>

					<Tooltip>
						<TooltipTrigger asChild>
							<Button
								variant={isLiked ? "destructive" : "outline"}
								size="icon"
								aria-label={
									isLiked
										? m["aria.remove_from_likes"]()
										: m["aria.add_to_likes"]()
								}
								aria-pressed={isLiked}
								aria-busy={toggleLikeMutation.isPending}
								onClick={() => {
									if (!isLiked) popHeart();
									toggleLikeMutation.mutate();
								}}
								disabled={
									toggleLikeMutation.isPending || likeStatusQuery.isLoading
								}
								className="size-11"
							>
								<Heart
									aria-hidden="true"
									ref={heartRef}
									weight={isLiked ? "fill" : "regular"}
								/>
							</Button>
						</TooltipTrigger>
						<TooltipContent>
							{isLiked
								? m["aria.remove_from_likes"]()
								: m["aria.add_to_likes"]()}
						</TooltipContent>
					</Tooltip>
				</div>

				{(() => {
					const activeOption = currentShelf
						? getShelfOptions("ebook").find((o) => o.value === currentShelf)
						: undefined;
					const ActiveIcon = activeOption?.icon ?? BookmarkSimple;
					return (
						<Button
							variant="outline"
							className="h-11 w-full justify-center"
							onClick={() => setIsAddToListOpen(true)}
						>
							<ActiveIcon aria-hidden="true" data-icon="inline-start" />
							{activeOption ? activeOption.label() : m["add_to_list.title"]()}
						</Button>
					);
				})()}

				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button
							variant="outline"
							className="hidden h-11 w-full justify-center md:inline-flex"
						>
							<DotsThree aria-hidden="true" data-icon="inline-start" />
							{m["nav.more"]()}
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end" sideOffset={6}>
						{moreMenuItems}
					</DropdownMenuContent>
				</DropdownMenu>
			</div>

			<AddToListModal
				bookUuid={bookUuid}
				mediaType="ebook"
				open={isAddToListOpen}
				onOpenChange={setIsAddToListOpen}
				title={bookTitle}
				authorName={formatNames(book.authors) ?? undefined}
				coverPath={bookCover}
			/>

			{/* Kept mounted after the first open so the close animation survives;
			    rendering it eagerly would fetch the lazy (zod-heavy) chunk. */}
			{hasOpenedKindleDialog && (
				<Suspense fallback={null}>
					<SendToKindleDialog
						bookUuid={bookUuid}
						open={isKindleDialogOpen}
						onOpenChange={setIsKindleDialogOpen}
					/>
				</Suspense>
			)}

			<GroupEditionsDialog
				bookUuid={bookUuid}
				open={isGroupDialogOpen}
				onOpenChange={setIsGroupDialogOpen}
			/>

			{/* Mounted per open so the form re-reads fresh values after a save. */}
			{isEditOpen && (
				<EditBookMetadataDialog
					open
					onOpenChange={setIsEditOpen}
					book={{
						...book,
						authors: book.authors ?? [],
						genres: book.genres ?? [],
						tags: book.tags ?? [],
					}}
				/>
			)}

			{/* Mounted per open so a re-open starts from a clean search. */}
			{isMatchOpen && (
				<BookMatchDialog
					open
					onOpenChange={setIsMatchOpen}
					bookUuid={bookUuid}
					initialTitle={book.title ?? book.filename}
					initialAuthor={book.authors?.[0]?.name}
					initialAsin={book.asin}
				/>
			)}
		</>
	);
}

const GROUP_SEARCH_DEBOUNCE_MS = 300;
const GROUP_SEARCH_LIMIT = 8;

function GroupEditionsDialog({
	bookUuid,
	open,
	onOpenChange,
}: {
	bookUuid: string;
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const router = useRouter();
	const queryClient = useQueryClient();
	const searchInputId = useId();
	const searchStatusId = useId();
	const [query, setQuery] = useState("");
	const debouncedQuery = useDebounce(query.trim(), GROUP_SEARCH_DEBOUNCE_MS);

	const { data, isFetching } = useQuery({
		...orpc.books.search.queryOptions({
			input: { query: debouncedQuery, limit: GROUP_SEARCH_LIMIT },
		}),
		enabled: open && debouncedQuery.length > 0,
		staleTime: 30_000,
	});

	const results = (data?.books ?? []).filter((b) => b.uuid !== bookUuid);
	const resultsStatus = isFetching
		? m["book.searching"]()
		: results.length > 0
			? m["book.group_results_count"]({ count: results.length })
			: debouncedQuery
				? m["book.no_matches"]()
				: m["book.type_to_search"]();

	const groupMutation = useMutation({
		mutationFn: (otherUuid: string) =>
			client.books.groupAsEditions({ uuids: [bookUuid, otherUuid] }),
		onSuccess: async () => {
			toast.success(m["toast.books_grouped"]());
			onOpenChange(false);
			setQuery("");
			await queryClient.invalidateQueries({
				queryKey: orpc.books.getBookWithMetadata.queryOptions({
					input: { uuid: bookUuid },
				}).queryKey,
			});
			await router.invalidate();
		},
		onError: (error) =>
			toast.error(getErrorMessage(error, m["toast.group_books_failed"]())),
	});

	return (
		<Modal
			open={open}
			onOpenChange={onOpenChange}
			title={m["book.group_edition"]()}
			description={m["book.group_desc"]()}
		>
			<div className="flex flex-col gap-2">
				<Label htmlFor={searchInputId}>{m["book.group_search_label"]()}</Label>
				<Input
					id={searchInputId}
					name="edition-search"
					autoFocus
					type="search"
					autoComplete="off"
					aria-describedby={searchStatusId}
					placeholder={m["book.group_search_placeholder"]()}
					value={query}
					onChange={(e) => setQuery(e.target.value)}
				/>
			</div>
			<div className="max-h-72 overflow-y-auto" aria-busy={isFetching}>
				<p
					id={searchStatusId}
					role="status"
					className={cn(
						results.length > 0
							? "sr-only"
							: "py-6 text-center text-muted-foreground text-sm",
					)}
				>
					{resultsStatus}
				</p>
				{results.length > 0 && (
					<ul className="flex flex-col gap-1">
						{results.map((b) => (
							<li key={b.uuid}>
								<button
									type="button"
									disabled={groupMutation.isPending}
									onClick={() => groupMutation.mutate(b.uuid)}
									className="flex min-h-11 w-full items-start gap-2 rounded-md px-3 py-2.5 text-start text-sm hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2 disabled:opacity-50"
								>
									<Stack
										aria-hidden="true"
										className="size-4 shrink-0 text-muted-foreground"
									/>
									<span className="min-w-0 break-words">
										{b.title ?? b.filename}
									</span>
								</button>
							</li>
						))}
					</ul>
				)}
			</div>
		</Modal>
	);
}

// Five-star bar with fractional fill: an amber layer clipped to the rating
// percentage sits over a muted outline layer of the same stars.
function StarRating({ rating, max = 5 }: { rating: number; max?: number }) {
	const pct = Math.max(0, Math.min(100, (rating / max) * 100));
	const starKeys = ["one", "two", "three", "four", "five"].slice(0, max);
	const stars = (className: string, weight: "regular" | "fill" = "regular") =>
		starKeys.map((key) => (
			<Star
				key={key}
				weight={weight}
				className={cn("size-4 shrink-0", className)}
			/>
		));

	return (
		<span
			role="img"
			className="relative inline-flex"
			aria-label={m["aria.rating_stars"]({
				rating: rating.toFixed(1),
				max,
			})}
		>
			<span className="flex gap-0.5">
				{stars("text-[var(--book-hero-muted)]/40")}
			</span>
			<span
				className="absolute top-0 left-0 flex gap-0.5 overflow-hidden"
				style={{ width: `${pct}%` }}
			>
				{stars("text-warning", "fill")}
			</span>
		</span>
	);
}

function BookDetailPanel({
	title,
	rows,
}: {
	title: string;
	rows: DetailListRow[];
}) {
	const headingId = useId();
	if (rows.length === 0) return null;

	return (
		<section
			aria-labelledby={headingId}
			className="border-border/70 border-t pt-8"
		>
			<h2
				id={headingId}
				className="mb-6 text-balance font-bold text-xl leading-tight tracking-tight"
			>
				{title}
			</h2>
			<dl className="mt-1 divide-y divide-border/55">
				{rows.map((row) => (
					<div
						key={row.key ?? row.label}
						className="grid min-w-0 gap-1 py-3 first:pt-0 sm:grid-cols-[minmax(8rem,12rem)_minmax(0,1fr)] sm:gap-6"
					>
						<dt className="font-medium text-muted-foreground text-sm">
							{row.label}
						</dt>
						<dd
							className={cn(
								"min-w-0 break-words text-foreground text-sm leading-relaxed",
								row.valueClassName,
							)}
						>
							{row.value}
						</dd>
					</div>
				))}
			</dl>
		</section>
	);
}

function BookDetailsSection({ book }: { book: BookData }) {
	const characterCount = book.amountChars
		? new Intl.NumberFormat(getLocale()).format(book.amountChars)
		: null;
	const publishedYear = book.publishedDate?.match(/\d{4}/)?.[0] ?? null;
	const detailRows = [
		{ label: m["book.format"](), value: book.mediaType?.toUpperCase() ?? null },
		{
			label: m["book.pages"](),
			value: book.pageCount ? String(book.pageCount) : null,
		},
		{
			label: m["book.characters"](),
			value: characterCount ? `${characterCount}` : null,
		},
		{
			label: m["book.language"](),
			value: book.languageCode?.toUpperCase() ?? null,
		},
		{
			label: m["book.library"](),
			value: book.libraryUuid ? (
				<Link
					to="/dashboard/libraries/$uuid"
					params={{ uuid: book.libraryUuid }}
					className="underline decoration-muted-foreground/40 underline-offset-2 transition-colors hover:text-foreground hover:decoration-foreground/60"
				>
					{book.libraryName ?? m["library.untitled"]()}
				</Link>
			) : null,
		},
		{
			label: m["book.publisher"](),
			value:
				book.publisher?.uuid && book.publisher.name ? (
					<Link
						to="/dashboard/publishers/$uuid"
						params={{ uuid: book.publisher.uuid }}
						className="underline decoration-muted-foreground/40 underline-offset-2 transition-colors hover:text-foreground hover:decoration-foreground/60"
					>
						{book.publisher.name}
					</Link>
				) : null,
		},
		{ label: m["book.year"](), value: publishedYear },
		{ label: m["book.published"](), value: formatDate(book.publishedDate) },
		{
			label: m["book.genres"](),
			value: book.genres?.length ? (
				<GenreChips items={toGenreChipItems(book.genres)} linkTo="genres" />
			) : null,
		},
		{
			label: m["book.tags"](),
			value: book.tags?.length ? (
				<GenreChips
					items={(book.tags ?? []).map((tag) => ({
						uuid: tag.uuid,
						name: tag.name,
					}))}
					linkTo="tags"
				/>
			) : null,
		},
	].filter((row) => Boolean(row.value));

	const identifierRows = [
		book.isbn13
			? { label: "ISBN-13", value: book.isbn13, valueClassName: "font-mono" }
			: null,
		book.isbn10
			? { label: "ISBN-10", value: book.isbn10, valueClassName: "font-mono" }
			: null,
		book.asin
			? {
					label: "ASIN",
					value: (
						<a
							href={`https://www.amazon.co.jp/dp/${book.asin}`}
							target="_blank"
							rel="noopener noreferrer"
							className="font-mono underline decoration-muted-foreground/40 underline-offset-2 transition-colors hover:text-foreground hover:decoration-foreground/60"
						>
							{book.asin}
							<span className="sr-only">— {m["common.open_new_tab"]()}</span>
						</a>
					),
				}
			: null,
	].filter(Boolean) as DetailListRow[];

	return (
		<div className="flex flex-col gap-6">
			{detailRows.length > 0 && (
				<BookDetailPanel
					title={m["book.section_details"]()}
					rows={detailRows}
				/>
			)}

			{identifierRows.length > 0 && (
				<BookDetailPanel
					title={m["book.section_identifiers"]()}
					rows={identifierRows}
				/>
			)}
		</div>
	);
}

function SeriesBooksSection({
	seriesUuid,
	seriesName,
	currentBookUuid,
}: {
	seriesUuid: string;
	seriesName: string;
	currentBookUuid: string;
}) {
	const seriesBooksQuery = useQuery(
		orpc.books.listBySeries.queryOptions({
			input: { seriesUuid },
		}),
	);

	const books = seriesBooksQuery.data;

	if (!books || books.length <= 1) return null;

	return (
		<div className="mt-14 sm:mt-16">
			<ScrollSection
				title={seriesName}
				showAllHref={`/dashboard/series/${seriesUuid}`}
				restoreId="series-rail"
			>
				{books.map((b) => (
					<div
						key={b.uuid}
						className={cn(
							"w-[120px] shrink-0 rounded-lg md:w-[140px]",
							b.uuid === currentBookUuid &&
								"ring-2 ring-foreground/70 ring-inset",
						)}
					>
						<BookCard
							uuid={b.uuid}
							title={b.title}
							filename={b.filename ?? b.title}
							cover={b.cover}
							tint={b.mainColor}
							contextMenuEnabled={false}
							coverPreset={coverPresets.small}
						/>
					</div>
				))}
			</ScrollSection>
		</div>
	);
}

const ORIGINAL_METADATA_LABELS: Record<string, () => string> = {
	title: m["book.meta_title"],
	subtitle: m["book.meta_subtitle"],
	description: m["book.meta_description"],
	authors: m["book.authors"],
	publisher: m["book.publisher"],
	publishedDate: m["book.meta_published_date"],
	languageCode: m["book.language"],
	pageCount: m["book.meta_page_count"],
	isbn10: () => "ISBN-10",
	isbn13: () => "ISBN-13",
	asin: () => "ASIN",
	amountChars: m["book.characters"],
};

function FileAndMetadataSection({ book }: { book: BookData }) {
	const fileSize = formatFileSize(book.filesizeKb);

	const fileRows = [
		{
			label: m["book.filename"](),
			value: book.filename,
			valueClassName: "break-all",
		},
		fileSize ? { label: m["book.size"](), value: fileSize } : null,
		book.createdAt
			? { label: m["book.added"](), value: formatDate(book.createdAt) }
			: null,
		book.lastModified
			? { label: m["book.modified"](), value: formatDate(book.lastModified) }
			: null,
	].filter(Boolean) as DetailListRow[];

	const { data, isLoading } = useQuery({
		...orpc.books.getOriginalMetadata.queryOptions({
			input: { uuid: book.uuid },
		}),
		staleTime: 60_000,
	});

	const originalRows: DetailListRow[] = data
		? (Object.entries(ORIGINAL_METADATA_LABELS)
				.map(([key, label]) => {
					const metadata = data as Record<string, unknown>;
					const value = metadata[key];
					if (value === undefined || value === null || value === "")
						return null;

					let display: ReactNode;
					if (key === "authors" && Array.isArray(value)) {
						display = value
							.map((a) =>
								typeof a === "object" && a !== null
									? (a as { name: string }).name
									: String(a),
							)
							.join(", ");
					} else if (
						key === "publisher" &&
						typeof value === "object" &&
						value !== null
					) {
						display = (value as { name: string }).name;
					} else if (key === "description") {
						display = (
							<p className="whitespace-pre-line break-words">{String(value)}</p>
						);
					} else {
						display = String(value);
					}

					return { label: label(), value: display };
				})
				.filter(Boolean) as DetailListRow[])
		: [];

	return (
		<div className="flex flex-col gap-6">
			{book.isDuplicate && <DuplicateBanner book={book} />}
			{fileRows.length > 0 && (
				<BookDetailPanel
					title={m["book.section_file_info"]()}
					rows={fileRows}
				/>
			)}
			{isLoading ? (
				<div
					role="status"
					className="flex flex-col gap-3 border-border/70 border-t pt-8"
				>
					<span className="sr-only">{m["book.loading_metadata"]()}</span>
					<Skeleton className="h-4 w-32" />
					<Skeleton className="h-4 w-64" />
					<Skeleton className="h-4 w-48" />
				</div>
			) : (
				originalRows.length > 0 && (
					<BookDetailPanel
						title={m["book.section_original_metadata"]()}
						rows={originalRows}
					/>
				)
			)}
		</div>
	);
}

function useUngroupMutation(pageBookUuid: string) {
	const router = useRouter();
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (uuid: string) => client.books.ungroupEdition({ uuid }),
		onSuccess: async () => {
			toast.success(m["toast.edition_separated"]());
			await queryClient.invalidateQueries({
				queryKey: orpc.books.getBookWithMetadata.queryOptions({
					input: { uuid: pageBookUuid },
				}).queryKey,
			});
			await router.invalidate();
		},
		onError: (error) =>
			toast.error(getErrorMessage(error, m["toast.separate_edition_failed"]())),
	});
}

function DuplicateBanner({ book }: { book: BookData }) {
	const { can } = useAbilities();
	const ungroup = useUngroupMutation(book.uuid);
	return (
		<div className="flex flex-col gap-3 border-border/70 border-t pt-8 sm:flex-row sm:items-center sm:justify-between">
			<p className="text-muted-foreground text-sm">
				{m["book.duplicate_notice"]()}{" "}
				{book.canonicalUuid && (
					<Link
						to="/dashboard/books/$uuid"
						params={{ uuid: book.canonicalUuid }}
						className="underline decoration-muted-foreground/40 underline-offset-2 transition-colors hover:text-foreground"
					>
						{m["book.view_main_edition"]()}
					</Link>
				)}
			</p>
			{can("book", "editMetadata") && (
				<Button
					variant="outline"
					size="sm"
					disabled={ungroup.isPending}
					aria-busy={ungroup.isPending}
					onClick={() => ungroup.mutate(book.uuid)}
				>
					{ungroup.isPending ? (
						<CircleNotch
							data-icon="inline-start"
							className="animate-spin motion-reduce:animate-none"
						/>
					) : (
						<LinkBreak aria-hidden="true" data-icon="inline-start" />
					)}
					{m["book.separate"]()}
				</Button>
			)}
		</div>
	);
}

function OtherCopiesSection({ book }: { book: BookData }) {
	const { can } = useAbilities();
	const ungroup = useUngroupMutation(book.uuid);
	const headingId = useId();
	const copies = book.otherCopies ?? [];
	if (copies.length === 0) return null;
	const canEdit = can("book", "editMetadata");

	return (
		<section
			className="flex flex-col gap-4 border-border/70 border-t pt-8"
			aria-labelledby={headingId}
		>
			<h2
				id={headingId}
				className="text-pretty font-bold text-xl leading-tight"
			>
				{m["book.tab_other_copies"]({ count: copies.length })}
			</h2>
			<ul className="divide-y divide-border/55">
				{copies.map((copy) => {
					const size = formatFileSize(copy.filesizeKb);
					return (
						<li
							key={copy.uuid}
							className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 py-3 text-sm first:pt-0"
						>
							<Link
								to="/dashboard/books/$uuid"
								params={{ uuid: copy.uuid }}
								className="col-start-1 row-start-1 min-w-0 break-all underline decoration-muted-foreground/40 underline-offset-4 transition-colors hover:decoration-foreground/70 focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2"
							>
								<bdi>{copy.filename}</bdi>
							</Link>
							<div className="col-start-1 row-start-2 flex flex-wrap items-center gap-x-2 text-muted-foreground text-xs">
								{copy.mediaType && (
									<span className="uppercase">{copy.mediaType}</span>
								)}
								{copy.mediaType && size && <span aria-hidden="true">·</span>}
								{size && <span>{size}</span>}
							</div>
							{canEdit && (
								<Button
									variant="ghost"
									size="icon"
									aria-label={m["aria.separate_copy_named"]({
										filename: copy.filename,
									})}
									disabled={ungroup.isPending}
									aria-busy={ungroup.isPending}
									onClick={() => ungroup.mutate(copy.uuid)}
									className="col-start-2 row-span-2 row-start-1 size-11 shrink-0"
								>
									<LinkBreak aria-hidden="true" />
								</Button>
							)}
						</li>
					);
				})}
			</ul>
		</section>
	);
}
