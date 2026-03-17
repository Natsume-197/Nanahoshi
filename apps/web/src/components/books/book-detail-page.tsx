import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useLoaderData } from "@tanstack/react-router";
import { BookOpen, Download, Heart, Loader2, X } from "lucide-react";
import {
	type CSSProperties,
	lazy,
	type ReactNode,
	Suspense,
	useState,
} from "react";
import { toast } from "sonner";
import { BookCard } from "@/components/books/book-card";
import { AuthorLinkList } from "@/components/books/author-link-list";
import { ScrollSection } from "@/components/shared/scroll-section";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { getBook } from "@/functions/books/get-book";
import { cn } from "@/lib/utils";
import {
	coverPresets,
	getCoverPresetUrl,
	getCoverFilename,
	getCoverSrcSet,
	getCoverUrl,
} from "@/utils/covers";
import { formatDate } from "@/utils/format";
import { client, orpc } from "@/utils/orpc";

const BookSidebarActions = lazy(async () => {
	const module = await import("@/components/books/book-sidebar-actions");
	return { default: module.BookSidebarActions };
});

function formatFileSize(filesizeKb?: number | null) {
	if (!filesizeKb) return null;
	return filesizeKb >= 1024
		? `${(filesizeKb / 1024).toFixed(1)} MB`
		: `${filesizeKb} KB`;
}

type BookData = Awaited<ReturnType<typeof getBook>>;

function getAccentForegroundColor(accentColor: string) {
	const normalizedHex = accentColor.trim();
	const shortHexMatch = /^#([\da-f]{3})$/i.exec(normalizedHex);
	const longHexMatch = /^#([\da-f]{6})$/i.exec(normalizedHex);

	const resolvedHex = shortHexMatch
		? shortHexMatch[1]
				.split("")
				.map((part) => `${part}${part}`)
				.join("")
		: longHexMatch?.[1];

	if (!resolvedHex) {
		return "oklch(0.97 0.01 80)";
	}

	const channels = resolvedHex.match(/.{2}/g);
	if (!channels || channels.length !== 3) {
		return "oklch(0.97 0.01 80)";
	}

	const [r, g, b] = channels.map((value) => Number.parseInt(value, 16) / 255);
	const [linearR, linearG, linearB] = [r, g, b].map((channel) =>
		channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
	);
	const luminance = 0.2126 * linearR + 0.7152 * linearG + 0.0722 * linearB;

	return luminance > 0.45 ? "oklch(0.2 0.012 55)" : "oklch(0.97 0.01 80)";
}

export function BookDetailPage() {
	const { book } = useLoaderData({ from: "/dashboard/books/$uuid" });

	const title = book.title ?? book.filename;
	const coverFilename = book.cover?.split("/").pop();
	const coverUrl = coverFilename
		? getCoverPresetUrl(coverFilename, coverPresets.detail)
		: null;
	const coverSrcSet = coverFilename
		? getCoverSrcSet(coverFilename, coverPresets.detail.widths)
		: undefined;

	const bannerUrl = coverUrl;
	const bannerSrcSet = coverSrcSet;

	const coverPreviewUrl = coverFilename
		? getCoverUrl(coverFilename, 1200)
		: null;
	const coverPreviewSrcSet = coverFilename
		? getCoverSrcSet(coverFilename, [420, 560, 720, 960, 1200])
		: undefined;
	const authorText = book.authors?.map((a) => a.name).join(", ");
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
	const [isCoverPreviewOpen, setIsCoverPreviewOpen] = useState(false);
	const heroStyle = {
		"--book-accent": accentColor ?? "oklch(0.67 0.16 38)",
		"--book-accent-foreground": accentColor
			? getAccentForegroundColor(accentColor)
			: "oklch(0.97 0.01 80)",
		"--book-hero-text": "var(--card-foreground)",
		"--book-hero-muted":
			"color-mix(in oklch, var(--card-foreground) 72%, var(--card) 28%)",
	} as CSSProperties;

	return (
		<Tabs
			defaultValue="overview"
			className="relative min-h-full gap-0 overflow-hidden pb-16"
			style={heroStyle}
		>
			{accentColor && (
				<div
					className="pointer-events-none absolute inset-0 z-0"
					style={{
						background: `linear-gradient(145deg, ${accentColor}30 0%, ${accentColor}18 30%, ${accentColor}0D 60%, transparent 100%)`,
					}}
				/>
			)}
			<section className="relative z-[1] overflow-hidden">
				<div
					className="relative h-[180px] w-full overflow-hidden md:h-[240px]"
					style={{
						maskImage: "linear-gradient(to bottom, black 5%, transparent 100%)",
						WebkitMaskImage:
							"linear-gradient(to bottom, black 5%, transparent 100%)",
					}}
				>
					{bannerUrl ? (
						<img
							src={bannerUrl}
							srcSet={bannerSrcSet}
							sizes={coverPresets.detail.sizes}
							alt=""
							className="h-full w-full scale-125 object-cover opacity-0 blur-md brightness-[0.66] saturate-[0.84] transition-opacity duration-700 ease-out"
							onLoad={(e) => {
								e.currentTarget.classList.replace("opacity-0", "opacity-95");
							}}
							ref={(el) => {
								if (el?.complete)
									el.classList.replace("opacity-0", "opacity-95");
							}}
						/>
					) : (
						<div
							className="h-full w-full"
							style={{
								background: accentColor
									? `linear-gradient(135deg, ${accentColor}88, ${accentColor}1A)`
									: "linear-gradient(135deg, oklch(0.34 0.08 255), oklch(0.2 0.03 255))",
							}}
						/>
					)}
				</div>

				<div className="px-4 pb-7 md:px-12 md:pb-8">
					<div className="mx-auto grid max-w-[110rem] gap-x-8 gap-y-4 md:grid-cols-[14.5rem_minmax(0,1fr)] xl:grid-cols-[16rem_minmax(0,1fr)]">
						<div className="mx-auto -mt-16 md:row-span-2 md:mx-0 md:-mt-20">
							<div className="w-full">
								{coverUrl ? (
									<button
										type="button"
										onClick={() => setIsCoverPreviewOpen(true)}
										aria-label={`View larger cover for ${title}`}
										className="group block w-full cursor-zoom-in rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
									>
										<div
											className="relative overflow-hidden rounded-md shadow-xl"
											style={{
												boxShadow: accentColor
													? `0 18px 38px -18px ${accentColor}44`
													: undefined,
											}}
										>
											<img
												src={coverUrl}
												srcSet={coverSrcSet}
												sizes={coverPresets.detail.sizes}
												alt={title}
												className="aspect-[2/3] w-full object-cover opacity-0 transition-opacity duration-500 ease-out"
												loading="eager"
												decoding="async"
												fetchPriority="high"
												onLoad={(e) => {
													e.currentTarget.classList.remove("opacity-0");
												}}
												ref={(el) => {
													if (el?.complete) el.classList.remove("opacity-0");
												}}
											/>
											<div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-transparent opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-visible:opacity-100" />
											<DetailCoverProgress
												bookUuid={book.uuid}
												accentColor={accentColor}
											/>
										</div>
									</button>
								) : (
									<div
										className="relative overflow-hidden rounded-md shadow-xl"
										style={{
											boxShadow: accentColor
												? `0 18px 38px -18px ${accentColor}44`
												: undefined,
										}}
									>
										<div
											className="relative aspect-[2/3] w-full"
											style={{
												background: accentColor
													? `linear-gradient(145deg, ${accentColor}CC, ${accentColor}33)`
													: undefined,
											}}
										>
											<div
												className={cn(
													"absolute inset-0",
													!accentColor && "bg-muted/30",
												)}
											/>
											<div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.12),transparent_60%)]" />
											<BookOpen
												className="absolute top-1/3 left-1/2 size-12 -translate-x-1/2 -translate-y-1/2 text-white/20"
												strokeWidth={1}
											/>
											<div className="absolute inset-x-0 bottom-0 space-y-1 bg-gradient-to-t from-black/65 to-transparent px-4 pt-10 pb-4">
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
									</div>
								)}
							</div>

							<HeroActions bookUuid={book.uuid} accentColor={accentColor} />
						</div>

						<div className="mx-auto w-full pt-3 text-left md:mx-0 md:pt-4">
							<h1 className="pt-2 font-bold text-2xl text-[var(--book-hero-text)] leading-[0.98] tracking-tight md:text-3xl lg:text-4xl">
								{title}
							</h1>

							{authorText && (
								<p className="mt-3 text-[var(--book-hero-muted)] text-sm md:text-base">
									{authorLinks}
								</p>
							)}

							<SynopsisSection description={book.description} />
						</div>

						<div className="border-border/35 pt-2 md:self-end md:border-t md:pt-3">
							<TabsList
								variant="line"
								className="h-auto gap-4 p-0 text-[var(--book-hero-muted)]"
							>
								<TabsTrigger
									value="overview"
									className="after:!bg-[var(--book-accent)] px-0 py-1.5 text-[var(--book-hero-muted)] text-sm transition-colors after:transition-none hover:text-[var(--book-hero-text)] data-active:text-[var(--book-hero-text)] dark:text-[var(--book-hero-muted)]"
								>
									Overview
								</TabsTrigger>
								<TabsTrigger
									value="file"
									className="after:!bg-[var(--book-accent)] px-0 py-1.5 text-[var(--book-hero-muted)] text-sm transition-colors after:transition-none hover:text-[var(--book-hero-text)] data-active:text-[var(--book-hero-text)] dark:text-[var(--book-hero-muted)]"
								>
									File
								</TabsTrigger>
								<TabsTrigger
									value="original"
									className="after:!bg-[var(--book-accent)] px-0 py-1.5 text-[var(--book-hero-muted)] text-sm transition-colors after:transition-none hover:text-[var(--book-hero-text)] data-active:text-[var(--book-hero-text)] dark:text-[var(--book-hero-muted)]"
								>
									Original
								</TabsTrigger>
							</TabsList>
						</div>
					</div>
				</div>
			</section>

			{coverPreviewUrl && (
				<Dialog open={isCoverPreviewOpen} onOpenChange={setIsCoverPreviewOpen}>
					<DialogContent
						showCloseButton={false}
						className="max-w-[min(92vw,48rem)] gap-0 rounded-2xl border-0 bg-transparent p-0 shadow-none ring-0 sm:max-w-[min(92vw,48rem)]"
					>
						<DialogTitle className="sr-only">{title} cover</DialogTitle>
						<DialogDescription className="sr-only">
							Large cover preview for this book.
						</DialogDescription>
						<div className="relative mx-auto">
							<img
								src={coverPreviewUrl}
								srcSet={coverPreviewSrcSet}
								sizes="(max-width: 768px) 92vw, 48rem"
								alt={title}
								className="max-h-[88vh] w-auto max-w-full rounded-xl object-contain shadow-2xl"
								decoding="async"
							/>
							<DialogClose
								render={
									<Button
										variant="secondary"
										size="icon-sm"
										className="absolute top-3 right-3 rounded-full border-0 bg-black/65 text-white hover:bg-black/80 hover:text-white"
									/>
								}
							>
								<X className="size-4" />
								<span className="sr-only">Close cover preview</span>
							</DialogClose>
						</div>
					</DialogContent>
				</Dialog>
			)}

			<div className="relative z-[1] px-4 pt-6 md:px-12 md:pt-7">
				<div className="mx-auto grid max-w-[110rem] gap-8 md:grid-cols-[14.5rem_minmax(0,1fr)] xl:grid-cols-[16rem_minmax(0,1fr)]">
					<aside className="w-full md:sticky md:top-20 md:self-start">
						<div className="space-y-4 rounded-2xl">
							<Suspense
								fallback={<Skeleton className="h-20 rounded-md bg-muted/25" />}
							>
								<BookSidebarActions bookUuid={book.uuid} />
							</Suspense>
						</div>
					</aside>

					<div className="min-w-0">
						<TabsContent value="overview" className="mt-0 text-sm">
							<OverviewTab book={book} />
						</TabsContent>

						<TabsContent value="file" className="mt-0 text-sm">
							<FileTab book={book} />
						</TabsContent>

						<TabsContent value="original" className="mt-0 text-sm">
							<OriginalMetadataTab bookUuid={book.uuid} />
						</TabsContent>
					</div>
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
		orpc.readingProgress.getProgress.queryOptions({
			input: { bookUuid },
		}),
	);

	const progress = progressQuery.data;
	if (
		!progress ||
		!progress.bookCharCount ||
		progress.exploredCharCount == null
	) {
		return null;
	}

	const pct = Math.min(
		100,
		Math.round((progress.exploredCharCount / progress.bookCharCount) * 100),
	);

	if (pct === 0) return null;

	return (
		<div className="absolute inset-x-0 bottom-0 h-1 bg-black/30">
			<div
				className="h-full transition-all"
				style={{
					width: `${pct}%`,
					backgroundColor: accentColor ?? "var(--primary)",
				}}
			/>
		</div>
	);
}

function HeroActions({
	bookUuid,
	accentColor,
}: {
	bookUuid: string;
	accentColor: string | null;
}) {
	const queryClient = useQueryClient();
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
			toast.error(
				error instanceof Error ? error.message : "Failed to download this book",
			);
		} finally {
			setIsDownloading(false);
		}
	};

	const likeStatusQueryOptions = orpc.likedBooks.getLikeStatus.queryOptions({
		input: { bookUuid },
	});
	const likeStatusQuery = useQuery(likeStatusQueryOptions);
	const toggleLikeMutation = useMutation({
		mutationFn: () => client.likedBooks.toggleLike({ bookUuid }),
		onSuccess: async (result) => {
			queryClient.setQueryData(likeStatusQueryOptions.queryKey, result);
			toast.success(
				result.liked ? "Added to Your Likes" : "Removed from Your Likes",
			);
			await queryClient.invalidateQueries({
				queryKey: [["likedBooks", "listLiked"]],
			});
		},
		onError: (error) => {
			toast.error(
				error instanceof Error ? error.message : "Failed to update like status",
			);
		},
	});
	const isLiked = likeStatusQuery.data?.liked ?? false;

	return (
		<div className="mt-3 flex items-center gap-2">
			<Button
				render={
					<Link to="/dashboard/books/$uuid/read" params={{ uuid: bookUuid }} />
				}
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
				<BookOpen className="size-3.5" />
				Read
			</Button>
			<Button
				onClick={handleDownload}
				variant="outline"
				size="icon"
				aria-label={isDownloading ? "Downloading book" : "Download book"}
				className="size-11 rounded-md border-border bg-muted text-[var(--book-hero-text)] hover:bg-accent hover:text-[var(--book-hero-text)]"
				disabled={isDownloading}
			>
				{isDownloading ? (
					<Loader2 className="size-4 animate-spin" />
				) : (
					<Download className="size-4" />
				)}
			</Button>
			<button
				type="button"
				aria-label={isLiked ? "Remove from likes" : "Add to likes"}
				aria-pressed={isLiked}
				onClick={() => toggleLikeMutation.mutate()}
				disabled={toggleLikeMutation.isPending || likeStatusQuery.isLoading}
				className={cn(
					"flex size-11 items-center justify-center rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
					isLiked
						? "bg-destructive/20 text-destructive"
						: "border border-border bg-muted text-[var(--book-hero-text)] hover:bg-accent",
				)}
			>
				<Heart className={cn("size-4", isLiked && "fill-current")} />
			</button>
		</div>
	);
}

function SynopsisSection({ description }: { description?: string | null }) {
	const [expanded, setExpanded] = useState(false);

	if (!description) return null;

	return (
		<div className="relative mt-3">
			<p
				className={cn(
					"max-w-[68ch] text-[var(--book-hero-muted)] text-sm leading-relaxed transition-all",
					!expanded && "line-clamp-3 md:line-clamp-4",
				)}
			>
				{description}
			</p>
			{description.length > 200 && (
				<button
					type="button"
					onClick={() => setExpanded(!expanded)}
					className="mt-1 font-medium text-[var(--book-hero-text)] text-xs hover:underline"
				>
					{expanded ? "Show less" : "Read more"}
				</button>
			)}
		</div>
	);
}

function OverviewTab({ book }: { book: BookData }) {
	return (
		<div className="space-y-8">
			<BookDetailsSection book={book} />
			{book.series?.name && (
				<SeriesBooksSection
					seriesName={book.series.name}
					currentBookUuid={book.uuid}
				/>
			)}
		</div>
	);
}

type DetailListRow = {
	key?: string;
	label: string;
	value: ReactNode;
	valueClassName?: string;
};

function DetailListSection({
	title,
	rows,
}: {
	title: string;
	rows: DetailListRow[];
}) {
	if (rows.length === 0) return null;

	return (
		<section className="space-y-4">
			<h3 className="font-semibold text-foreground text-sm">{title}</h3>
			<dl className="space-y-0">
				{rows.map((row) => (
					<div
						key={row.key ?? row.label}
						className="grid grid-cols-[112px_minmax(0,1fr)] gap-3 border-border/10 border-b py-2.5 last:border-0 md:grid-cols-[140px_minmax(0,1fr)]"
					>
						<dt className="font-medium text-[11px] text-muted-foreground uppercase tracking-wide">
							{row.label}
						</dt>
						<dd
							className={cn(
								"min-w-0 break-words text-foreground text-sm",
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
		? new Intl.NumberFormat().format(book.amountChars)
		: null;
	const publishedYear = book.publishedDate?.match(/\d{4}/)?.[0] ?? null;
	const authorDetailLinks = book.authors?.length ? (
		<AuthorLinkList authors={book.authors} withRole />
	) : null;

	const detailRows = [
		{ label: "Format", value: book.mediaType?.toUpperCase() ?? null },
		{ label: "Pages", value: book.pageCount ? String(book.pageCount) : null },
		{
			label: "Characters",
			value: characterCount ? `${characterCount}` : null,
		},
		{ label: "Language", value: book.languageCode?.toUpperCase() ?? null },
		{ label: "Authors", value: authorDetailLinks ?? null },
		{ label: "Publisher", value: book.publisher?.name ?? null },
		{ label: "Series", value: book.series?.name ?? null },
		{
			label: "Series Position",
			value:
				book.series?.position != null ? String(book.series.position) : null,
		},
		{ label: "Year", value: publishedYear },
		{ label: "Published", value: formatDate(book.publishedDate) },
		{
			label: "Genres",
			value:
				book.genres?.length ? book.genres.join(", ") : null,
		},
	].filter((row): row is DetailListRow => Boolean(row.value));

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
		<div className="space-y-6">
			{detailRows.length > 0 && (
				<DetailListSection title="Book Details" rows={detailRows} />
			)}

			{identifierRows.length > 0 && (
				<DetailListSection title="Identifiers" rows={identifierRows} />
			)}
		</div>
	);
}

function SeriesBooksSection({
	seriesName,
	currentBookUuid,
}: {
	seriesName: string;
	currentBookUuid: string;
}) {
	const seriesBooksQuery = useQuery(
		orpc.books.listBySeries.queryOptions({
			input: { seriesName },
		}),
	);

	const books = seriesBooksQuery.data;

	if (!books || books.length <= 1) return null;

	return (
		<ScrollSection title={`Series: ${seriesName}`}>
			{books.map((b) => (
				<div
					key={b.uuid}
					className={cn(
						"w-[120px] shrink-0 rounded-lg md:w-[140px]",
						b.uuid === currentBookUuid &&
							"ring-2 ring-[var(--book-accent)]",
					)}
				>
					<BookCard
						uuid={b.uuid}
						title={b.title}
						filename={b.filename ?? b.title}
						cover={b.cover}
						contextMenuEnabled={false}
						coverPreset={coverPresets.small}
					/>
				</div>
			))}
		</ScrollSection>
	);
}

function FileTab({ book }: { book: BookData }) {
	const fileSize = formatFileSize(book.filesizeKb);

	const rows = [
		{ label: "Filename", value: book.filename, valueClassName: "break-all" },
		fileSize ? { label: "Size", value: fileSize } : null,
		book.createdAt
			? { label: "Added", value: formatDate(book.createdAt) }
			: null,
		book.lastModified
			? { label: "Modified", value: formatDate(book.lastModified) }
			: null,
	].filter(Boolean) as DetailListRow[];

	if (rows.length === 0) return null;

	return <DetailListSection title="File Information" rows={rows} />;
}

const ORIGINAL_METADATA_LABELS: Record<string, string> = {
	title: "Title",
	subtitle: "Subtitle",
	description: "Description",
	authors: "Authors",
	publisher: "Publisher",
	publishedDate: "Published Date",
	languageCode: "Language",
	pageCount: "Page Count",
	isbn10: "ISBN-10",
	isbn13: "ISBN-13",
	asin: "ASIN",
	amountChars: "Characters",
};

function OriginalMetadataTab({ bookUuid }: { bookUuid: string }) {
	const { data, isLoading } = useQuery({
		...orpc.books.getOriginalMetadata.queryOptions({
			input: { uuid: bookUuid },
		}),
		staleTime: 60_000,
	});

	if (isLoading) {
		return (
			<div className="space-y-3">
				<Skeleton className="h-4 w-32" />
				<Skeleton className="h-4 w-64" />
				<Skeleton className="h-4 w-48" />
			</div>
		);
	}

	if (!data) {
		return (
			<p className="py-4 text-muted-foreground text-sm">
				No original metadata available for this book.
			</p>
		);
	}

	const metadata = data as Record<string, unknown>;

	const rows: DetailListRow[] = Object.entries(ORIGINAL_METADATA_LABELS)
		.map(([key, label]) => {
			const value = metadata[key];
			if (value === undefined || value === null || value === "") return null;

			let display: ReactNode;
			if (key === "authors" && Array.isArray(value)) {
				display = value
					.map((a) =>
						typeof a === "object" && a !== null ? (a as { name: string }).name : String(a),
					)
					.join(", ");
			} else if (key === "publisher" && typeof value === "object" && value !== null) {
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

			return { label, value: display };
		})
		.filter(Boolean) as DetailListRow[];

	return <DetailListSection title="Original EPUB Metadata" rows={rows} />;
}
