import {
	Check,
	CircleNotch,
	Clock,
	DotsThree,
	DownloadSimple,
	Headphones,
	Heart,
	PencilSimple,
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
import { AuthorLinkList } from "@/components/books/author-link-list";
import { BookCard } from "@/components/books/book-card";
import { EditAudiobookMetadataDialog } from "@/components/metadata/edit-metadata-dialog";
import { AudiobookMatchDialog } from "@/components/metadata/match-metadata-dialog";
import {
	CoverImage,
	CoverPreviewDialog,
	CoverProgressBar,
	GenreChips,
	getHeroStyle,
	ShelfDropdown,
	type ShelfOption,
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
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import {
	toPlayerData,
	useAudioPlayerActions,
	useAudioPlayerBook,
	useAudioPlayerState,
	useIsAudiobookLoading,
} from "@/context/audio-player-context";
import type { getAudiobook } from "@/functions/books/get-audiobook";
import { useToggleLike } from "@/hooks/books/use-toggle-like";
import { useAbilities } from "@/hooks/use-abilities";
import { usePop } from "@/hooks/use-pop";
import { invalidateEverywhere } from "@/lib/invalidate-everywhere";
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
	formatTime,
	getErrorMessage,
} from "@/utils/format";
import { client, orpc } from "@/utils/orpc";

type AudiobookData = NonNullable<Awaited<ReturnType<typeof getAudiobook>>>;

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
	const coverPreviewUrl = coverFilename
		? getCoverUrl(coverFilename, 2048)
		: null;
	const coverPreviewSrcSet = coverFilename
		? getCoverSrcSet(coverFilename, [400, 600, 800, 1200, 2048])
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

	return (
		<div
			className="relative min-h-full pb-16"
			style={getHeroStyle(accentColor)}
		>
			<section className="relative">
				<div className="relative px-4 pt-6 pb-7 md:px-12 md:pt-10 md:pb-10">
					<div className="mx-auto grid max-w-[110rem] items-start gap-x-10 gap-y-6 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] xl:grid-cols-[minmax(0,30rem)_minmax(0,1fr)] xl:gap-x-16 2xl:grid-cols-[minmax(0,36rem)_minmax(0,1fr)]">
						{/* Editorial rail: title, byline and narrator head the artwork
						    column (Fable-style), with the cover centred under them and
						    the actions stacked full-width beneath. */}
						<div className="lg:sticky lg:top-8">
							<h1 className="font-bold text-2xl text-[var(--book-hero-text)] leading-tight tracking-tight md:text-3xl">
								{title}
							</h1>

							{authorText && (
								<p className="mt-1.5 text-[var(--book-hero-muted)] text-sm leading-relaxed md:text-base">
									{authorLinks}
								</p>
							)}

							{narratorLinks && (
								<p className="mt-1 text-[var(--book-hero-muted)] text-sm">
									{m["audiobook.narrated_by"]()} {narratorLinks}
								</p>
							)}

							<div className="mx-auto mt-6 w-full max-w-[15rem] sm:mx-0 md:mt-8 lg:mx-auto xl:max-w-[17rem] 2xl:max-w-[18rem]">
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

							<div className="mx-auto w-full max-w-[25rem] sm:mx-0 lg:mx-auto">
								<HeroActions
									audiobook={audiobook}
									bookUuid={audiobook.uuid}
									accentColor={accentColor}
									title={title}
									authorName={audiobook.authors?.[0]?.name}
									asin={audiobook.asin}
								/>
							</div>
						</div>

						<div className="w-full">
							<SynopsisSection
								description={audiobook.description}
								title={m["book.meta_description"]()}
							/>

							{/* One continuous column instead of tabs: everything lines up
							    with the synopsis rather than running full-bleed under the
							    artwork rail. */}
							<div className="mt-8 space-y-8 text-sm">
								<AudiobookDetailsSection audiobook={audiobook} />
								<TechnicalSection audiobook={audiobook} />
								{chapterCount > 0 && <ChaptersSection audiobook={audiobook} />}
								{audiobook.series?.uuid && audiobook.series.name && (
									<SeriesAudiobooksSection
										seriesUuid={audiobook.series.uuid}
										seriesName={audiobook.series.name}
										currentAudiobookUuid={audiobook.uuid}
									/>
								)}
								<SimilarItemsSection bookUuid={audiobook.uuid} />
							</div>
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
					placeholderUrl={coverUrl}
					placeholderSrcSet={coverSrcSet}
					title={title}
					aspectRatio="square"
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
	audiobook,
	bookUuid,
	accentColor,
	title,
	authorName,
	asin,
}: {
	audiobook: AudiobookData;
	bookUuid: string;
	accentColor: string | null;
	title: string;
	authorName?: string;
	asin?: string | null;
}) {
	const queryClient = useQueryClient();
	const playAudiobook = usePlayAudiobook();
	const prefetchAudiobook = usePrefetchAudiobook();
	const isLoadingPlayback = useIsAudiobookLoading(bookUuid);
	const { can } = useAbilities();
	const canEnrich = can("book", "editMetadata");
	const canDownload = can("audiobook", "download");
	const [isMatchOpen, setIsMatchOpen] = useState(false);
	const [isEditOpen, setIsEditOpen] = useState(false);
	const [isDownloading, setIsDownloading] = useState(false);

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
			// shelf placement is a recommendation seed and gates continueSeries
			await invalidateEverywhere(queryClient, [
				[["audiobookShelf", "getPublicShelf"]],
				[["audiobookShelf", "getPublicShelfPaginated"]],
				[["audiobookShelf", "list"]],
				orpc.recommendations.key(),
			]);
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
		onSuccess: async () => {
			toast.success(m["toast.removed_from_list"]());
			// shelf placement is a recommendation seed and gates continueSeries
			await invalidateEverywhere(queryClient, [
				[["audiobookShelf", "getPublicShelf"]],
				[["audiobookShelf", "getPublicShelfPaginated"]],
				[["audiobookShelf", "list"]],
				orpc.recommendations.key(),
			]);
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
	const likeStatusQuery = useQuery(
		orpc.likedBooks.getLikeStatus.queryOptions({ input: { bookUuid } }),
	);
	const toggleLikeMutation = useToggleLike(bookUuid, "audiobook");
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
	const remainingSeconds =
		progress?.durationSeconds != null && progress.currentTimeSeconds != null
			? Math.max(0, progress.durationSeconds - progress.currentTimeSeconds)
			: null;

	return (
		<>
			<div className="mt-3 flex items-center gap-2">
				<Button
					onClick={() => playAudiobook(bookUuid)}
					onPointerEnter={() => prefetchAudiobook(bookUuid)}
					onFocus={() => prefetchAudiobook(bookUuid)}
					disabled={isLoadingPlayback}
					aria-busy={isLoadingPlayback}
					className="h-11 flex-1 gap-1.5 rounded-full border-0 font-semibold text-sm hover:brightness-105"
					style={
						accentColor
							? {
									backgroundColor: "var(--book-accent)",
									color: "var(--book-accent-foreground)",
								}
							: undefined
					}
				>
					{isLoadingPlayback ? (
						<CircleNotch className="size-4 shrink-0 animate-spin" />
					) : (
						<Headphones className="size-4 shrink-0" />
					)}
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
							onClick={() => {
								if (!isLiked) popHeart();
								toggleLikeMutation.mutate();
							}}
							disabled={
								toggleLikeMutation.isPending || likeStatusQuery.isLoading
							}
							className={cn(
								"size-11 rounded-full",
								isLiked
									? "!border-transparent !bg-destructive/75 !text-destructive-foreground hover:!bg-destructive/65"
									: "border-border bg-muted text-[var(--book-hero-text)] hover:bg-accent hover:text-[var(--book-hero-text)]",
							)}
						>
							<Heart
								ref={heartRef}
								weight={isLiked ? "fill" : "regular"}
								className="size-4"
							/>
						</Button>
					</TooltipTrigger>
					<TooltipContent>
						{isLiked ? m["aria.remove_from_likes"]() : m["aria.add_to_likes"]()}
					</TooltipContent>
				</Tooltip>
				{canEnrich && (
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button
								variant="outline"
								size="icon"
								aria-label={m["aria.more_actions"]()}
								className="size-11 rounded-full border-border bg-muted text-[var(--book-hero-text)] hover:bg-accent hover:text-[var(--book-hero-text)]"
							>
								<DotsThree className="size-4" />
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end" sideOffset={6}>
							<DropdownMenuItem onClick={() => setIsEditOpen(true)}>
								<PencilSimple className="size-4" />
								{m["book.edit_metadata"]()}
							</DropdownMenuItem>
							<DropdownMenuItem onClick={() => setIsMatchOpen(true)}>
								<Sparkle className="size-4" />
								{m["match.action"]()}
							</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>
				)}
			</div>

			{canDownload && (
				<Button
					variant="outline"
					onClick={handleDownload}
					disabled={isDownloading}
					className="mt-2 h-11 w-full gap-1.5 rounded-full border-border bg-muted text-[var(--book-hero-text)] text-sm hover:bg-accent hover:text-[var(--book-hero-text)]"
				>
					{isDownloading ? (
						<CircleNotch className="size-4 animate-spin" />
					) : (
						<DownloadSimple className="size-4" />
					)}
					{m["common.download"]()}
				</Button>
			)}

			{/* Mounted per open so a re-open starts from a clean search. */}
			{canEnrich && isMatchOpen && (
				<AudiobookMatchDialog
					open
					onOpenChange={setIsMatchOpen}
					audiobookUuid={bookUuid}
					initialTitle={title}
					initialAuthor={authorName}
					initialAsin={asin}
				/>
			)}

			{/* Mounted per open so the form re-reads fresh values after a save. */}
			{isEditOpen && (
				<EditAudiobookMetadataDialog
					open
					onOpenChange={setIsEditOpen}
					audiobook={{
						...audiobook,
						authors: audiobook.authors ?? [],
						narrators: audiobook.narrators ?? [],
						genres: audiobook.genres ?? [],
						tags: audiobook.tags ?? [],
					}}
				/>
			)}

			<ShelfDropdown
				options={shelfOptions}
				currentStatus={currentShelf}
				onSelect={(status) => setShelfMutation.mutate(status as ShelfStatus)}
				onRemove={() => removeShelfMutation.mutate()}
			/>

			{isInProgress && remainingSeconds != null && remainingSeconds > 0 && (
				<p className="mt-2 text-muted-foreground text-xs tabular-nums">
					{m["audiobook.time_left"]({
						time: formatReadingTime(remainingSeconds),
					})}
				</p>
			)}
		</>
	);
}

function AudiobookDetailsSection({ audiobook }: { audiobook: AudiobookData }) {
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
				<GenreChips
					items={(audiobook.genres ?? []).map((genre) => ({
						uuid: genre.uuid,
						name: genre.name,
					}))}
					linkTo="genres"
				/>
			) : null,
		},
		{
			label: m["book.tags"](),
			value: audiobook.tags?.length ? (
				<GenreChips
					items={(audiobook.tags ?? []).map((tag) => ({
						uuid: tag.uuid,
						name: tag.name,
					}))}
					linkTo="tags"
				/>
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
			restoreId="series-rail"
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
						coverFrameRatio="square"
					/>
				</div>
			))}
		</ScrollSection>
	);
}

function TechnicalSection({ audiobook }: { audiobook: AudiobookData }) {
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
			<AudioFilesSection audiobook={audiobook} />
		</div>
	);
}

function AudioFilesSection({ audiobook }: { audiobook: AudiobookData }) {
	const { can } = useAbilities();
	const canDownload = can("audiobook", "download");
	const [downloadingIndex, setDownloadingIndex] = useState<number | null>(null);

	const files = audiobook.audioFiles ?? [];
	if (files.length === 0) return null;

	const handleDownload = async (fileIndex: number) => {
		if (downloadingIndex != null) return;
		try {
			setDownloadingIndex(fileIndex);
			const { url } = await client.files.getAudioFileDownloadUrl({
				uuid: audiobook.uuid,
				fileIndex,
			});
			window.open(url, "_blank", "noopener,noreferrer");
		} catch (error) {
			toast.error(getErrorMessage(error, m["toast.download_failed"]()));
		} finally {
			setDownloadingIndex(null);
		}
	};

	return (
		<section className="space-y-4">
			<h2 className="font-bold text-[1.375rem]">{m["audiobook.files"]()}</h2>
			<div className="space-y-0.5">
				{files.map((file) => (
					<div
						key={file.index}
						className="flex items-center gap-3 rounded-md px-2 py-1.5 text-sm hover:bg-accent/50"
					>
						<span className="w-6 shrink-0 text-right text-muted-foreground text-xs tabular-nums">
							{file.index + 1}
						</span>
						<span className="min-w-0 flex-1 truncate text-foreground">
							{file.filename}
						</span>
						{file.duration > 0 && (
							<span className="shrink-0 text-muted-foreground text-xs tabular-nums">
								{formatTime(file.duration)}
							</span>
						)}
						{file.filesize != null && (
							<span className="w-16 shrink-0 text-right text-muted-foreground text-xs tabular-nums">
								{formatFileSize(Math.round(file.filesize / 1024))}
							</span>
						)}
						{canDownload && (
							<Button
								variant="ghost"
								size="icon"
								aria-label={m["common.download"]()}
								disabled={downloadingIndex != null}
								onClick={() => {
									void handleDownload(file.index);
								}}
								className="size-7 shrink-0 text-muted-foreground hover:text-foreground"
							>
								{downloadingIndex === file.index ? (
									<CircleNotch className="size-3.5 animate-spin" />
								) : (
									<DownloadSimple className="size-3.5" />
								)}
							</Button>
						)}
					</div>
				))}
			</div>
		</section>
	);
}

function ChaptersSection({ audiobook }: { audiobook: AudiobookData }) {
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
