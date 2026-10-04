import { ReadingHistory } from "@nanahoshi/reader/sessions/reading-history";
import { Button } from "@nanahoshi/ui/components/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@nanahoshi/ui/components/dropdown-menu";
import {
	Tabs,
	TabsContent,
	TabsList,
	TabsTrigger,
} from "@nanahoshi/ui/components/tabs";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@nanahoshi/ui/components/tooltip";
import { cn } from "@nanahoshi/ui/lib/utils";
import {
	ArrowCounterClockwise,
	BookmarkSimple,
	CircleNotch,
	DotsThree,
	DownloadSimple,
	Headphones,
	Heart,
	PencilSimple,
	Sparkle,
} from "@phosphor-icons/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
	Link,
	useLoaderData,
	useRouter,
	useSearch,
} from "@tanstack/react-router";
import { Fragment, useId, useState } from "react";
import { toast } from "sonner";
import {
	usePlayAudiobook,
	usePrefetchAudiobook,
} from "@/components/audio-player/use-play-audiobook";
import { AddToListModal } from "@/components/books/add-to-list-modal";
import { AuthorLinkList } from "@/components/books/author-link-list";
import { BookCard } from "@/components/books/book-card";
import { getShelfOptions } from "@/components/books/shelf-options";
import { EditAudiobookMetadataDialog } from "@/components/metadata/edit-metadata-dialog";
import { AudiobookMatchDialog } from "@/components/metadata/match-metadata-dialog";
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
	DetailListSection,
	SynopsisSection,
} from "@/components/shared/synopsis-section";
import { useIsAudiobookLoading } from "@/context/audio-player-context";
import type { getAudiobook } from "@/functions/books/get-audiobook";
import { useToggleLike } from "@/hooks/books/use-toggle-like";
import { useAbilities } from "@/hooks/use-abilities";
import { usePop } from "@/hooks/use-pop";
import { PAGE_GUTTER, PAGE_GUTTER_BLEED } from "@/lib/page-layout";
import { m } from "@/paraglide/messages";
import {
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
	formatReadingTime,
	formatTime,
	getErrorMessage,
} from "@/utils/format";
import { client, orpc } from "@/utils/orpc";
import { ChaptersSection } from "./chapters-section";

type AudiobookData = NonNullable<Awaited<ReturnType<typeof getAudiobook>>>;

function formatDuration(seconds: number | null): string | null {
	if (!seconds) return null;
	return formatReadingTime(seconds);
}

function formatBitrate(kbps: number | null): string | null {
	if (!kbps) return null;
	return `${kbps} kbps`;
}

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
	const publishedYear = audiobook.publishedDate?.match(/\d{4}/)?.[0] ?? null;
	const authorLinks = audiobook.authors?.length ? (
		<AuthorLinkList
			authors={audiobook.authors}
			withRole
			showProvider
			linkClassName={HERO_LINK_CLASSNAME}
			separatorClassName="text-foreground/50"
		/>
	) : null;
	const narratorLinks = audiobook.narrators?.length ? (
		<NarratorLinkList
			narrators={audiobook.narrators}
			linkClassName={HERO_LINK_CLASSNAME}
			separatorClassName="text-foreground/50"
		/>
	) : null;
	const accentColor = "var(--primary)";
	const chapterCount = audiobook.chapters?.length ?? 0;
	const [isCoverPreviewOpen, setIsCoverPreviewOpen] = useState(false);
	const { tab: openTab } = useSearch({ strict: false });
	const pairingsQuery = useQuery(
		orpc.readListen.getPairings.queryOptions({
			input: { publicationUuid: audiobook.uuid },
		}),
	);

	return (
		<div
			className="relative min-h-full bg-background pb-16"
			style={getHeroStyle(accentColor, "var(--primary-foreground)")}
		>
			<DetailBackButton fallbackTo="/dashboard/audiobooks" />
			<DetailHero
				tint={audiobook.mainColor}
				backdropUrl={coverUrl}
				labelledBy="audiobook-detail-title"
				coverShape="square"
				cover={
					<CoverImage
						coverUrl={coverUrl}
						coverSrcSet={coverSrcSet}
						title={title}
						aspectRatio="square"
						tint={audiobook.mainColor}
						fallback={
							<div className="relative aspect-square w-full bg-muted">
								<Headphones
									aria-hidden="true"
									className="absolute top-1/2 left-1/2 size-12 -translate-x-1/2 -translate-y-1/2 text-muted-foreground/30"
									weight="thin"
								/>
							</div>
						}
						onCoverClick={() => setIsCoverPreviewOpen(true)}
						progressBar={
							<DetailCoverProgress
								bookUuid={audiobook.uuid}
								accentColor="oklch(1 0 0)"
							/>
						}
					/>
				}
				header={
					<>
						<HeroTitle id="audiobook-detail-title">{title}</HeroTitle>
						{authorLinks && (
							<p className="font-medium text-base text-foreground leading-relaxed sm:text-lg">
								{authorLinks}
							</p>
						)}
						{narratorLinks && (
							<p className="text-foreground/80 text-sm leading-relaxed sm:text-base">
								{m["audiobook.narrated_by"]()} {narratorLinks}
							</p>
						)}
						<HeroMeta
							items={[
								audiobook.genres?.[0]?.name
									? capitalizeFirst(audiobook.genres[0].name)
									: null,
								publishedYear,
								formatDuration(audiobook.duration),
								audiobook.languageCode?.toUpperCase(),
								pairedPublicationMetaItem(
									pairingsQuery.data?.pairings,
									"audiobook",
								),
							]}
						/>
					</>
				}
				actions={
					<HeroActions
						audiobook={audiobook}
						bookUuid={audiobook.uuid}
						title={title}
						authorName={audiobook.authors?.[0]?.name}
						asin={audiobook.asin}
					/>
				}
			/>
			<div className={cn(PAGE_GUTTER, "pt-8 pb-12 sm:pt-10 lg:pb-16")}>
				<div className="mx-auto max-w-[1400px]">
					<SynopsisSection
						description={audiobook.description}
						title={m["book.meta_description"]()}
						className="mt-0 mb-8"
						descriptionClassName="max-w-[110ch] text-foreground"
					/>
					<Tabs
						defaultValue={openTab === "reading" ? "listening" : "overview"}
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
								aria-label={m["audiobook.tabs_label"]()}
								className={DETAIL_TAB_LIST_CLASSNAME}
							>
								<TabsTrigger
									value="overview"
									className={DETAIL_TAB_TRIGGER_CLASSNAME}
								>
									{m["audiobook.tab_overview"]()}
								</TabsTrigger>
								<TabsTrigger
									value="technical"
									className={DETAIL_TAB_TRIGGER_CLASSNAME}
								>
									{m["audiobook.tab_technical"]()}
								</TabsTrigger>
								{chapterCount > 0 && (
									<TabsTrigger
										value="chapters"
										className={DETAIL_TAB_TRIGGER_CLASSNAME}
									>
										{m["audiobook.tab_chapters"]()}
									</TabsTrigger>
								)}
								<TabsTrigger
									value="listening"
									className={DETAIL_TAB_TRIGGER_CLASSNAME}
								>
									{m.listening_title()}
								</TabsTrigger>
							</TabsList>
						</div>

						<TabsContent
							value="overview"
							className="pt-8 data-[state=active]:animate-none"
						>
							<AudiobookDetailsSection audiobook={audiobook} />
						</TabsContent>
						<TabsContent
							value="technical"
							className="pt-8 data-[state=active]:animate-none"
						>
							<TechnicalSection audiobook={audiobook} />
						</TabsContent>
						{chapterCount > 0 && (
							<TabsContent
								value="chapters"
								className="pt-8 data-[state=active]:animate-none"
							>
								<ChaptersSection audiobook={audiobook} />
							</TabsContent>
						)}
						<TabsContent value="listening" className="pt-8">
							<ReadingHistory
								bookUuid={audiobook.uuid}
								durationSeconds={audiobook.duration}
								chapters={audiobook.chapters ?? undefined}
								medium="listening"
							/>
						</TabsContent>
					</Tabs>

					{audiobook.series?.uuid && audiobook.series.name && (
						<SeriesAudiobooksSection
							seriesUuid={audiobook.series.uuid}
							seriesName={audiobook.series.name}
							currentAudiobookUuid={audiobook.uuid}
						/>
					)}
					<DetailDiscoverySections
						bookUuid={audiobook.uuid}
						authors={audiobook.authors}
						seriesUuid={audiobook.series?.uuid}
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
	title,
	authorName,
	asin,
}: {
	audiobook: AudiobookData;
	bookUuid: string;
	title: string;
	authorName?: string;
	asin?: string | null;
}) {
	const playAudiobook = usePlayAudiobook();
	const prefetchAudiobook = usePrefetchAudiobook();
	const isLoadingPlayback = useIsAudiobookLoading(bookUuid);
	const { can } = useAbilities();
	const canEnrich = can("book", "editMetadata");
	const canDownload = can("audiobook", "download");
	const router = useRouter();
	const [isMatchOpen, setIsMatchOpen] = useState(false);
	const [isEditOpen, setIsEditOpen] = useState(false);
	const [isDownloading, setIsDownloading] = useState(false);
	const restoreMutation = useMutation({
		mutationFn: () =>
			client.audiobooks.restoreOriginalMetadata({ uuid: bookUuid }),
		onSuccess: async (result) => {
			if (result.success) {
				toast.success(m["toast.metadata_restored"]());
				await router.invalidate();
			} else {
				toast.info(m["toast.metadata_none_original"]());
			}
		},
		onError: (error) =>
			toast.error(getErrorMessage(error, m["toast.metadata_restore_failed"]())),
	});

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

	const [isAddToListOpen, setIsAddToListOpen] = useState(false);

	const bookShelfQueryOptions = orpc.audiobookShelf.get.queryOptions({
		input: { bookUuid },
	});
	const bookShelfQuery = useQuery({
		...bookShelfQueryOptions,
		staleTime: 60_000,
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

	const moreMenuItems = (
		<>
			{canDownload && (
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
			)}
			{canEnrich && (
				<>
					{canDownload && <DropdownMenuSeparator />}
					<ReadListenManageMenuItem publicationUuid={bookUuid} title={title} />
					<DropdownMenuItem
						className="min-h-10"
						onClick={() => setIsEditOpen(true)}
					>
						<PencilSimple aria-hidden="true" />
						{m["book.edit_metadata"]()}
					</DropdownMenuItem>
					<DropdownMenuItem
						className="min-h-10"
						onClick={() => setIsMatchOpen(true)}
					>
						<Sparkle aria-hidden="true" />
						{m["match.action"]()}
					</DropdownMenuItem>
					<DropdownMenuItem
						className="min-h-10"
						onClick={() => restoreMutation.mutate()}
						disabled={restoreMutation.isPending}
					>
						{restoreMutation.isPending ? (
							<CircleNotch className="animate-spin motion-reduce:animate-none" />
						) : (
							<ArrowCounterClockwise />
						)}
						{m["book.restore_metadata"]()}
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
						<Button
							onClick={() => playAudiobook(bookUuid)}
							onPointerEnter={() => prefetchAudiobook(bookUuid)}
							onFocus={() => prefetchAudiobook(bookUuid)}
							disabled={isLoadingPlayback}
							aria-busy={isLoadingPlayback}
							{...HERO_PRIMARY_BUTTON}
						>
							{isLoadingPlayback ? (
								<CircleNotch
									aria-hidden="true"
									className="animate-spin motion-reduce:animate-none"
								/>
							) : (
								<Headphones aria-hidden="true" weight="bold" />
							)}
							<span>
								{isInProgress
									? m["audiobook.continue_listening"]()
									: m["audiobook.listen"]()}
							</span>
							{isInProgress && (
								<span className="shrink-0 tabular-nums opacity-70">
									· {listenPct}%
								</span>
							)}
						</Button>
						<ReadListenButton
							publicationUuid={bookUuid}
							mediaType="audiobook"
						/>
					</>
				}
				secondary={(() => {
					const activeOption = currentShelf
						? getShelfOptions("audiobook").find((o) => o.value === currentShelf)
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
					<>
						<Tooltip>
							<TooltipTrigger asChild>
								<Button
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
									{...HERO_ICON_BUTTON}
								>
									<Heart
										aria-hidden="true"
										ref={heartRef}
										weight={isLiked ? "fill" : "regular"}
										className="size-5"
									/>
								</Button>
							</TooltipTrigger>
							<TooltipContent>
								{isLiked
									? m["aria.remove_from_likes"]()
									: m["aria.add_to_likes"]()}
							</TooltipContent>
						</Tooltip>

						{(canDownload || canEnrich) && (
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
						)}
					</>
				}
			/>

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

			<AddToListModal
				bookUuid={bookUuid}
				mediaType="audiobook"
				open={isAddToListOpen}
				onOpenChange={setIsAddToListOpen}
				title={title}
				authorName={authorName}
				coverPath={audiobook.cover}
			/>
		</>
	);
}

function AudiobookDetailsSection({ audiobook }: { audiobook: AudiobookData }) {
	const publishedYear = audiobook.publishedDate?.match(/\d{4}/)?.[0] ?? null;

	const detailRows = [
		{
			label: m["audiobook.duration"](),
			value: formatDuration(audiobook.duration),
		},
		{
			label: m["audiobook.language"](),
			value: audiobook.languageCode?.toUpperCase() ?? null,
		},
		{
			label: m["book.publisher"](),
			value: audiobook.publisherName ?? null,
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
							<span className="sr-only">— {m["common.open_new_tab"]()}</span>
						</a>
					),
				}
			: null,
	].filter(Boolean) as DetailListRow[];

	return (
		<div className="space-y-10">
			{detailRows.length > 0 && (
				<DetailListSection
					columns={3}
					title={m["audiobook.section_details"]()}
					rows={detailRows}
				/>
			)}
			{identifierRows.length > 0 && (
				<DetailListSection
					columns={3}
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
		<div className="mt-14 sm:mt-16">
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
								"ring-2 ring-foreground/70 ring-inset",
						)}
					>
						<BookCard
							uuid={ab.uuid}
							title={ab.title}
							filename={ab.filename ?? ab.title}
							cover={ab.cover}
							tint={ab.mainColor}
							contextMenuEnabled={false}
							coverPreset={coverPresets.small}
							mediaType="audiobook"
							coverFrameRatio="square"
						/>
					</div>
				))}
			</ScrollSection>
		</div>
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
		<div className="space-y-10">
			{technicalRows.length > 0 && (
				<DetailListSection
					columns={3}
					title={m["audiobook.section_technical"]()}
					rows={technicalRows}
				/>
			)}
			{fileRows.length > 0 && (
				<DetailListSection
					columns={3}
					title={m["book.section_file_info"]()}
					rows={fileRows}
				/>
			)}
			<AudioFilesSection audiobook={audiobook} />
		</div>
	);
}

function AudioFilesSection({ audiobook }: { audiobook: AudiobookData }) {
	const headingId = useId();
	const { can } = useAbilities();
	const canDownload = can("audiobook", "download");
	const [downloadingIndex, setDownloadingIndex] = useState<number | null>(null);

	const files = audiobook.audioFiles ?? [];
	if (files.length === 0) return null;

	const handleDownload = async (fileIndex: number) => {
		if (downloadingIndex != null) return;
		try {
			setDownloadingIndex(fileIndex);
			const { url, filename } = await client.files.getAudioFileDownloadUrl({
				uuid: audiobook.uuid,
				fileIndex,
			});
			downloadFromUrl(url, filename);
		} catch (error) {
			toast.error(getErrorMessage(error, m["toast.download_failed"]()));
		} finally {
			setDownloadingIndex(null);
		}
	};

	return (
		<section className="min-w-0" aria-labelledby={headingId}>
			<h2
				id={headingId}
				className="mb-6 text-pretty font-bold text-xl leading-tight"
			>
				{m["audiobook.files"]()}
			</h2>
			<ol className="space-y-2">
				{files.map((file) => (
					<li
						key={file.index}
						className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 rounded-xl px-4 py-3 text-sm odd:bg-muted/25"
					>
						<span className="w-6 shrink-0 text-right text-muted-foreground text-xs tabular-nums">
							{file.index + 1}
						</span>
						<bdi className="min-w-0 break-all text-foreground">
							{file.filename}
						</bdi>
						<div className="col-start-2 flex flex-wrap items-center gap-x-2 text-muted-foreground text-xs tabular-nums">
							{file.duration > 0 && <span>{formatTime(file.duration)}</span>}
							{file.duration > 0 && file.filesize != null && (
								<span aria-hidden="true">·</span>
							)}
							{file.filesize != null && (
								<span>{formatFileSize(Math.round(file.filesize / 1024))}</span>
							)}
						</div>
						{canDownload && (
							<Button
								variant="ghost"
								size="icon"
								aria-label={m["aria.download_file_named"]({
									filename: file.filename,
								})}
								aria-busy={downloadingIndex === file.index}
								disabled={downloadingIndex != null}
								onClick={() => {
									void handleDownload(file.index);
								}}
								className="col-start-3 row-span-2 row-start-1 size-11 shrink-0 text-muted-foreground hover:text-foreground"
							>
								{downloadingIndex === file.index ? (
									<CircleNotch
										aria-hidden="true"
										className="animate-spin motion-reduce:animate-none"
									/>
								) : (
									<DownloadSimple aria-hidden="true" />
								)}
							</Button>
						)}
					</li>
				))}
			</ol>
		</section>
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
