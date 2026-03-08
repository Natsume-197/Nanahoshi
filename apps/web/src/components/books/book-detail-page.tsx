import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useLoaderData } from "@tanstack/react-router";
import { ArrowLeft, BookOpen, Download, Heart } from "lucide-react";
import { lazy, Suspense, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { getBook } from "@/functions/books/get-book";
import { cn } from "@/lib/utils";
import {
	coverPresets,
	getCoverPresetUrl,
	getCoverSrcSet,
} from "@/utils/covers";
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

function formatDate(value?: string | null) {
	if (!value) return null;
	const parsed = new Date(value);
	if (Number.isNaN(parsed.getTime())) return value;
	return parsed.toLocaleDateString();
}

function formatReadingTime(seconds: number) {
	const hours = Math.floor(seconds / 3600);
	const minutes = Math.floor((seconds % 3600) / 60);
	if (hours > 0) return `${hours}h ${minutes}m`;
	return `${minutes}m`;
}

type BookData = Awaited<ReturnType<typeof getBook>>;

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
	const bannerUrl = coverFilename
		? getCoverPresetUrl(coverFilename, coverPresets.banner)
		: null;
	const authorText = book.authors?.map((a) => a.name).join(", ");
	const accentColor = book.mainColor ?? null;

	return (
		<div
			className="relative min-h-full pb-24"
			style={
				accentColor
					? ({ "--book-accent": accentColor } as React.CSSProperties)
					: undefined
			}
		>
			{/* Banner */}
			<div className="relative">
				<div className="h-[200px] w-full overflow-hidden md:h-[280px]">
					{bannerUrl ? (
						<img
							src={bannerUrl}
							alt=""
							className="h-full w-full scale-125 object-cover blur-sm brightness-50 saturate-[1.3]"
						/>
					) : (
						<div className="h-full w-full bg-muted/40" />
					)}
					{/* Accent color tint on banner */}
					{accentColor && (
						<div
							className="absolute inset-0 opacity-20 mix-blend-overlay"
							style={{ backgroundColor: accentColor }}
						/>
					)}
					<div className="absolute inset-0 bg-gradient-to-b from-background/30 via-transparent to-background" />
				</div>

				<Link
					to="/dashboard"
					className="absolute top-4 left-4 z-20 flex size-9 items-center justify-center rounded-full bg-background/50 backdrop-blur-md transition-colors hover:bg-background/70"
				>
					<ArrowLeft className="size-4 text-foreground" />
				</Link>
			</div>

			{/* Header: Cover + Info */}
			<div className="relative z-10 -mt-[120px] px-4 md:-mt-[140px] md:px-12">
				<div className="flex flex-col gap-6 md:flex-row md:gap-8">
					{/* Cover */}
					<div className="mx-auto flex-shrink-0 md:mx-0">
						<div
							className="relative w-44 overflow-hidden rounded-md shadow-2xl ring-1 ring-border md:w-52"
							style={{
								boxShadow: accentColor
									? `0 25px 50px -12px ${accentColor}40`
									: undefined,
							}}
						>
							{coverUrl ? (
								<img
									src={coverUrl}
									srcSet={coverSrcSet}
									sizes={coverPresets.detail.sizes}
									alt={title}
									className="aspect-[2/3] w-full object-cover"
									loading="eager"
									decoding="async"
									fetchPriority="high"
								/>
							) : (
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
							)}
						</div>

						{/* Actions below cover */}
						<HeroActions bookUuid={book.uuid} accentColor={accentColor} />
					</div>

					{/* Info */}
					<div className="flex-1 pt-0 text-center md:pt-[100px] md:text-left">
						<h1 className="font-bold text-2xl text-foreground leading-tight md:text-4xl">
							{title}
						</h1>

						{authorText && (
							<p className="mt-1 text-muted-foreground text-sm md:text-base">
								{authorText}
							</p>
						)}

						{book.subtitle && (
							<p className="mt-1 text-muted-foreground text-sm">
								{book.subtitle}
							</p>
						)}

						{book.titleRomaji && (
							<p className="mt-1 text-muted-foreground text-sm">
								{book.titleRomaji}
							</p>
						)}

						{/* Badges */}
						<div className="mt-3 flex flex-wrap justify-center gap-2 md:justify-start">
							{book.series?.name && (
								<span
									className="inline-flex h-7 items-center rounded-full border border-primary/30 bg-primary/10 px-2.5 font-medium text-[11px] text-primary tracking-wide"
									style={
										accentColor
											? {
													color: accentColor,
													borderColor: `${accentColor}4D`,
													backgroundColor: `${accentColor}1A`,
												}
											: undefined
									}
								>
									{book.series.name}
									{book.series.position != null &&
										` Vol. ${book.series.position}`}
								</span>
							)}
							{book.mediaType && (
								<span className="inline-flex h-7 items-center rounded-full border border-border bg-background/70 px-2.5 font-medium text-[11px] uppercase tracking-wide">
									{book.mediaType}
								</span>
							)}
							{book.languageCode && (
								<span className="inline-flex h-7 items-center rounded-full border border-border bg-background/70 px-2.5 font-medium text-[11px] uppercase tracking-wide">
									{book.languageCode.toUpperCase()}
								</span>
							)}
						</div>

						{/* Synopsis */}
						<SynopsisSection
							description={book.description}
							accentColor={accentColor}
						/>

						{/* Reading progress */}
						<div className="mt-4">
							<ReadingProgressBar
								bookUuid={book.uuid}
								accentColor={accentColor}
							/>
						</div>
					</div>
				</div>
			</div>

			{/* Tabs + Content */}
			<Tabs defaultValue="overview" className="mt-6">
				{/* Sticky tab bar */}
				<div className="sticky top-0 z-30 border-border/30 border-b bg-background/95 backdrop-blur-sm">
					<div className="px-4 md:px-12">
						<TabsList variant="line" className="h-auto gap-0 p-0">
							<TabsTrigger
								value="overview"
								className="px-5 py-3.5 text-sm data-active:text-[var(--book-accent)]"
								style={
									accentColor
										? ({
												"--book-accent": accentColor,
											} as React.CSSProperties)
										: undefined
								}
							>
								Overview
							</TabsTrigger>
							<TabsTrigger
								value="details"
								className="px-5 py-3.5 text-sm data-active:text-[var(--book-accent)]"
								style={
									accentColor
										? ({
												"--book-accent": accentColor,
											} as React.CSSProperties)
										: undefined
								}
							>
								Details
							</TabsTrigger>
							<TabsTrigger
								value="file"
								className="px-5 py-3.5 text-sm data-active:text-[var(--book-accent)]"
								style={
									accentColor
										? ({
												"--book-accent": accentColor,
											} as React.CSSProperties)
										: undefined
								}
							>
								File
							</TabsTrigger>
						</TabsList>
					</div>
				</div>

				{/* Tab content area with sidebar */}
				<div className="px-4 pt-6 md:px-12">
					<div className="flex flex-col gap-8 md:flex-row">
						{/* Sidebar — always visible */}
						<aside className="w-full flex-shrink-0 space-y-4 md:w-52">
							<Suspense
								fallback={<Skeleton className="h-20 rounded-md bg-muted/25" />}
							>
								<BookSidebarActions bookUuid={book.uuid} />
							</Suspense>

							<TagsSection book={book} />

							<MetadataDetails book={book} />
						</aside>

						{/* Main — tab panels */}
						<div className="min-w-0 flex-1">
							<TabsContent value="overview" className="text-sm">
								<OverviewTab book={book} />
							</TabsContent>

							<TabsContent value="details" className="text-sm">
								<DetailsTab book={book} />
							</TabsContent>

							<TabsContent value="file" className="text-sm">
								<FileTab book={book} />
							</TabsContent>
						</div>
					</div>
				</div>
			</Tabs>
		</div>
	);
}

/* ─── Reading Progress Bar ─── */

function ReadingProgressBar({
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
	if (!progress || !progress.bookCharCount || !progress.exploredCharCount)
		return null;

	const pct = Math.min(
		100,
		Math.round((progress.exploredCharCount / progress.bookCharCount) * 100),
	);

	return (
		<div className="space-y-1.5">
			<div className="flex items-center justify-between text-xs">
				<span className="text-muted-foreground">Reading progress</span>
				<span className="font-medium tabular-nums">
					{pct}%
					{progress.readingTimeSeconds
						? ` · ${formatReadingTime(progress.readingTimeSeconds)}`
						: ""}
				</span>
			</div>
			<div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
				<div
					className="h-full rounded-full bg-primary transition-all"
					style={{
						width: `${pct}%`,
						...(accentColor ? { backgroundColor: accentColor } : {}),
					}}
				/>
			</div>
		</div>
	);
}

/* ─── Hero Actions (Read / Download / Like) ─── */

function HeroActions({
	bookUuid,
	accentColor,
}: {
	bookUuid: string;
	accentColor: string | null;
}) {
	const queryClient = useQueryClient();

	const handleDownload = async () => {
		const { url } = await client.files.getSignedDownloadUrl({
			uuid: bookUuid,
		});
		window.open(url, "_blank");
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
			<Link
				to="/dashboard/books/$uuid/read"
				params={{ uuid: bookUuid }}
				className="flex-1"
			>
				<Button
					className="h-9 w-full gap-1.5 rounded-md font-semibold text-xs"
					style={
						accentColor
							? { backgroundColor: accentColor, color: "#fff" }
							: undefined
					}
				>
					<BookOpen className="size-3.5" />
					Read
				</Button>
			</Link>
			<Button
				onClick={handleDownload}
				variant="outline"
				size="icon"
				className="size-9 rounded-md"
			>
				<Download className="size-3.5" />
			</Button>
			<button
				type="button"
				onClick={() => toggleLikeMutation.mutate()}
				disabled={toggleLikeMutation.isPending || likeStatusQuery.isLoading}
				className={cn(
					"flex size-9 items-center justify-center rounded-md transition-colors",
					isLiked
						? "bg-destructive/20 text-destructive"
						: "bg-secondary/60 text-muted-foreground hover:text-foreground",
				)}
			>
				<Heart className={cn("size-4", isLiked && "fill-current")} />
			</button>
		</div>
	);
}

/* ─── Synopsis ─── */

function SynopsisSection({
	description,
	accentColor,
}: {
	description?: string | null;
	accentColor: string | null;
}) {
	const [expanded, setExpanded] = useState(false);

	if (!description) return null;

	return (
		<div className="relative mt-3">
			<p
				className={cn(
					"text-muted-foreground text-sm leading-relaxed transition-all",
					!expanded && "line-clamp-3 md:line-clamp-4",
				)}
			>
				{description}
			</p>
			{description.length > 200 && (
				<button
					type="button"
					onClick={() => setExpanded(!expanded)}
					className="mt-1 font-medium text-primary text-xs hover:underline"
					style={accentColor ? { color: accentColor } : undefined}
				>
					{expanded ? "Show less" : "Read more"}
				</button>
			)}
		</div>
	);
}

/* ─── Sidebar: Metadata Details ─── */

function MetadataDetails({ book }: { book: BookData }) {
	const characterCount = book.amountChars
		? new Intl.NumberFormat().format(book.amountChars)
		: null;
	const publishedYear = book.publishedDate?.match(/\d{4}/)?.[0] ?? null;

	const sections: Array<{ label: string; items: string[] }> = [
		{
			label: "Authors",
			items:
				book.authors?.map((a) =>
					a.role && a.role !== "Author" ? `${a.name} (${a.role})` : a.name,
				) ?? [],
		},
		{
			label: "Publisher",
			items: book.publisher?.name ? [book.publisher.name] : [],
		},
		{
			label: "Series",
			items: book.series?.name
				? [
						book.series.position != null
							? `${book.series.name} Vol. ${book.series.position}`
							: book.series.name,
					]
				: [],
		},
		{
			label: "Details",
			items: [
				book.mediaType?.toUpperCase(),
				book.pageCount ? `${book.pageCount} pages` : null,
				characterCount ? `${characterCount} chars` : null,
				book.languageCode?.toUpperCase(),
				publishedYear,
			].filter(Boolean) as string[],
		},
	].filter((s) => s.items.length > 0);

	if (sections.length === 0) return null;

	return (
		<div className="space-y-4">
			{sections.map((section) => (
				<section key={section.label} className="space-y-2">
					<h2 className="font-semibold text-muted-foreground text-xs uppercase tracking-[0.15em]">
						{section.label}
					</h2>
					<div className="flex flex-wrap gap-1.5">
						{section.items.map((item) => (
							<span
								key={item}
								className="inline-flex h-7 items-center rounded-full border border-border/80 bg-background/60 px-3 text-muted-foreground text-xs"
							>
								{item}
							</span>
						))}
					</div>
				</section>
			))}
		</div>
	);
}

/* ─── Sidebar: Tags ─── */

function TagsSection({ book }: { book: BookData }) {
	const tags = [
		book.mediaType,
		book.languageCode?.toUpperCase(),
		book.series?.name,
		book.publisher?.name,
	].filter(Boolean);

	if (tags.length === 0) return null;

	return (
		<section className="space-y-2">
			<h2 className="font-semibold text-muted-foreground text-xs uppercase tracking-[0.15em]">
				Tags
			</h2>
			<div className="flex flex-wrap gap-1.5">
				{tags.map((tag) => (
					<span
						key={tag}
						className="inline-flex h-7 cursor-pointer items-center rounded-full border border-border/80 bg-background/60 px-3 text-muted-foreground text-xs transition-colors hover:bg-muted/80 hover:text-foreground"
					>
						{tag}
					</span>
				))}
			</div>
		</section>
	);
}

/* ─── Tab: Overview ─── */

function OverviewTab({ book }: { book: BookData }) {
	return (
		<div className="space-y-10">
			{/* Stats */}
			<StatsSection book={book} />

			{/* Full description (if long, show full here) */}
			{book.description && book.description.length > 200 && (
				<section>
					<h3 className="mb-4 font-semibold text-foreground text-sm">
						Full Description
					</h3>
					<p className="text-foreground/80 text-sm leading-relaxed">
						{book.description}
					</p>
				</section>
			)}
		</div>
	);
}

/* ─── Tab: Details ─── */

function DetailsTab({ book }: { book: BookData }) {
	const characterCount = book.amountChars
		? new Intl.NumberFormat().format(book.amountChars)
		: null;
	const authorDetailText = book.authors
		?.map((a: { name: string; role: string }) =>
			a.role && a.role !== "Author" ? `${a.name} (${a.role})` : a.name,
		)
		.join(", ");

	const detailRows = [
		{ label: "Format", value: book.mediaType?.toUpperCase() ?? null },
		{ label: "Pages", value: book.pageCount ? String(book.pageCount) : null },
		{
			label: "Characters",
			value: characterCount ? `${characterCount}` : null,
		},
		{ label: "Language", value: book.languageCode?.toUpperCase() ?? null },
		{ label: "Authors", value: authorDetailText ?? null },
		{ label: "Publisher", value: book.publisher?.name ?? null },
		{ label: "Series", value: book.series?.name ?? null },
		{
			label: "Series Position",
			value:
				book.series?.position != null ? String(book.series.position) : null,
		},
		{ label: "Published", value: formatDate(book.publishedDate) },
	].filter((r): r is { label: string; value: string } => Boolean(r.value));

	const identifierRows = [
		{ label: "ISBN-13", value: book.isbn13 ?? null },
		{ label: "ISBN-10", value: book.isbn10 ?? null },
		{ label: "ASIN", value: book.asin ?? null },
	].filter((r): r is { label: string; value: string } => Boolean(r.value));

	return (
		<div className="space-y-8">
			{detailRows.length > 0 && (
				<section>
					<h3 className="mb-4 font-semibold text-foreground text-sm">
						Book Details
					</h3>
					<dl className="space-y-0">
						{detailRows.map((row) => (
							<div
								key={row.label}
								className="grid grid-cols-[140px_1fr] gap-2 border-border/10 border-b py-2.5 last:border-0"
							>
								<dt className="font-medium text-[11px] text-muted-foreground uppercase tracking-wide">
									{row.label}
								</dt>
								<dd className="text-foreground text-sm">{row.value}</dd>
							</div>
						))}
					</dl>
				</section>
			)}

			{identifierRows.length > 0 && (
				<section>
					<h3 className="mb-4 font-semibold text-foreground text-sm">
						Identifiers
					</h3>
					<dl className="space-y-0">
						{identifierRows.map((row) => (
							<div
								key={row.label}
								className="grid grid-cols-[140px_1fr] gap-2 border-border/10 border-b py-2.5 last:border-0"
							>
								<dt className="font-medium text-[11px] text-muted-foreground uppercase tracking-wide">
									{row.label}
								</dt>
								<dd className="font-mono text-foreground text-sm">
									{row.value}
								</dd>
							</div>
						))}
					</dl>
				</section>
			)}
		</div>
	);
}

/* ─── Tab: File ─── */

function FileTab({ book }: { book: BookData }) {
	const fileSize = formatFileSize(book.filesizeKb);

	const rows = [
		{ label: "Filename", value: book.filename, breakAll: true },
		{ label: "Size", value: fileSize },
		{ label: "Added", value: formatDate(book.createdAt) },
		{ label: "Modified", value: formatDate(book.lastModified) },
	].filter((r): r is { label: string; value: string; breakAll?: boolean } =>
		Boolean(r.value),
	);

	if (rows.length === 0) return null;

	return (
		<section>
			<h3 className="mb-4 font-semibold text-foreground text-sm">
				File Information
			</h3>
			<dl className="space-y-0">
				{rows.map((row) => (
					<div
						key={row.label}
						className="grid grid-cols-[140px_1fr] gap-2 border-border/10 border-b py-2.5 last:border-0"
					>
						<dt className="font-medium text-[11px] text-muted-foreground uppercase tracking-wide">
							{row.label}
						</dt>
						<dd
							className={cn(
								"text-foreground text-sm",
								row.breakAll && "break-all",
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

/* ─── Stats Section ─── */

function StatsSection({ book }: { book: BookData }) {
	const publishedYear = book.publishedDate?.match(/\d{4}/)?.[0] ?? null;
	const characterCount = book.amountChars
		? new Intl.NumberFormat().format(book.amountChars)
		: null;

	const stats = [
		book.pageCount ? { label: "Pages", value: String(book.pageCount) } : null,
		characterCount ? { label: "Characters", value: characterCount } : null,
		publishedYear ? { label: "Year", value: publishedYear } : null,
		book.languageCode
			? { label: "Language", value: book.languageCode.toUpperCase() }
			: null,
	].filter(Boolean) as Array<{ label: string; value: string }>;

	if (stats.length === 0) return null;

	return (
		<section>
			<h3 className="mb-4 font-semibold text-foreground text-sm">Statistics</h3>
			<div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
				{stats.map((stat) => (
					<div
						key={stat.label}
						className="rounded-lg border border-border/10 bg-secondary/15 p-4 text-center"
					>
						<p className="font-bold text-foreground text-lg">{stat.value}</p>
						<p className="mt-0.5 text-[11px] text-muted-foreground">
							{stat.label}
						</p>
					</div>
				))}
			</div>
		</section>
	);
}
