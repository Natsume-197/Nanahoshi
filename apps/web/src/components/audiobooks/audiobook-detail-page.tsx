import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useLoaderData } from "@tanstack/react-router";
import { Check, Clock, Headphones, Heart } from "lucide-react";
import { Fragment, useState } from "react";
import { toast } from "sonner";
import { AuthorLinkList } from "@/components/books/author-link-list";
import {
	CoverImage,
	CoverPreviewDialog,
	CoverProgressBar,
	getHeroStyle,
	ShelfDropdown,
	type ShelfOption,
} from "@/components/shared/detail-page";
import {
	type DetailListRow,
	DetailListSection,
	SynopsisSection,
} from "@/components/shared/synopsis-section";
import { Button } from "@/components/ui/button";
import type { getAudiobook } from "@/functions/books/get-audiobook";
import { cn } from "@/lib/utils";
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

function formatDuration(seconds: number | null): string | null {
	if (!seconds) return null;
	return formatReadingTime(seconds);
}

function formatBitrate(kbps: number | null): string | null {
	if (!kbps) return null;
	return `${kbps} kbps`;
}

type ShelfStatus = "want_to_listen" | "listening" | "backlog" | "completed";

const SHELF_OPTIONS: ShelfOption[] = [
	{ value: "want_to_listen", label: "Want to listen", icon: Heart },
	{ value: "listening", label: "Listening", icon: Headphones },
	{ value: "backlog", label: "Backlog", icon: Clock },
	{ value: "completed", label: "Completed", icon: Check },
];

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
	const [isCoverPreviewOpen, setIsCoverPreviewOpen] = useState(false);

	return (
		<div
			className="relative min-h-full gap-0 overflow-hidden pb-16"
			style={getHeroStyle(accentColor)}
		>
			<section className="relative overflow-hidden">
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
												strokeWidth={1}
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
									Narrated by {narratorLinks}
								</p>
							)}

							<SynopsisSection description={audiobook.description} />
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
					<AudiobookDetailsSection audiobook={audiobook} />
				</div>
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
}: {
	bookUuid: string;
	accentColor: string | null;
}) {
	const queryClient = useQueryClient();

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
			const option = SHELF_OPTIONS.find((o) => o.value === result?.status);
			toast.success(option ? `Marked as "${option.label}"` : "List updated");
		},
		onError: (error, _variables, context) => {
			if (context?.previous !== undefined) {
				queryClient.setQueryData(
					bookShelfQueryOptions.queryKey,
					context.previous,
				);
			}
			toast.error(getErrorMessage(error, "Failed to update list"));
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
			toast.success("Removed from list");
		},
		onError: (error, _variables, context) => {
			if (context?.previous !== undefined) {
				queryClient.setQueryData(
					bookShelfQueryOptions.queryKey,
					context.previous,
				);
			}
			toast.error(getErrorMessage(error, "Failed to remove from list"));
		},
	});

	const currentShelf = bookShelfQuery.data?.status as string | undefined;

	return (
		<>
			<div className="mt-3 flex items-center gap-2">
				<Button
					asChild
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
					<Link to="/player/$uuid" params={{ uuid: bookUuid }}>
						<Headphones className="size-3.5" />
						Listen
					</Link>
				</Button>
			</div>

			<ShelfDropdown
				options={SHELF_OPTIONS}
				currentStatus={currentShelf}
				onSelect={(status) => setShelfMutation.mutate(status as ShelfStatus)}
				onRemove={() => removeShelfMutation.mutate()}
			/>
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
		{ label: "Duration", value: formatDuration(audiobook.duration) },
		{ label: "Authors", value: authorDetailLinks ?? null },
		{ label: "Narrators", value: narratorDetailLinks ?? null },
		{ label: "Language", value: audiobook.languageCode?.toUpperCase() ?? null },
		{ label: "Series", value: audiobook.series?.name ?? null },
		{
			label: "Series Position",
			value:
				audiobook.series?.position != null
					? String(audiobook.series.position)
					: null,
		},
		{ label: "Year", value: publishedYear },
		{ label: "Published", value: formatDate(audiobook.publishedDate) },
	].filter((row) => Boolean(row.value));

	const technicalRows = [
		{ label: "Codec", value: audiobook.codec?.toUpperCase() ?? null },
		{ label: "Bitrate", value: formatBitrate(audiobook.bitRate) },
		{
			label: "Sample Rate",
			value: audiobook.sampleRate ? `${audiobook.sampleRate} Hz` : null,
		},
		{
			label: "Channels",
			value: audiobook.channels
				? audiobook.channels === 1
					? "Mono"
					: audiobook.channels === 2
						? "Stereo"
						: String(audiobook.channels)
				: null,
		},
		{
			label: "Files",
			value: audiobook.audioFiles?.length
				? `${audiobook.audioFiles.length} file${audiobook.audioFiles.length > 1 ? "s" : ""}`
				: null,
		},
		{ label: "Size", value: formatFileSize(audiobook.filesizeKb) },
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
		<div className="space-y-6 text-sm">
			{detailRows.length > 0 && (
				<DetailListSection title="Audiobook Details" rows={detailRows} />
			)}
			{technicalRows.length > 0 && (
				<DetailListSection title="Technical Info" rows={technicalRows} />
			)}
			{identifierRows.length > 0 && (
				<DetailListSection title="Identifiers" rows={identifierRows} />
			)}
		</div>
	);
}

function NarratorLinkList({
	narrators,
	linkClassName,
	separatorClassName,
}: {
	narrators: { id: number; name: string }[];
	linkClassName?: string;
	separatorClassName?: string;
}) {
	return (
		<span className="inline-flex flex-wrap items-center gap-x-1">
			{narrators.map((narrator, index) => (
				<Fragment key={narrator.id}>
					{index > 0 && (
						<span
							className={cn("text-muted-foreground/70", separatorClassName)}
						>
							,
						</span>
					)}
					<Link
						to="/dashboard/narrators/$narratorId"
						params={{ narratorId: String(narrator.id) }}
						className={cn(
							"hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
							linkClassName,
						)}
					>
						{narrator.name}
					</Link>
				</Fragment>
			))}
		</span>
	);
}
