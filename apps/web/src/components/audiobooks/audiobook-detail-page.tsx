import {
	Check,
	Clock,
	DotsThree,
	Headphones,
	Heart,
	Sparkle,
} from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useLoaderData } from "@tanstack/react-router";
import { Fragment, useState } from "react";
import { toast } from "sonner";
import {
	type Chapter,
	ChapterList,
} from "@/components/audio-player/chapter-list";
import {
	usePlayAudiobook,
	usePrefetchAudiobook,
} from "@/components/audio-player/use-play-audiobook";
import { MatchMetadataDialog } from "@/components/audiobooks/match-metadata-dialog";
import { AuthorLinkList } from "@/components/books/author-link-list";
import { BookCard } from "@/components/books/book-card";
import {
	CoverImage,
	CoverPreviewDialog,
	CoverProgressBar,
	getHeroStyle,
	ShelfDropdown,
	type ShelfOption,
} from "@/components/shared/detail-page";
import { ScrollSection } from "@/components/shared/scroll-section";
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
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
	toPlayerData,
	useAudioPlayerActions,
	useAudioPlayerBook,
	useAudioPlayerState,
} from "@/context/audio-player-context";
import type { getAudiobook } from "@/functions/books/get-audiobook";
import { useAbilities } from "@/hooks/use-abilities";
import { useMountEffect } from "@/hooks/use-mount-effect";
import { usePop } from "@/hooks/use-pop";
import { setHeroBackdrop } from "@/lib/hero-backdrop-store";
import { cn } from "@/lib/utils";
import { m } from "@/paraglide/messages";
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
	formatReadingTime,
	getErrorMessage,
} from "@/utils/format";
import { client, orpc } from "@/utils/orpc";

type AudiobookData = NonNullable<Awaited<ReturnType<typeof getAudiobook>>>;

const TAB_TRIGGER_CLASS =
	"after:!bg-[var(--book-accent)] px-0 py-1.5 text-[var(--book-hero-muted)] text-sm transition-colors after:transition-none hover:text-[var(--book-hero-text)] data-active:text-[var(--book-hero-text)] dark:text-[var(--book-hero-muted)]";

// Same chip styling as the ebook detail page (book-detail-page.tsx)
const GENRE_CHIP_CLASS =
	"inline-flex items-center rounded-full border border-border/70 bg-muted/50 px-2.5 py-0.5 font-medium text-muted-foreground text-xs transition-colors";
const GENRE_CHIP_LINK_CLASS =
	"hover:border-[color-mix(in_oklab,var(--book-accent)_45%,var(--border))] hover:bg-[color-mix(in_oklab,var(--book-accent)_14%,transparent)] hover:text-foreground";

function formatDuration(seconds: number | null): string | null {
	if (!seconds) return null;
	return formatReadingTime(seconds);
}

function formatBitrate(kbps: number | null): string | null {
	if (!kbps) return null;
	return `${kbps} kbps`;
}

type ShelfStatus = "want_to_listen" | "listening" | "backlog" | "completed";

export function AudiobookDetailPage() {
	const { audiobook } = useLoaderData({
		from: "/dashboard/audiobooks/$uuid",
	});

	const title = audiobook.title ?? audiobook.filename;
	const coverFilename = getCoverFilename(audiobook.cover);
	const coverUrl = coverFilename
		? getCoverPresetUrl(coverFilename, coverPresets.detail)
		: null;
	const coverSrcSet = coverFilename
		? getCoverSrcSet(coverFilename, coverPresets.detail.widths)
		: undefined;
	const coverBackdropUrl = coverFilename
		? getCoverPresetUrl(coverFilename, coverPresets.small)
		: null;
	const coverBackdropSrcSet = coverFilename
		? getCoverSrcSet(coverFilename, coverPresets.small.widths)
		: undefined;
	const coverPreviewUrl = coverFilename
		? getCoverUrl(coverFilename, 1200)
		: null;
	const coverPreviewSrcSet = coverFilename
		? getCoverSrcSet(coverFilename, [420, 560, 720, 960, 1200])
		: undefined;
	const authorText = formatNames(audiobook.authors);
	const authorLinks = audiobook.authors?.length ? (
		<AuthorLinkList
			authors={audiobook.authors}
			withRole
			showProvider
			linkClassName="transition-colors hover:text-[var(--book-hero-text)]"
			separatorClassName="text-[var(--book-hero-muted)]"
		/>
	) : null;
	const narratorLinks = audiobook.narrators?.length ? (
		<NarratorLinkList
			narrators={audiobook.narrators}
			linkClassName="transition-colors hover:text-[var(--book-hero-text)]"
			separatorClassName="text-[var(--book-hero-muted)]"
		/>
	) : null;
	const accentColor = audiobook.mainColor ?? null;
	const chapterCount = audiobook.chapters?.length ?? 0;
	const [isCoverPreviewOpen, setIsCoverPreviewOpen] = useState(false);

	// Hand this audiobook's backdrop (color + cover) to the layout so it paints one
	// continuous wash behind the header and the hero — same as the book page.
	// Keyed by uuid at the route, so it refreshes per audiobook; cleared on unmount.
	useMountEffect(() => {
		setHeroBackdrop({
			accent: accentColor,
			coverUrl: coverBackdropUrl,
			coverSrcSet: coverBackdropSrcSet,
		});
		return () => setHeroBackdrop(null);
	});

	return (
		<Tabs
			defaultValue="overview"
			className="relative min-h-full gap-0 overflow-hidden pb-16"
			style={getHeroStyle(accentColor)}
		>
			<section className="relative">
				<div className="px-4 pt-6 pb-7 md:px-12 md:pt-8 md:pb-8">
					<div className="mx-auto grid max-w-[110rem] gap-x-8 gap-y-4 md:grid-cols-[14.5rem_minmax(0,1fr)] xl:grid-cols-[16rem_minmax(0,1fr)]">
						<div className="mx-auto md:row-span-2 md:mx-0">
							<div className="w-full">
								<CoverImage
									coverUrl={coverUrl}
									coverSrcSet={coverSrcSet}
									title={title}
									aspectRatio="square"
									fallback={
										<div className="relative aspect-square w-full bg-muted">
											<Headphones
												className="absolute top-1/2 left-1/2 size-12 -translate-x-1/2 -translate-y-1/2 text-muted-foreground/30"
												weight="thin"
											/>
										</div>
									}
									onCoverClick={() => setIsCoverPreviewOpen(true)}
									progressBar={
										<DetailCoverProgress
											bookUuid={audiobook.uuid}
											accentColor={accentColor}
										/>
									}
								/>
							</div>

							<HeroActions
								bookUuid={audiobook.uuid}
								accentColor={accentColor}
								title={title}
								authorName={audiobook.authors?.[0]?.name}
								asin={audiobook.asin}
							/>
						</div>

						<div className="mx-auto w-full pt-3 text-left md:mx-0 md:pt-4">
							<h1 className="pt-2 font-bold text-2xl text-[var(--book-hero-text)] leading-relaxed tracking-tight md:text-3xl lg:text-4xl">
								{title}
							</h1>

							{authorText && (
								<p className="mt-0.5 text-[var(--book-hero-muted)] text-sm leading-relaxed md:text-base">
									{authorLinks}
								</p>
							)}

							{narratorLinks && (
								<p className="mt-1 text-[var(--book-hero-muted)] text-sm">
									{m["audiobook.narrated_by"]()} {narratorLinks}
								</p>
							)}

							<SynopsisSection description={audiobook.description} />
						</div>

						<div className="border-border/35 pt-2 md:self-end md:border-t md:pt-3">
							<TabsList
								variant="line"
								className="h-auto gap-4 p-0 text-[var(--book-hero-muted)]"
							>
								<TabsTrigger value="overview" className={TAB_TRIGGER_CLASS}>
									{m["audiobook.tab_overview"]()}
								</TabsTrigger>
								<TabsTrigger value="technical" className={TAB_TRIGGER_CLASS}>
									{m["audiobook.tab_technical"]()}
								</TabsTrigger>
								{chapterCount > 0 && (
									<TabsTrigger value="chapters" className={TAB_TRIGGER_CLASS}>
										{m["audiobook.tab_chapters"]()}
									</TabsTrigger>
								)}
							</TabsList>
						</div>
					</div>
				</div>
			</section>

			{coverPreviewUrl && (
				<CoverPreviewDialog
					open={isCoverPreviewOpen}
					onOpenChange={setIsCoverPreviewOpen}
					coverUrl={coverPreviewUrl}
					coverSrcSet={coverPreviewSrcSet}
					title={title}
				/>
			)}

			<div className="relative z-[1] px-4 pt-1.5 md:px-12 md:pt-2">
				<div className="mx-auto max-w-[110rem]">
					<TabsContent value="overview" className="mt-0 text-sm">
						<OverviewTab audiobook={audiobook} />
					</TabsContent>

					<TabsContent value="technical" className="mt-0 text-sm">
						<TechnicalTab audiobook={audiobook} />
					</TabsContent>

					{chapterCount > 0 && (
						<TabsContent value="chapters" className="mt-0 text-sm">
							<ChaptersTab audiobook={audiobook} />
						</TabsContent>
					)}
				</div>
			</div>
		</Tabs>
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
		orpc.listeningProgress.getProgress.queryOptions({
			input: { bookUuid },
		}),
	);

	const progress = progressQuery.data;
	if (!progress?.durationSeconds || progress.currentTimeSeconds == null) {
		return null;
	}

	const pct = Math.round(
		(progress.currentTimeSeconds / progress.durationSeconds) * 100,
	);

	return <CoverProgressBar percentage={pct} accentColor={accentColor} />;
}

function HeroActions({
	bookUuid,
	accentColor,
	title,
	authorName,
	asin,
}: {
	bookUuid: string;
	accentColor: string | null;
	title: string;
	authorName?: string;
	asin?: string | null;
}) {
	const queryClient = useQueryClient();
	const playAudiobook = usePlayAudiobook();
	const prefetchAudiobook = usePrefetchAudiobook();
	const { can } = useAbilities();
	const canEnrich = can("book", "editMetadata");
	const [isMatchOpen, setIsMatchOpen] = useState(false);

	// Built in-render so labels re-resolve on a locale change (see i18n remount).
	const shelfOptions: ShelfOption[] = [
		{
			value: "want_to_listen",
			label: m["book.shelf_want_to_listen"](),
			icon: Heart,
		},
		{
			value: "listening",
			label: m["book.shelf_listening"](),
			icon: Headphones,
		},
		{ value: "backlog", label: m["book.shelf_backlog"](), icon: Clock },
		{ value: "completed", label: m["book.shelf_completed"](), icon: Check },
	];

	const bookShelfQueryOptions = orpc.audiobookShelf.get.queryOptions({
		input: { bookUuid },
	});
	const bookShelfQuery = useQuery({
		...bookShelfQueryOptions,
		staleTime: 60_000,
	});

	const setShelfMutation = useMutation({
		mutationFn: (status: ShelfStatus) =>
			client.audiobookShelf.set({ bookUuid, status }),
		onMutate: async (status) => {
			await queryClient.cancelQueries({
				queryKey: bookShelfQueryOptions.queryKey,
			});
			const previous = queryClient.getQueryData(bookShelfQueryOptions.queryKey);
			queryClient.setQueryData(
				bookShelfQueryOptions.queryKey,
				(old: typeof previous) =>
					({ ...old, status }) as NonNullable<typeof previous>,
			);
			return { previous };
		},
		onSuccess: async (result) => {
			queryClient.setQueryData(bookShelfQueryOptions.queryKey, result);
			const option = shelfOptions.find((o) => o.value === result?.status);
			toast.success(
				option
					? m["book.marked_as"]({ label: option.label })
					: m["toast.list_updated"](),
			);
		},
		onError: (error, _variables, context) => {
			if (context?.previous !== undefined) {
				queryClient.setQueryData(
					bookShelfQueryOptions.queryKey,
					context.previous,
				);
			}
			toast.error(getErrorMessage(error, m["toast.update_list_failed"]()));
		},
	});

	const removeShelfMutation = useMutation({
		mutationFn: () => client.audiobookShelf.remove({ bookUuid }),
		onMutate: async () => {
			await queryClient.cancelQueries({
				queryKey: bookShelfQueryOptions.queryKey,
			});
			const previous = queryClient.getQueryData(bookShelfQueryOptions.queryKey);
			queryClient.setQueryData(bookShelfQueryOptions.queryKey, null);
			return { previous };
		},
		onSuccess: () => {
			toast.success(m["toast.removed_from_list"]());
		},
		onError: (error, _variables, context) => {
			if (context?.previous !== undefined) {
				queryClient.setQueryData(
					bookShelfQueryOptions.queryKey,
					context.previous,
				);
			}
			toast.error(getErrorMessage(error, m["toast.remove_from_list_failed"]()));
		},
	});

	const currentShelf = bookShelfQuery.data?.status as string | undefined;

	// --- Like ---
	const likeStatusQueryOptions = orpc.likedBooks.getLikeStatus.queryOptions({
		input: { bookUuid },
	});
	const likeStatusQuery = useQuery(likeStatusQueryOptions);
	const toggleLikeMutation = useMutation({
		mutationFn: () => client.likedBooks.toggleLike({ bookUuid }),
		onMutate: async () => {
			await queryClient.cancelQueries({
				queryKey: likeStatusQueryOptions.queryKey,
			});
			const previous = queryClient.getQueryData(
				likeStatusQueryOptions.queryKey,
			);
			queryClient.setQueryData(
				likeStatusQueryOptions.queryKey,
				(old: typeof previous) => (old ? { ...old, liked: !old.liked } : old),
			);
			return { previous };
		},
		onSuccess: async (result) => {
			queryClient.setQueryData(likeStatusQueryOptions.queryKey, result);
			toast.success(
				result.liked
					? m["toast.added_to_likes"]()
					: m["toast.removed_from_likes"](),
			);
			await queryClient.invalidateQueries({
				queryKey: [["likedBooks", "listLiked"]],
			});
		},
		onError: (error, _variables, context) => {
			if (context?.previous) {
				queryClient.setQueryData(
					likeStatusQueryOptions.queryKey,
					context.previous,
				);
			}
			toast.error(getErrorMessage(error, m["toast.like_failed"]()));
		},
	});
	const isLiked = likeStatusQuery.data?.liked ?? false;
	const { ref: heartRef, pop: popHeart } = usePop<SVGSVGElement>();

	// --- Listening progress (drives the primary CTA) ---
	const progressQuery = useQuery(
		orpc.listeningProgress.getProgress.queryOptions({ input: { bookUuid } }),
	);
	const progress = progressQuery.data;
	const listenPct =
		progress?.durationSeconds && progress.currentTimeSeconds != null
			? Math.round(
					(progress.currentTimeSeconds / progress.durationSeconds) * 100,
				)
			: null;
	const isInProgress = listenPct != null && listenPct > 0 && listenPct < 100;

	return (
		<>
			<div className="mt-3 flex items-center gap-2">
				<Button
					onClick={() => playAudiobook(bookUuid)}
					onPointerEnter={() => prefetchAudiobook(bookUuid)}
					onFocus={() => prefetchAudiobook(bookUuid)}
					className="h-11 flex-1 gap-1.5 rounded-md border-0 font-semibold text-sm hover:brightness-105"
					style={
						accentColor
							? {
									backgroundColor: "var(--book-accent)",
									color: "var(--book-accent-foreground)",
								}
							: undefined
					}
				>
					<Headphones className="size-3.5 shrink-0" />
					<span className="truncate">
						{isInProgress
							? m["audiobook.continue_listening"]()
							: m["audiobook.listen"]()}
					</span>
					{isInProgress && (
						<span className="shrink-0 tabular-nums opacity-80">
							· {listenPct}%
						</span>
					)}
				</Button>
				<Button
					variant="outline"
					size="icon"
					aria-label={
						isLiked ? m["aria.remove_from_likes"]() : m["aria.add_to_likes"]()
					}
					aria-pressed={isLiked}
					onClick={() => {
						if (!isLiked) popHeart();
						toggleLikeMutation.mutate();
					}}
					disabled={toggleLikeMutation.isPending || likeStatusQuery.isLoading}
					className={cn(
						"size-11 rounded-md",
						isLiked
							? "!border-transparent !bg-destructive/75 !text-white hover:!bg-destructive/65"
							: "border-border bg-muted text-[var(--book-hero-text)] hover:bg-accent hover:text-[var(--book-hero-text)]",
					)}
				>
					<Heart
						ref={heartRef}
						weight={isLiked ? "fill" : "regular"}
						className="size-4"
					/>
				</Button>
				{canEnrich && (
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button
								variant="outline"
								size="icon"
								aria-label={m["aria.more_actions"]()}
								className="size-11 rounded-md border-border bg-muted text-[var(--book-hero-text)] hover:bg-accent hover:text-[var(--book-hero-text)]"
							>
								<DotsThree className="size-4" />
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end" sideOffset={6}>
							<DropdownMenuItem onClick={() => setIsMatchOpen(true)}>
								<Sparkle className="size-4" />
								{m["audiobook.match_metadata"]()}
							</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>
				)}
			</div>

			{canEnrich && (
				<MatchMetadataDialog
					open={isMatchOpen}
					onOpenChange={setIsMatchOpen}
					audiobookUuid={bookUuid}
					initialTitle={title}
					initialAuthor={authorName}
					initialAsin={asin}
				/>
			)}

			<ShelfDropdown
				options={shelfOptions}
				currentStatus={currentShelf}
				onSelect={(status) => setShelfMutation.mutate(status as ShelfStatus)}
				onRemove={() => removeShelfMutation.mutate()}
			/>
		</>
	);
}

function OverviewTab({ audiobook }: { audiobook: AudiobookData }) {
	const publishedYear = audiobook.publishedDate?.match(/\d{4}/)?.[0] ?? null;
	const authorDetailLinks = audiobook.authors?.length ? (
		<AuthorLinkList
			authors={audiobook.authors}
			withRole
			showProvider
			linkClassName="underline decoration-muted-foreground/40 underline-offset-2 transition-colors hover:text-foreground hover:decoration-foreground/60"
		/>
	) : null;
	const narratorDetailLinks = audiobook.narrators?.length ? (
		<NarratorLinkList
			narrators={audiobook.narrators}
			linkClassName="underline decoration-muted-foreground/40 underline-offset-2 transition-colors hover:text-foreground hover:decoration-foreground/60"
		/>
	) : null;

	const detailRows = [
		{
			label: m["audiobook.duration"](),
			value: formatDuration(audiobook.duration),
		},
		{ label: m["audiobook.authors"](), value: authorDetailLinks ?? null },
		{ label: m["audiobook.narrators"](), value: narratorDetailLinks ?? null },
		{
			label: m["audiobook.language"](),
			value: audiobook.languageCode?.toUpperCase() ?? null,
		},
		{
			label: m["audiobook.library"](),
			value: audiobook.libraryUuid ? (
				<Link
					to="/dashboard/libraries/$uuid"
					params={{ uuid: audiobook.libraryUuid }}
					className="underline decoration-muted-foreground/40 underline-offset-2 transition-colors hover:text-foreground hover:decoration-foreground/60"
				>
					{audiobook.libraryName ?? m["library.untitled"]()}
				</Link>
			) : null,
		},
		{
			label: m["audiobook.series"](),
			value:
				audiobook.series?.uuid && audiobook.series.name ? (
					<Link
						to="/dashboard/audiobooks/series/$uuid"
						params={{ uuid: audiobook.series.uuid }}
						className="underline decoration-muted-foreground/40 underline-offset-2 transition-colors hover:text-foreground hover:decoration-foreground/60"
					>
						{audiobook.series.name}
					</Link>
				) : (
					(audiobook.series?.name ?? null)
				),
		},
		{
			label: m["audiobook.series_position"](),
			value:
				audiobook.series?.position != null
					? String(audiobook.series.position)
					: null,
		},
		{ label: m["audiobook.year"](), value: publishedYear },
		{
			label: m["audiobook.published"](),
			value: formatDate(audiobook.publishedDate),
		},
		{
			label: m["book.genres"](),
			value: audiobook.genres?.length ? (
				<div className="flex flex-wrap gap-1.5">
					{audiobook.genres.map((genre) => (
						<Link
							key={genre.uuid}
							to="/dashboard/genres/$uuid"
							params={{ uuid: genre.uuid }}
							className={cn(GENRE_CHIP_CLASS, GENRE_CHIP_LINK_CLASS)}
						>
							{genre.name}
						</Link>
					))}
				</div>
			) : null,
		},
		{
			label: m["book.tags"](),
			value: audiobook.tags?.length ? (
				<div className="flex flex-wrap gap-1.5">
					{audiobook.tags.map((tag) => (
						<Link
							key={tag.uuid}
							to="/dashboard/tags/$uuid"
							params={{ uuid: tag.uuid }}
							className={cn(GENRE_CHIP_CLASS, GENRE_CHIP_LINK_CLASS)}
						>
							{tag.name}
						</Link>
					))}
				</div>
			) : null,
		},
	].filter((row) => Boolean(row.value));

	const identifierRows = [
		audiobook.isbn
			? { label: "ISBN", value: audiobook.isbn, valueClassName: "font-mono" }
			: null,
		audiobook.asin
			? {
					label: "ASIN",
					value: (
						<a
							href={`https://www.amazon.co.jp/dp/${audiobook.asin}`}
							target="_blank"
							rel="noopener noreferrer"
							className="font-mono underline decoration-muted-foreground/40 underline-offset-2 transition-colors hover:text-foreground hover:decoration-foreground/60"
						>
							{audiobook.asin}
						</a>
					),
				}
			: null,
	].filter(Boolean) as DetailListRow[];

	return (
		<div className="space-y-6">
			{detailRows.length > 0 && (
				<DetailListSection
					title={m["audiobook.section_details"]()}
					rows={detailRows}
				/>
			)}
			{identifierRows.length > 0 && (
				<DetailListSection
					title={m["audiobook.section_identifiers"]()}
					rows={identifierRows}
				/>
			)}
			{audiobook.series?.uuid && audiobook.series.name && (
				<SeriesAudiobooksSection
					seriesUuid={audiobook.series.uuid}
					seriesName={audiobook.series.name}
					currentAudiobookUuid={audiobook.uuid}
				/>
			)}
		</div>
	);
}

function SeriesAudiobooksSection({
	seriesUuid,
	seriesName,
	currentAudiobookUuid,
}: {
	seriesUuid: string;
	seriesName: string;
	currentAudiobookUuid: string;
}) {
	const seriesAudiobooksQuery = useQuery(
		orpc.audiobooks.listBySeries.queryOptions({
			input: { seriesUuid },
		}),
	);

	const audiobooks = seriesAudiobooksQuery.data;

	if (!audiobooks || audiobooks.length <= 1) return null;

	return (
		<ScrollSection
			title={seriesName}
			showAllHref={`/dashboard/audiobooks/series/${seriesUuid}`}
		>
			{audiobooks.map((ab) => (
				<div
					key={ab.uuid}
					className={cn(
						"w-[120px] shrink-0 rounded-lg md:w-[140px]",
						ab.uuid === currentAudiobookUuid &&
							"ring-2 ring-[var(--book-accent)] ring-inset",
					)}
				>
					<BookCard
						uuid={ab.uuid}
						title={ab.title}
						filename={ab.filename ?? ab.title}
						cover={ab.cover}
						contextMenuEnabled={false}
						coverPreset={coverPresets.small}
						mediaType="audiobook"
					/>
				</div>
			))}
		</ScrollSection>
	);
}

function TechnicalTab({ audiobook }: { audiobook: AudiobookData }) {
	const fileCount = audiobook.audioFiles?.length ?? 0;

	const technicalRows = [
		{
			label: m["audiobook.codec"](),
			value: audiobook.codec?.toUpperCase() ?? null,
		},
		{
			label: m["audiobook.bitrate"](),
			value: formatBitrate(audiobook.bitRate),
		},
		{
			label: m["audiobook.sample_rate"](),
			value: audiobook.sampleRate ? `${audiobook.sampleRate} Hz` : null,
		},
		{
			label: m["audiobook.channels"](),
			value: audiobook.channels
				? audiobook.channels === 1
					? m["audiobook.mono"]()
					: audiobook.channels === 2
						? m["audiobook.stereo"]()
						: String(audiobook.channels)
				: null,
		},
		{
			label: m["audiobook.files"](),
			value: fileCount ? String(fileCount) : null,
			key: "files",
		},
	].filter((row) => Boolean(row.value));

	const fileRows = [
		{
			label: m["book.filename"](),
			value: audiobook.filename,
			valueClassName: "break-all",
		},
		audiobook.filesizeKb
			? {
					label: m["book.size"](),
					value: formatFileSize(audiobook.filesizeKb),
				}
			: null,
		audiobook.createdAt
			? { label: m["book.added"](), value: formatDate(audiobook.createdAt) }
			: null,
		audiobook.lastModified
			? {
					label: m["book.modified"](),
					value: formatDate(audiobook.lastModified),
				}
			: null,
	].filter(Boolean) as DetailListRow[];

	return (
		<div className="space-y-6">
			{technicalRows.length > 0 && (
				<DetailListSection
					title={m["audiobook.section_technical"]()}
					rows={technicalRows}
				/>
			)}
			{fileRows.length > 0 && (
				<DetailListSection
					title={m["book.section_file_info"]()}
					rows={fileRows}
				/>
			)}
		</div>
	);
}

function ChaptersTab({ audiobook }: { audiobook: AudiobookData }) {
	const playerBook = useAudioPlayerBook();
	const { globalCurrentTime } = useAudioPlayerState();
	const { loadAudiobook, seekTo } = useAudioPlayerActions();

	const isActive = playerBook?.uuid === audiobook.uuid;
	const chapters: Chapter[] = (audiobook.chapters ?? []).map((ch) => ({
		index: ch.index,
		title: ch.title,
		startTime: ch.startTime,
		endTime: ch.endTime,
	}));

	// Jump to a chapter: seek if this book already drives the player, otherwise
	// load it starting at the chapter (startTime overrides the saved position).
	const seekToChapter = (startTime: number) => {
		if (isActive) {
			seekTo(startTime);
		} else {
			loadAudiobook(toPlayerData(audiobook), { startTime });
		}
	};

	return (
		<ChapterList
			chapters={chapters}
			variant="detail"
			currentTime={isActive ? globalCurrentTime : -1}
			onSeekToChapter={seekToChapter}
			fallbackLabel={(index) =>
				m["audiobook.chapter_fallback"]({ number: index + 1 })
			}
		/>
	);
}

function NarratorLinkList({
	narrators,
	linkClassName,
	separatorClassName,
}: {
	narrators: { uuid?: string | null; name: string }[];
	linkClassName?: string;
	separatorClassName?: string;
}) {
	return (
		<span className="inline-flex flex-wrap items-center gap-x-1">
			{narrators.map((narrator, index) => (
				<Fragment key={narrator.uuid ?? narrator.name}>
					{index > 0 && (
						<span
							className={cn("text-muted-foreground/70", separatorClassName)}
						>
							,
						</span>
					)}
					{narrator.uuid ? (
						<Link
							to="/dashboard/narrators/$uuid"
							params={{ uuid: narrator.uuid }}
							className={cn(
								"hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
								linkClassName,
							)}
						>
							{narrator.name}
						</Link>
					) : (
						<span>{narrator.name}</span>
					)}
				</Fragment>
			))}
		</span>
	);
}
