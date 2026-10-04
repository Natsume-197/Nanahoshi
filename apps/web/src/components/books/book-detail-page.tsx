import { ReadingHistory } from "@nanahoshi/reader/sessions/reading-history";
import { Badge } from "@nanahoshi/ui/components/badge";
import { Button } from "@nanahoshi/ui/components/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@nanahoshi/ui/components/dropdown-menu";
import { Input } from "@nanahoshi/ui/components/input";
import { Label } from "@nanahoshi/ui/components/label";
import { Modal } from "@nanahoshi/ui/components/modal";
import { Skeleton } from "@nanahoshi/ui/components/skeleton";
import {
	Tabs,
	TabsContent,
	TabsList,
	TabsTrigger,
} from "@nanahoshi/ui/components/tabs";
import { cn } from "@nanahoshi/ui/lib/utils";
import {
	ArrowCounterClockwise,
	BookmarkSimple,
	BookOpen,
	CircleNotch,
	DeviceTablet,
	DotsThree,
	DownloadSimple,
	LinkBreak,
	MagnifyingGlass,
	PencilSimple,
	Sparkle,
	Stack,
	Star,
} from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
	Link,
	useLoaderData,
	useRouter,
	useSearch,
} from "@tanstack/react-router";
import { lazy, type ReactNode, Suspense, useId, useRef, useState } from "react";
import { toast } from "sonner";
import { AddToListModal } from "@/components/books/add-to-list-modal";
import { AuthorLinkList } from "@/components/books/author-link-list";
import { BookCard } from "@/components/books/book-card";
import { getShelfOptions } from "@/components/books/shelf-options";
import { EditBookMetadataDialog } from "@/components/metadata/edit-metadata-dialog";
import { BookMatchDialog } from "@/components/metadata/match-metadata-dialog";
import { DetailDiscoverySections } from "@/components/shared/detail-discovery-sections";
import {
	CoverImage,
	CoverPreviewDialog,
	CoverProgressBar,
	DETAIL_TAB_BAR_CLASSNAME,
	DETAIL_TAB_LIST_CLASSNAME,
	DETAIL_TAB_TRIGGER_CLASSNAME,
	DetailBackButton,
	DetailHero,
	type GenreChipItem,
	GenreChips,
	getHeroStyle,
	HERO_ICON_BUTTON,
	HERO_LINK_CLASSNAME,
	HERO_PRIMARY_BUTTON,
	HERO_SECONDARY_BUTTON,
	HeroActionRow,
	HeroMeta,
	HeroTitle,
	pairedPublicationMetaItem,
	ReadListenButton,
	ReadListenManageMenuItem,
} from "@/components/shared/detail-page";
import { ScrollSection } from "@/components/shared/scroll-section";
import {
	type DetailListRow,
	SynopsisSection,
} from "@/components/shared/synopsis-section";
import type { getBook } from "@/functions/books/get-book";
import { useAbilities } from "@/hooks/use-abilities";
import { useDebounce } from "@/hooks/use-debounce";
import { PAGE_GUTTER, PAGE_GUTTER_BLEED } from "@/lib/page-layout";
import { typesetProps } from "@/lib/text-lang";
import { m } from "@/paraglide/messages";
import { getLocale } from "@/paraglide/runtime";
import {
	COVER_EDGE,
	coverPresets,
	getCoverFilename,
	getCoverPresetUrl,
	getCoverSrcSet,
	getCoverUrl,
} from "@/utils/covers";
import { downloadFromUrl } from "@/utils/download";
import {
	capitalizeFirst,
	formatDate,
	formatFileSize,
	formatMediaType,
	formatNames,
	getErrorMessage,
} from "@/utils/format";
import { client, orpc } from "@/utils/orpc";

type BookData = Awaited<ReturnType<typeof getBook>>["book"];

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
	const publishedYear = book.publishedDate?.match(/\d{4}/)?.[0] ?? null;
	const firstGenreName = toGenreChipItems(book.genres)[0]?.name;
	const firstGenre = firstGenreName ? capitalizeFirst(firstGenreName) : null;
	const authorLinks = book.authors?.length ? (
		<AuthorLinkList
			authors={book.authors}
			withRole
			showProvider
			linkClassName={HERO_LINK_CLASSNAME}
			separatorClassName="text-foreground/50"
		/>
	) : null;
	// The cover remains the artwork; controls follow the user's application theme.
	const accentColor = "var(--primary)";
	const otherCopiesCount = book.otherCopies?.length ?? 0;
	const copiesCount = otherCopiesCount + 1;
	const [isCoverPreviewOpen, setIsCoverPreviewOpen] = useState(false);
	const { tab: openTab } = useSearch({ strict: false });
	const pairingsQuery = useQuery(
		orpc.readListen.getPairings.queryOptions({
			input: { publicationUuid: book.uuid },
		}),
	);

	return (
		<div
			className="relative min-h-full bg-background pb-16"
			style={getHeroStyle(accentColor, "var(--primary-foreground)")}
		>
			<DetailBackButton fallbackTo="/dashboard/books" />
			<DetailHero
				tint={book.mainColor}
				backdropUrl={coverUrl}
				labelledBy="book-detail-title"
				coverShape="book"
				cover={
					<CoverImage
						coverUrl={coverUrl}
						coverSrcSet={coverSrcSet}
						title={title}
						aspectRatio="2/3"
						tint={book.mainColor}
						fallback={
							<div className="relative aspect-[2/3] w-full bg-muted">
								<BookOpen
									aria-hidden="true"
									className="absolute top-1/3 left-1/2 size-12 -translate-x-1/2 -translate-y-1/2 text-white/20"
									weight="thin"
								/>
								<div className="absolute inset-x-0 bottom-0 flex flex-col gap-1 bg-gradient-to-t from-black/65 to-transparent px-4 pt-10 pb-4">
									<p
										{...typesetProps(title)}
										className="line-clamp-3 font-semibold text-sm text-white"
									>
										{title}
									</p>
									{authorText && (
										<p
											{...typesetProps(authorText)}
											className="line-clamp-2 text-white/75 text-xs"
										>
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
								accentColor="oklch(1 0 0)"
							/>
						}
					/>
				}
				header={
					<>
						<HeroTitle id="book-detail-title">{title}</HeroTitle>
						{authorLinks && (
							<p className="font-medium text-base text-foreground leading-relaxed sm:text-lg">
								{authorLinks}
							</p>
						)}
						<HeroMeta
							items={[
								book.rating != null && <HeroRating key="rating" book={book} />,
								firstGenre,
								publishedYear,
								formatMediaType(book.mediaType),
								book.pageCount
									? m["book.pages_count"]({ count: book.pageCount })
									: null,
								pairedPublicationMetaItem(
									pairingsQuery.data?.pairings,
									"ebook",
								),
							]}
						/>
					</>
				}
				actions={
					<HeroActions
						book={book}
						bookUuid={book.uuid}
						bookTitle={title}
						bookCover={book.cover ?? null}
					/>
				}
			/>
			<div className={cn(PAGE_GUTTER, "pt-8 pb-12 sm:pt-10 lg:pb-16")}>
				<div className="mx-auto max-w-[1400px]">
					<SynopsisSection
						description={book.description}
						title={m["book.meta_description"]()}
						className="mt-0 mb-8"
						descriptionClassName="max-w-[110ch] text-foreground"
					/>
					<Tabs
						defaultValue={openTab === "reading" ? "reading" : "overview"}
						className="min-w-0"
					>
						<div
							className={cn(
								PAGE_GUTTER_BLEED,
								PAGE_GUTTER,
								// Pins to the very top: below md these routes drop the top bar,
								// so there's no chrome above to sit under.
								DETAIL_TAB_BAR_CLASSNAME,
							)}
						>
							<TabsList
								variant="line"
								aria-label={m["book.tabs_label"]()}
								className={DETAIL_TAB_LIST_CLASSNAME}
							>
								<TabsTrigger
									value="overview"
									className={DETAIL_TAB_TRIGGER_CLASSNAME}
								>
									{m["book.tab_overview"]()}
								</TabsTrigger>
								<TabsTrigger
									value="file"
									className={DETAIL_TAB_TRIGGER_CLASSNAME}
								>
									{m["book.tab_file_metadata"]()}
								</TabsTrigger>
								{otherCopiesCount > 0 && (
									<TabsTrigger
										value="copies"
										className={DETAIL_TAB_TRIGGER_CLASSNAME}
									>
										{m["book.tab_copies_short"]({ count: copiesCount })}
									</TabsTrigger>
								)}
								<TabsTrigger
									value="reading"
									className={DETAIL_TAB_TRIGGER_CLASSNAME}
								>
									{m.reading_title()}
								</TabsTrigger>
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

						<TabsContent value="reading" className="pt-8">
							<ReadingHistory
								bookUuid={book.uuid}
								amountChars={book.amountChars}
							/>
						</TabsContent>

						{otherCopiesCount > 0 && (
							<TabsContent
								value="copies"
								className="pt-8 data-[state=active]:animate-none"
							>
								<OtherCopiesSection book={book} />
							</TabsContent>
						)}
					</Tabs>

					{book.series?.uuid && book.series.name && (
						<SeriesBooksSection
							seriesUuid={book.series.uuid}
							seriesName={book.series.name}
							currentBookUuid={book.uuid}
						/>
					)}
					<DetailDiscoverySections
						bookUuid={book.uuid}
						authors={book.authors}
						seriesUuid={book.series?.uuid}
					/>
				</div>
			</div>

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
	if (book.rating == null) return null;
	const formattedRatingCount =
		book.ratingCount != null
			? new Intl.NumberFormat(getLocale(), { notation: "compact" }).format(
					book.ratingCount,
				)
			: null;

	return (
		<span
			className="inline-flex items-center gap-1"
			title={m["book.rating_source_amazon"]()}
		>
			<Star aria-hidden="true" weight="fill" className="size-3.5" />
			<span className="font-semibold text-foreground">
				{book.rating.toFixed(1)}
			</span>
			{book.ratingCount != null && formattedRatingCount && (
				<span>
					(
					{m["book.rating_count"]({
						count: book.ratingCount,
						formattedCount: formattedRatingCount,
					})}
					)
				</span>
			)}
		</span>
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
}: {
	book: BookData;
	bookUuid: string;
	bookTitle: string;
	bookCover: string | null;
}) {
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

	// --- Shelf ---
	const bookShelfQueryOptions = orpc.bookShelf.get.queryOptions({
		input: { bookUuid },
	});
	const bookShelfQuery = useQuery({
		...bookShelfQueryOptions,
		staleTime: 60_000,
	});

	const currentShelf = bookShelfQuery.data?.status as ShelfStatus | undefined;

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
			const { url, filename } = await client.files.getSignedDownloadUrl({
				uuid: bookUuid,
			});
			downloadFromUrl(url, filename);
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

	const moreMenuItems = (
		<>
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
					{canDownload && <DropdownMenuSeparator />}
					<ReadListenManageMenuItem
						publicationUuid={bookUuid}
						title={bookTitle}
					/>
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
			<HeroActionRow
				primary={
					<>
						<Button asChild {...HERO_PRIMARY_BUTTON}>
							<Link to="/reader/$uuid" params={{ uuid: bookUuid }}>
								<BookOpen aria-hidden="true" weight="bold" />
								<span>
									{isInProgress
										? m["book.continue_reading"]()
										: m["book.read"]()}
								</span>
								{isInProgress && (
									<span className="shrink-0 tabular-nums opacity-70">
										· {readPct}%
									</span>
								)}
							</Link>
						</Button>
						<ReadListenButton publicationUuid={bookUuid} mediaType="ebook" />
					</>
				}
				secondary={(() => {
					const activeOption = currentShelf
						? getShelfOptions("ebook").find((o) => o.value === currentShelf)
						: undefined;
					const ActiveIcon = activeOption?.icon ?? BookmarkSimple;
					return (
						<Button
							{...HERO_SECONDARY_BUTTON}
							onClick={() => setIsAddToListOpen(true)}
						>
							<ActiveIcon
								aria-hidden="true"
								weight={activeOption ? "fill" : "regular"}
							/>
							<span>
								{activeOption ? activeOption.label() : m["add_to_list.title"]()}
							</span>
						</Button>
					);
				})()}
				icons={
					(canDownload || canEnrich) && (
						<DropdownMenu>
							<DropdownMenuTrigger asChild>
								<Button aria-label={m["nav.more"]()} {...HERO_ICON_BUTTON}>
									<DotsThree
										aria-hidden="true"
										weight="bold"
										className="size-5"
									/>
								</Button>
							</DropdownMenuTrigger>
							<DropdownMenuContent align="end" sideOffset={6}>
								{moreMenuItems}
							</DropdownMenuContent>
						</DropdownMenu>
					)
				}
			/>

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
		<section aria-labelledby={headingId} className="min-w-0">
			<h2
				id={headingId}
				className="mb-6 text-balance font-bold text-xl leading-tight tracking-tight"
			>
				{title}
			</h2>
			<dl className="mt-1 grid gap-x-8 gap-y-6 sm:grid-cols-2 lg:grid-cols-3">
				{rows.map((row) => (
					<div
						key={row.key ?? row.label}
						className="flex min-w-0 flex-col gap-1.5"
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
		{ label: m["book.format"](), value: formatMediaType(book.mediaType) },
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
		<div className="flex flex-col gap-10">
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
		<div className="flex flex-col gap-10">
			{book.isDuplicate && <DuplicateBanner book={book} />}
			{fileRows.length > 0 && (
				<BookDetailPanel
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
	const [isUngroupDialogOpen, setIsUngroupDialogOpen] = useState(false);
	return (
		<>
			<div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
				<div className="flex min-w-0 items-start gap-3">
					<div className="grid size-9 shrink-0 place-items-center text-primary">
						<Stack aria-hidden="true" className="size-4" weight="duotone" />
					</div>
					<p className="min-w-0 text-foreground/80 text-sm leading-relaxed">
						{m["book.duplicate_notice"]()}{" "}
						{book.canonicalUuid && (
							<Link
								to="/dashboard/books/$uuid"
								params={{ uuid: book.canonicalUuid }}
								className="font-medium text-foreground underline decoration-muted-foreground/45 underline-offset-4 transition-colors hover:decoration-foreground focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2"
							>
								{m["book.view_main_edition"]()}
							</Link>
						)}
					</p>
				</div>
				{can("book", "editMetadata") && (
					<Button
						variant="outline"
						className="h-11 shrink-0 px-4"
						onClick={() => setIsUngroupDialogOpen(true)}
					>
						<LinkBreak aria-hidden="true" data-icon="inline-start" />
						{m["book.separate"]()}
					</Button>
				)}
			</div>
			<UngroupEditionDialog
				pageBookUuid={book.uuid}
				filename={book.filename}
				open={isUngroupDialogOpen}
				onOpenChange={setIsUngroupDialogOpen}
			/>
		</>
	);
}

function OtherCopiesSection({ book }: { book: BookData }) {
	const { can } = useAbilities();
	const [copyToUngroup, setCopyToUngroup] = useState<{
		uuid: string;
		filename: string;
	} | null>(null);
	const otherCopies = book.otherCopies ?? [];
	if (otherCopies.length === 0) return null;
	const canEdit = can("book", "editMetadata");
	const coverFilename = getCoverFilename(book.cover);
	const coverUrl = coverFilename
		? getCoverPresetUrl(coverFilename, coverPresets.thumbnail)
		: null;
	const coverSrcSet = coverFilename
		? getCoverSrcSet(coverFilename, coverPresets.thumbnail.widths)
		: undefined;
	const sharedTitle =
		book.title ?? otherCopies.find((copy) => copy.title)?.title ?? null;
	const copies = [
		{
			uuid: book.uuid,
			filename: book.filename,
			title: book.title ?? sharedTitle,
			mediaType: book.mediaType,
			filesizeKb: book.filesizeKb,
			isCurrent: true,
		},
		...otherCopies.map((copy) => ({
			...copy,
			title: copy.title ?? sharedTitle,
			isCurrent: false,
		})),
	];

	return (
		<section
			className="min-w-0"
			aria-label={m["book.tab_copies_short"]({ count: copies.length })}
		>
			<ul className="space-y-2">
				{copies.map((copy) => {
					const displayTitle = copy.title ?? copy.filename;
					const format =
						copy.filename.split(".").at(-1)?.toUpperCase() ??
						copy.mediaType?.toUpperCase();
					const size = formatFileSize(copy.filesizeKb);
					return (
						<li
							key={copy.uuid}
							className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-2 rounded-xl px-4 py-4 odd:bg-muted/25 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center"
						>
							{(() => {
								const cover = (
									<div
										className={cn(
											"relative aspect-[2/3] w-12 shrink-0 overflow-hidden rounded-md bg-muted shadow-black/20 shadow-sm",
											COVER_EDGE,
										)}
									>
										{coverUrl ? (
											<img
												src={coverUrl}
												srcSet={coverSrcSet}
												sizes="48px"
												alt=""
												width={48}
												height={72}
												className="h-full w-full object-cover"
												loading="lazy"
												decoding="async"
											/>
										) : (
											<BookOpen
												aria-hidden="true"
												className="absolute top-1/2 left-1/2 size-5 -translate-x-1/2 -translate-y-1/2 text-muted-foreground/55"
											/>
										)}
									</div>
								);

								return copy.isCurrent ? (
									<div className="row-span-2">{cover}</div>
								) : (
									<Link
										to="/dashboard/books/$uuid"
										params={{ uuid: copy.uuid }}
										aria-label={m["book.open_copy_named"]({
											filename: displayTitle,
										})}
										className="row-span-2 rounded-md focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2"
									>
										{cover}
									</Link>
								);
							})()}
							<div className="flex min-w-0 flex-col gap-1 py-0.5">
								{copy.isCurrent ? (
									<p className="min-w-0 break-words font-medium text-foreground text-sm leading-snug">
										<bdi {...typesetProps(displayTitle)}>{displayTitle}</bdi>
									</p>
								) : (
									<Link
										to="/dashboard/books/$uuid"
										params={{ uuid: copy.uuid }}
										aria-label={m["book.open_copy_named"]({
											filename: displayTitle,
										})}
										className="min-w-0 break-words font-medium text-foreground text-sm leading-snug underline decoration-muted-foreground/35 underline-offset-4 transition-colors hover:decoration-foreground focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2"
									>
										<bdi {...typesetProps(displayTitle)}>{displayTitle}</bdi>
									</Link>
								)}
								<p className="min-w-0 break-all text-muted-foreground text-xs leading-snug">
									<bdi>{copy.filename}</bdi>
								</p>
								<div className="flex flex-wrap items-center gap-1.5 text-muted-foreground text-xs">
									{format && (
										<span className="font-semibold tracking-wider">
											{format}
										</span>
									)}
									{copy.isCurrent && (
										<Badge variant="secondary">
											{m["book.copy_current"]()}
										</Badge>
									)}
								</div>
								{size && (
									<p className="text-muted-foreground text-xs tabular-nums">
										{size}
									</p>
								)}
							</div>
							{!copy.isCurrent && canEdit && (
								<div className="col-start-2 flex pt-1 sm:col-start-3 sm:row-span-2 sm:row-start-1 sm:self-center sm:pt-0">
									<DropdownMenu>
										<DropdownMenuTrigger asChild>
											<Button
												variant="ghost"
												size="icon"
												className="size-11"
												aria-label={m["aria.more_actions"]()}
											>
												<DotsThree aria-hidden="true" weight="bold" />
											</Button>
										</DropdownMenuTrigger>
										<DropdownMenuContent align="end">
											<DropdownMenuItem
												onClick={() =>
													setCopyToUngroup({
														uuid: copy.uuid,
														filename: copy.filename,
													})
												}
											>
												<LinkBreak aria-hidden="true" />
												{m["book.separate"]()}
											</DropdownMenuItem>
										</DropdownMenuContent>
									</DropdownMenu>
								</div>
							)}
						</li>
					);
				})}
			</ul>
			{copyToUngroup && (
				<UngroupEditionDialog
					pageBookUuid={book.uuid}
					targetUuid={copyToUngroup.uuid}
					filename={copyToUngroup.filename}
					open
					onOpenChange={(open) => !open && setCopyToUngroup(null)}
				/>
			)}
		</section>
	);
}

function UngroupEditionDialog({
	pageBookUuid,
	targetUuid = pageBookUuid,
	filename,
	open,
	onOpenChange,
}: {
	pageBookUuid: string;
	targetUuid?: string;
	filename: string;
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const ungroup = useUngroupMutation(pageBookUuid);

	return (
		<Modal
			open={open}
			onOpenChange={onOpenChange}
			title={m["book.separate_confirm_title"]()}
			description={m["book.separate_confirm_description"]({ filename })}
			footer={
				<>
					<Button
						type="button"
						variant="outline"
						disabled={ungroup.isPending}
						onClick={() => onOpenChange(false)}
					>
						{m["common.cancel"]()}
					</Button>
					<Button
						type="button"
						disabled={ungroup.isPending}
						aria-busy={ungroup.isPending}
						onClick={() =>
							ungroup.mutate(targetUuid, {
								onSuccess: () => onOpenChange(false),
							})
						}
					>
						{ungroup.isPending ? (
							<CircleNotch
								data-icon="inline-start"
								className="animate-spin motion-reduce:animate-none"
							/>
						) : (
							<LinkBreak aria-hidden="true" data-icon="inline-start" />
						)}
						{m["book.separate_confirm_action"]()}
					</Button>
				</>
			}
		>
			<ul className="list-disc space-y-1 pl-5 text-muted-foreground text-sm">
				<li>{m["book.separate_confirm_lock"]()}</li>
				<li>{m["book.separate_confirm_refresh"]()}</li>
			</ul>
		</Modal>
	);
}
