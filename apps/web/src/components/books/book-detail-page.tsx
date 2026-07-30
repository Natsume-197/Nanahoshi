import {
	ArrowCounterClockwise,
	BookmarkSimple,
	BookOpen,
	CircleNotch,
	CloudArrowDown,
	DeviceTablet,
	DotsThree,
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
	type GenreChipItem,
	GenreChips,
	getHeroStyle,
} from "@/components/shared/detail-page";
import { ScrollSection } from "@/components/shared/scroll-section";
import { SimilarItemsSection } from "@/components/shared/similar-items-section";
import {
	type DetailListRow,
	DetailListSection,
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
import { deleteCachedBook } from "@/lib/reader/db";
import {
	fetchAndCacheEpub,
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
			linkClassName="transition-colors hover:text-[var(--book-hero-text)]"
			separatorClassName="text-[var(--book-hero-muted)]"
		/>
	) : null;
	const accentColor = book.mainColor ?? null;
	const copiesCount = book.otherCopies?.length ?? 0;
	const [isCoverPreviewOpen, setIsCoverPreviewOpen] = useState(false);

	return (
		<div
			className="relative min-h-full pb-16"
			style={getHeroStyle(accentColor)}
		>
			<section className="relative" aria-labelledby="book-detail-title">
				<div className="relative px-4 pt-6 pb-7 md:px-12 md:pt-10 md:pb-10">
					<div className="mx-auto max-w-[110rem]">
						<div className="grid items-start gap-x-10 gap-y-10 lg:grid-cols-[minmax(16rem,22rem)_minmax(0,1fr)] xl:grid-cols-[minmax(18rem,24rem)_minmax(0,1fr)] xl:gap-x-16">
							{/* Editorial rail: title and byline head the artwork column
						    (Fable-style), with the cover centred under them and the
						    actions stacked full-width beneath. */}
							<div className="flex h-[calc(100dvh-9.5rem-var(--mobile-player-offset)-var(--safe-area-top)-var(--safe-area-bottom))] min-h-0 min-w-0 flex-col md:h-[calc(100dvh-6rem-var(--safe-area-top))] lg:sticky lg:top-6">
								<header className="shrink-0">
									<h1
										id="book-detail-title"
										className="text-balance break-words font-bold text-[var(--book-hero-text)] text-xl leading-[1.1] tracking-tight md:text-2xl"
									>
										{title}
									</h1>

									{authorText && (
										<p className="mt-1.5 text-[var(--book-hero-muted)] text-sm leading-relaxed md:text-base">
											{authorLinks}
										</p>
									)}
								</header>

								<div className="flex min-h-0 flex-1 items-center justify-center py-4 sm:justify-start md:py-6 lg:justify-center">
									<div className="aspect-[2/3] h-full max-h-[22.5rem] w-auto max-w-full xl:max-h-[25.5rem]">
										<CoverImage
											coverUrl={coverUrl}
											coverSrcSet={coverSrcSet}
											title={title}
											aspectRatio="2/3"
											fallback={
												<div className="relative aspect-[2/3] w-full bg-muted">
													<div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.12),transparent_60%)]" />
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
								</div>

								<div className="mx-auto w-full max-w-[25rem] shrink-0 sm:mx-0 lg:mx-auto">
									<HeroActions
										book={book}
										bookUuid={book.uuid}
										bookTitle={title}
										bookCover={book.cover ?? null}
										fileSizeBytes={
											book.filesizeKb ? book.filesizeKb * 1024 : undefined
										}
										accentColor={accentColor}
									/>
								</div>
							</div>

							<div className="w-full min-w-0">
								<SynopsisSection
									description={book.description}
									title={m["book.meta_description"]()}
								/>

								{/* One continuous column instead of tabs: everything lines up
							    with the synopsis rather than running full-bleed under the
							    artwork rail. */}
								<div className="mt-8 flex flex-col gap-8 text-sm">
									<BookDetailsSection book={book} />
									<FileAndMetadataSection book={book} />
									{copiesCount > 0 && <OtherCopiesSection book={book} />}
								</div>
							</div>
						</div>

						{/* Discovery rails are full-width rows below the two-column
						    overview. Each owns its vertical spacing only when it has
						    content, so empty/loading queries leave no dead space. */}
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
	accentColor,
}: {
	book: BookData;
	bookUuid: string;
	bookTitle: string;
	bookCover: string | null;
	fileSizeBytes?: number;
	accentColor: string | null;
}) {
	const queryClient = useQueryClient();
	const router = useRouter();
	const { can } = useAbilities();
	const canEnrich = can("book", "editMetadata");
	const canDownload = can("book", "download");
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
			const { written } = await fetchAndCacheEpub(
				bookUuid,
				bookTitle,
				fileSizeBytes,
				activeOrg?.id ?? null,
				{ cover: bookCover },
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
		void fetchAndCacheEpub(
			bookUuid,
			bookTitle,
			fileSizeBytes,
			activeOrg?.id ?? null,
			{ cover: bookCover },
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

	return (
		<>
			<div className="mt-3 flex items-center gap-2">
				<Button
					asChild
					className="h-11 flex-1 gap-1.5 rounded-full border-0 font-semibold text-sm shadow-sm transition-[box-shadow,transform] hover:shadow-md active:scale-[0.96] motion-reduce:transition-none"
					style={
						accentColor
							? {
									backgroundColor: "var(--book-accent)",
									color: "var(--book-accent-foreground)",
								}
							: undefined
					}
				>
					<Link
						to="/reader/$uuid"
						params={{ uuid: bookUuid }}
						onPointerEnter={prefetchOnHover}
						onPointerLeave={cancelHoverPrefetch}
						onPointerDown={startPrefetch}
						onFocus={startPrefetch}
					>
						<BookOpen aria-hidden="true" data-icon="inline-start" />
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
							variant="outline"
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
							className={cn(
								"size-11 rounded-full active:scale-[0.96] motion-reduce:transition-none",
								isLiked
									? "!border-transparent !bg-destructive/75 !text-destructive-foreground hover:!bg-destructive/65"
									: "border-border bg-muted text-[var(--book-hero-text)] hover:bg-accent hover:text-[var(--book-hero-text)]",
							)}
						>
							<Heart
								aria-hidden="true"
								ref={heartRef}
								weight={isLiked ? "fill" : "regular"}
							/>
						</Button>
					</TooltipTrigger>
					<TooltipContent>
						{isLiked ? m["aria.remove_from_likes"]() : m["aria.add_to_likes"]()}
					</TooltipContent>
				</Tooltip>
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button
							variant="outline"
							size="icon"
							aria-label={m["aria.more_actions"]()}
							className="size-11 rounded-full border-border bg-muted text-[var(--book-hero-text)] hover:bg-accent hover:text-[var(--book-hero-text)] active:scale-[0.96] motion-reduce:transition-none"
						>
							<DotsThree aria-hidden="true" />
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end" sideOffset={6}>
						{/* Storing offline downloads the file; removing a local copy doesn't. */}
						{(isStoredOffline || canDownload) && (
							<DropdownMenuItem
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
							<DropdownMenuItem
								onMouseEnter={preloadSendToKindleDialog}
								onFocus={preloadSendToKindleDialog}
								onClick={() => setIsKindleDialogOpen(true)}
							>
								<DeviceTablet />
								{m["book.send_to_kindle"]()}
							</DropdownMenuItem>
						)}
						{canEnrich && (
							<>
								<DropdownMenuSeparator />
								<DropdownMenuItem onClick={() => setIsEditOpen(true)}>
									<PencilSimple />
									{m["book.edit_metadata"]()}
								</DropdownMenuItem>
								<DropdownMenuItem onClick={() => setIsMatchOpen(true)}>
									<MagnifyingGlass />
									{m["match.action"]()}
								</DropdownMenuItem>
								<DropdownMenuItem
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
								<DropdownMenuItem onClick={() => setIsGroupDialogOpen(true)}>
									<Stack />
									{m["book.group_edition"]()}
								</DropdownMenuItem>
							</>
						)}
					</DropdownMenuContent>
				</DropdownMenu>
			</div>

			{canDownload && (
				<Button
					variant="outline"
					onClick={handleDownload}
					disabled={isDownloading}
					aria-busy={isDownloading}
					className="mt-2 h-11 w-full gap-1.5 rounded-full border-border bg-muted text-[var(--book-hero-text)] text-sm hover:bg-accent hover:text-[var(--book-hero-text)] active:scale-[0.96] motion-reduce:transition-none"
				>
					{isDownloading ? (
						<CircleNotch
							data-icon="inline-start"
							className="animate-spin motion-reduce:animate-none"
						/>
					) : (
						<DownloadSimple aria-hidden="true" data-icon="inline-start" />
					)}
					{m["common.download"]()}
				</Button>
			)}

			{(() => {
				const activeOption = currentShelf
					? getShelfOptions("ebook").find((o) => o.value === currentShelf)
					: undefined;
				const ActiveIcon = activeOption?.icon ?? BookmarkSimple;
				return (
					<Button
						variant="outline"
						className={cn(
							"mt-2 h-11 w-full justify-center rounded-full active:scale-[0.96] motion-reduce:transition-none",
							currentShelf
								? "border-border bg-muted text-foreground"
								: "border-border bg-muted text-muted-foreground",
						)}
						onClick={() => setIsAddToListOpen(true)}
					>
						<ActiveIcon aria-hidden="true" data-icon="inline-start" />
						{activeOption ? activeOption.label() : m["add_to_list.title"]()}
					</Button>
				);
			})()}

			<AddToListModal
				bookUuid={bookUuid}
				mediaType="ebook"
				open={isAddToListOpen}
				onOpenChange={setIsAddToListOpen}
				title={bookTitle}
				authorName={formatNames(book.authors) ?? undefined}
				coverPath={bookCover}
			/>

			{readPct != null && readPct > 0 && (
				<p className="mt-2 text-muted-foreground text-xs tabular-nums">
					{m["book.progress_pct"]({ pct: readPct })}
				</p>
			)}

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
					autoFocus
					type="search"
					placeholder={m["book.group_search_placeholder"]()}
					value={query}
					onChange={(e) => setQuery(e.target.value)}
				/>
			</div>
			<div className="max-h-72 overflow-y-auto">
				{isFetching && results.length === 0 ? (
					<p
						role="status"
						className="py-6 text-center text-muted-foreground text-sm"
					>
						{m["book.searching"]()}
					</p>
				) : results.length === 0 ? (
					<p className="py-6 text-center text-muted-foreground text-sm">
						{debouncedQuery
							? m["book.no_matches"]()
							: m["book.type_to_search"]()}
					</p>
				) : (
					<ul className="flex flex-col gap-1">
						{results.map((b) => (
							<li key={b.uuid}>
								<button
									type="button"
									disabled={groupMutation.isPending}
									onClick={() => groupMutation.mutate(b.uuid)}
									className="flex min-h-10 w-full items-center gap-2 rounded-md px-2 py-2 text-start text-sm outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/60 disabled:opacity-50"
								>
									<Stack
										aria-hidden="true"
										className="size-4 shrink-0 text-muted-foreground"
									/>
									<span className="truncate">{b.title ?? b.filename}</span>
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

function RatingBadges({ book }: { book: BookData }) {
	if (book.rating == null) return null;
	const compactNumber = new Intl.NumberFormat(getLocale(), {
		notation: "compact",
	});

	return (
		<div className="flex flex-wrap items-center gap-2 text-[var(--book-hero-text)]">
			<StarRating rating={book.rating} />
			<span className="font-semibold text-sm tabular-nums">
				{book.rating.toFixed(1)}
			</span>
			{book.ratingCount != null && (
				<span className="text-[var(--book-hero-muted)] text-xs tabular-nums">
					({compactNumber.format(book.ratingCount)})
				</span>
			)}
			<span className="text-[var(--book-hero-muted)] text-xs">Amazon</span>
		</div>
	);
}

function BookDetailsSection({ book }: { book: BookData }) {
	const characterCount = book.amountChars
		? new Intl.NumberFormat(getLocale()).format(book.amountChars)
		: null;
	const publishedYear = book.publishedDate?.match(/\d{4}/)?.[0] ?? null;
	const authorDetailLinks = book.authors?.length ? (
		<AuthorLinkList
			authors={book.authors}
			withRole
			linkClassName="underline decoration-muted-foreground/40 underline-offset-2 transition-colors hover:text-foreground hover:decoration-foreground/60"
		/>
	) : null;

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
		{ label: m["book.authors"](), value: authorDetailLinks ?? null },
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
		{
			label: m["book.series"](),
			value:
				book.series?.uuid && book.series.name ? (
					<Link
						to="/dashboard/series/$uuid"
						params={{ uuid: book.series.uuid }}
						className="underline decoration-muted-foreground/40 underline-offset-2 transition-colors hover:text-foreground hover:decoration-foreground/60"
					>
						{book.series.name}
					</Link>
				) : null,
		},
		{
			label: m["book.series_position"](),
			value:
				book.series?.position != null ? String(book.series.position) : null,
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
						</a>
					),
				}
			: null,
	].filter(Boolean) as DetailListRow[];

	return (
		<div className="flex flex-col gap-6">
			{detailRows.length > 0 && (
				<DetailListSection
					title={m["book.section_details"]()}
					rows={detailRows}
				/>
			)}

			{identifierRows.length > 0 && (
				<DetailListSection
					title={m["book.section_identifiers"]()}
					rows={identifierRows}
				/>
			)}

			<RatingBadges book={book} />
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
							<p className="max-h-40 overflow-y-auto whitespace-pre-line">
								{String(value)}
							</p>
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
				<DetailListSection
					title={m["book.section_file_info"]()}
					rows={fileRows}
				/>
			)}
			{isLoading ? (
				<div role="status" className="flex flex-col gap-3">
					<span className="sr-only">{m["book.loading_metadata"]()}</span>
					<Skeleton className="h-4 w-32" />
					<Skeleton className="h-4 w-64" />
					<Skeleton className="h-4 w-48" />
				</div>
			) : (
				originalRows.length > 0 && (
					<DetailListSection
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
		<div className="flex flex-col gap-3 rounded-xl border border-border/60 bg-muted/30 p-4 sm:flex-row sm:items-center sm:justify-between">
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
		<section className="flex flex-col gap-4" aria-labelledby={headingId}>
			<h2
				id={headingId}
				className="text-pretty font-bold text-[1.375rem] leading-tight"
			>
				{m["book.tab_other_copies"]({ count: copies.length })}
			</h2>
			<ul className="divide-y divide-border/60 rounded-xl border border-border/60 bg-muted/30">
				{copies.map((copy) => {
					const size = formatFileSize(copy.filesizeKb);
					return (
						<li
							key={copy.uuid}
							className="flex items-center gap-3 px-4 py-3 text-sm"
						>
							<Link
								to="/dashboard/books/$uuid"
								params={{ uuid: copy.uuid }}
								className="min-w-0 flex-1 truncate hover:underline"
							>
								{copy.filename}
							</Link>
							{copy.mediaType && (
								<span className="shrink-0 text-muted-foreground text-xs uppercase">
									{copy.mediaType}
								</span>
							)}
							{size && (
								<span className="shrink-0 text-muted-foreground text-xs">
									{size}
								</span>
							)}
							{canEdit && (
								<Button
									variant="ghost"
									size="icon"
									aria-label={m["aria.separate_copy"]()}
									disabled={ungroup.isPending}
									aria-busy={ungroup.isPending}
									onClick={() => ungroup.mutate(copy.uuid)}
									className="shrink-0"
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
