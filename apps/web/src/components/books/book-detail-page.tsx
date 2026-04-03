import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useLoaderData } from "@tanstack/react-router";
import {
	BookOpen,
	Check,
	Clock,
	Download,
	Ellipsis,
	Heart,
	Loader2,
	RotateCcw,
	Sparkles,
	Tablet,
} from "lucide-react";
import { type ReactNode, useState } from "react";
import { toast } from "sonner";
import { AuthorLinkList } from "@/components/books/author-link-list";
import { BookCard } from "@/components/books/book-card";
import { BookCollectionsPanel } from "@/components/books/book-collections-panel";
import { SendToKindleDialog } from "@/components/books/send-to-kindle-dialog";
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
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { getBook } from "@/functions/books/get-book";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/utils";
import {
	coverPresets,
	getCoverPresetUrl,
	getCoverSrcSet,
	getCoverUrl,
} from "@/utils/covers";
import { formatDate, formatFileSize, getErrorMessage } from "@/utils/format";
import { client, orpc } from "@/utils/orpc";

type BookData = Awaited<ReturnType<typeof getBook>>;

const SHELF_OPTIONS: ShelfOption[] = [
	{ value: "want_to_read", label: "Want to read", icon: Heart },
	{ value: "reading", label: "Reading", icon: BookOpen },
	{ value: "backlog", label: "Backlog", icon: Clock },
	{ value: "completed", label: "Completed", icon: Check },
];

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

	return (
		<Tabs
			defaultValue="overview"
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
									aspectRatio="2/3"
									fallback={
										<div className="relative aspect-[2/3] w-full">
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

							<HeroActions bookUuid={book.uuid} accentColor={accentColor} />
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

							<div className="mt-3">
								<BookCollectionsPanel bookUuid={book.uuid} />
							</div>

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
									File & Metadata
								</TabsTrigger>
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
						<OverviewTab book={book} />
					</TabsContent>

					<TabsContent value="file" className="mt-0 text-sm">
						<FileAndMetadataTab book={book} />
					</TabsContent>
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

	const pct = Math.round(
		(progress.exploredCharCount / progress.bookCharCount) * 100,
	);

	return <CoverProgressBar percentage={pct} accentColor={accentColor} />;
}

type ShelfStatus = "want_to_read" | "backlog" | "reading" | "completed";

function useCanEnrich() {
	const { data: session } = authClient.useSession();
	const { data: org } = authClient.useActiveOrganization();

	if (!session) return false;
	if (session.user.role === "admin") return true;

	const myRole = org?.members?.find((m) => m.userId === session.user.id)?.role;
	return myRole === "admin" || myRole === "owner";
}

function HeroActions({
	bookUuid,
	accentColor,
}: {
	bookUuid: string;
	accentColor: string | null;
}) {
	const queryClient = useQueryClient();
	const canEnrich = useCanEnrich();
	const [isDownloading, setIsDownloading] = useState(false);
	const [isKindleDialogOpen, setIsKindleDialogOpen] = useState(false);

	// --- Shelf ---
	const bookShelfQueryOptions = orpc.bookShelf.get.queryOptions({
		input: { bookUuid },
	});
	const bookShelfQuery = useQuery({
		...bookShelfQueryOptions,
		staleTime: 60_000,
	});

	const setShelfMutation = useMutation({
		mutationFn: (status: ShelfStatus) =>
			client.bookShelf.set({ bookUuid, status }),
		onMutate: async (status) => {
			await queryClient.cancelQueries({
				queryKey: bookShelfQueryOptions.queryKey,
			});
			const previous = queryClient.getQueryData(bookShelfQueryOptions.queryKey);
			queryClient.setQueryData(
				bookShelfQueryOptions.queryKey,
				(old: typeof previous) => ({ ...old, status }),
			);
			return { previous };
		},
		onSuccess: async (result) => {
			queryClient.setQueryData(bookShelfQueryOptions.queryKey, result);
			const option = SHELF_OPTIONS.find((o) => o.value === result?.status);
			toast.success(option ? `Marked as "${option.label}"` : "List updated");
			await queryClient.invalidateQueries({
				queryKey: [["bookShelf", "getPublicShelf"]],
			});
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
		mutationFn: () => client.bookShelf.remove({ bookUuid }),
		onMutate: async () => {
			await queryClient.cancelQueries({
				queryKey: bookShelfQueryOptions.queryKey,
			});
			const previous = queryClient.getQueryData(bookShelfQueryOptions.queryKey);
			queryClient.setQueryData(bookShelfQueryOptions.queryKey, null);
			return { previous };
		},
		onSuccess: async () => {
			toast.success("Removed from list");
			await queryClient.invalidateQueries({
				queryKey: [["bookShelf", "getPublicShelf"]],
			});
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

	const currentShelf = bookShelfQuery.data?.status as ShelfStatus | undefined;

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
				result.liked ? "Added to Your Likes" : "Removed from Your Likes",
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
			toast.error(
				error instanceof Error ? error.message : "Failed to update like status",
			);
		},
	});
	const isLiked = likeStatusQuery.data?.liked ?? false;

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
			toast.error(
				error instanceof Error ? error.message : "Failed to download this book",
			);
		} finally {
			setIsDownloading(false);
		}
	};

	const enrichMutation = useMutation({
		mutationFn: () => client.books.enrichFromAmazon({ uuid: bookUuid }),
		onSuccess: async (result) => {
			if (result.success) {
				toast.success("Metadata enriched from Amazon");
				await queryClient.invalidateQueries({
					queryKey: orpc.books.getBookWithMetadata.queryOptions({
						input: { uuid: bookUuid },
					}).queryKey,
				});
			} else {
				toast.info("No additional metadata found on Amazon");
			}
		},
		onError: (error) => {
			toast.error(getErrorMessage(error, "Failed to fetch metadata"));
		},
	});

	const restoreMutation = useMutation({
		mutationFn: () => client.books.restoreOriginalMetadata({ uuid: bookUuid }),
		onSuccess: async (result) => {
			if (result.success) {
				toast.success("Metadata restored to original");
				await queryClient.invalidateQueries({
					queryKey: orpc.books.getBookWithMetadata.queryOptions({
						input: { uuid: bookUuid },
					}).queryKey,
				});
			} else {
				toast.info("No original metadata available");
			}
		},
		onError: (error) => {
			toast.error(getErrorMessage(error, "Failed to restore metadata"));
		},
	});

	const isMetadataBusy = enrichMutation.isPending || restoreMutation.isPending;

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
					<Link to="/reader/$uuid" params={{ uuid: bookUuid }}>
						<BookOpen className="size-3.5" />
						Read
					</Link>
				</Button>
				<Button
					variant="outline"
					size="icon"
					aria-label={isLiked ? "Remove from likes" : "Add to likes"}
					aria-pressed={isLiked}
					onClick={() => toggleLikeMutation.mutate()}
					disabled={toggleLikeMutation.isPending || likeStatusQuery.isLoading}
					className={cn(
						"size-11 rounded-md",
						isLiked
							? "!border-transparent !bg-destructive/75 !text-white hover:!bg-destructive/65"
							: "border-border bg-muted text-[var(--book-hero-text)] hover:bg-accent hover:text-[var(--book-hero-text)]",
					)}
				>
					<Heart className={cn("size-4", isLiked && "fill-current")} />
				</Button>
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button
							variant="outline"
							size="icon"
							aria-label="More actions"
							className="size-11 rounded-md border-border bg-muted text-[var(--book-hero-text)] hover:bg-accent hover:text-[var(--book-hero-text)]"
						>
							<Ellipsis className="size-4" />
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end" sideOffset={6}>
						<DropdownMenuItem onClick={handleDownload} disabled={isDownloading}>
							{isDownloading ? (
								<Loader2 className="size-4 animate-spin" />
							) : (
								<Download className="size-4" />
							)}
							Download
						</DropdownMenuItem>
						<DropdownMenuItem onClick={() => setIsKindleDialogOpen(true)}>
							<Tablet className="size-4" />
							Send to Kindle
						</DropdownMenuItem>
						{canEnrich && (
							<>
								<DropdownMenuSeparator />
								<DropdownMenuItem
									onClick={() => enrichMutation.mutate()}
									disabled={isMetadataBusy}
								>
									{enrichMutation.isPending ? (
										<Loader2 className="size-4 animate-spin" />
									) : (
										<Sparkles className="size-4" />
									)}
									Enrich metadata
								</DropdownMenuItem>
								<DropdownMenuItem
									onClick={() => restoreMutation.mutate()}
									disabled={isMetadataBusy}
								>
									{restoreMutation.isPending ? (
										<Loader2 className="size-4 animate-spin" />
									) : (
										<RotateCcw className="size-4" />
									)}
									Restore metadata
								</DropdownMenuItem>
							</>
						)}
					</DropdownMenuContent>
				</DropdownMenu>
			</div>

			<ShelfDropdown
				options={SHELF_OPTIONS}
				currentStatus={currentShelf}
				onSelect={(status) => setShelfMutation.mutate(status as ShelfStatus)}
				onRemove={() => removeShelfMutation.mutate()}
			/>

			<SendToKindleDialog
				bookUuid={bookUuid}
				open={isKindleDialogOpen}
				onOpenChange={setIsKindleDialogOpen}
			/>
		</>
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

function BookDetailsSection({ book }: { book: BookData }) {
	const characterCount = book.amountChars
		? new Intl.NumberFormat().format(book.amountChars)
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
		{ label: "Format", value: book.mediaType?.toUpperCase() ?? null },
		{ label: "Pages", value: book.pageCount ? String(book.pageCount) : null },
		{
			label: "Characters",
			value: characterCount ? `${characterCount}` : null,
		},
		{ label: "Language", value: book.languageCode?.toUpperCase() ?? null },
		{ label: "Authors", value: authorDetailLinks ?? null },
		{ label: "Publisher", value: book.publisher?.name ?? null },
		{
			label: "Series",
			value: book.series?.name ? (
				<Link
					to="/dashboard/series/$seriesName"
					params={{ seriesName: book.series.name }}
					className="underline decoration-muted-foreground/40 underline-offset-2 transition-colors hover:text-foreground hover:decoration-foreground/60"
				>
					{book.series.name}
				</Link>
			) : null,
		},
		{
			label: "Series Position",
			value:
				book.series?.position != null ? String(book.series.position) : null,
		},
		{ label: "Year", value: publishedYear },
		{ label: "Published", value: formatDate(book.publishedDate) },
		{
			label: "Genres",
			value: book.genres?.length ? book.genres.join(", ") : null,
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
		<ScrollSection
			title={seriesName}
			showAllHref={`/dashboard/series/${encodeURIComponent(seriesName)}`}
		>
			{books.map((b) => (
				<div
					key={b.uuid}
					className={cn(
						"w-[120px] shrink-0 rounded-lg md:w-[140px]",
						b.uuid === currentBookUuid &&
							"ring-2 ring-[var(--book-accent)] ring-inset",
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

function FileAndMetadataTab({ book }: { book: BookData }) {
	const fileSize = formatFileSize(book.filesizeKb);

	const fileRows = [
		{ label: "Filename", value: book.filename, valueClassName: "break-all" },
		fileSize ? { label: "Size", value: fileSize } : null,
		book.createdAt
			? { label: "Added", value: formatDate(book.createdAt) }
			: null,
		book.lastModified
			? { label: "Modified", value: formatDate(book.lastModified) }
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

					return { label, value: display };
				})
				.filter(Boolean) as DetailListRow[])
		: [];

	return (
		<div className="space-y-6">
			{fileRows.length > 0 && (
				<DetailListSection title="File Information" rows={fileRows} />
			)}
			{isLoading ? (
				<div className="space-y-3">
					<Skeleton className="h-4 w-32" />
					<Skeleton className="h-4 w-64" />
					<Skeleton className="h-4 w-48" />
				</div>
			) : (
				originalRows.length > 0 && (
					<DetailListSection
						title="Original EPUB Metadata"
						rows={originalRows}
					/>
				)
			)}
		</div>
	);
}
