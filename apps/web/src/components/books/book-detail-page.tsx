import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useLoaderData } from "@tanstack/react-router";
import {
	BookOpen,
	ChevronRight,
	Download,
	Heart,
} from "lucide-react";
import { lazy, Suspense, useState } from "react";
import { toast } from "sonner";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import {
	coverPresets,
	getCoverPresetUrl,
	getCoverSrcSet,
} from "@/utils/covers";
import { getBook } from "@/functions/books/get-book";
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
	const heroColor = book.mainColor ?? "hsl(var(--accent))";
	const coverFilename = book.cover?.split("/").pop();
	const coverUrl = coverFilename
		? getCoverPresetUrl(coverFilename, coverPresets.detail)
		: null;
	const coverSrcSet = coverFilename
		? getCoverSrcSet(coverFilename, coverPresets.detail.widths)
		: undefined;
	const publishedYear = book.publishedDate?.match(/\d{4}/)?.[0] ?? null;
	const authorText = book.authors?.map((a) => a.name).join(", ");

	return (
		<div className="relative min-h-full">
			{/* Background gradient */}
			<div
				className="pointer-events-none absolute inset-0"
				style={{
					background: `linear-gradient(
						color-mix(in srgb, ${heroColor} 16%, transparent) 0%,
						color-mix(in srgb, ${heroColor} 10%, transparent) 52%,
						color-mix(in srgb, ${heroColor} 7%, transparent) 100%
					)`,
				}}
			/>
			<div className="pointer-events-none absolute inset-x-0 top-0 h-[150px] bg-gradient-to-b from-black/30 to-transparent" />

			{/* ZONE 1: Hero */}
			<div className="relative px-5 pt-8 pb-6 md:pt-10 lg:px-8 lg:pt-12 xl:px-10 2xl:px-12">
				<div className="grid gap-6 md:grid-cols-[280px_minmax(0,1fr)] md:gap-8 xl:grid-cols-[320px_minmax(0,1fr)]">
					{/* Cover */}
					<div className="mx-auto w-[200px] md:mx-0 md:w-full">
						<div className="relative aspect-[2/3] w-full overflow-hidden rounded-xl shadow-xl ring-1 ring-border">
							{coverUrl ? (
								<img
									src={coverUrl}
									srcSet={coverSrcSet}
									sizes={coverPresets.detail.sizes}
									alt={title}
									className="absolute inset-0 h-full w-full object-cover"
									loading="eager"
									decoding="async"
									fetchPriority="high"
									width={320}
									height={480}
								/>
							) : (
								<div className="absolute inset-0 bg-muted/30" />
							)}
							{!coverUrl && (
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
							)}
						</div>
					</div>

					{/* Hero info */}
					<div className="flex flex-col gap-4">
						<header className="space-y-2">
							<h1 className="font-semibold text-2xl text-white leading-tight tracking-tight md:text-3xl xl:text-4xl">
								{title}
							</h1>
							{authorText && (
								<p className="text-muted-foreground text-sm md:text-base">
									{authorText}
								</p>
							)}
							{book.subtitle && (
								<p className="text-muted-foreground text-sm md:text-base">
									{book.subtitle}
								</p>
							)}
							{book.titleRomaji && (
								<p className="text-muted-foreground text-sm">
									{book.titleRomaji}
								</p>
							)}
						</header>

						{/* Badges */}
						<div className="flex flex-wrap gap-2">
							{book.series?.name && (
								<span
									className="inline-flex h-7 items-center rounded-full px-2.5 font-medium text-[11px] tracking-wide"
									style={{
										backgroundColor: `color-mix(in srgb, ${heroColor} 20%, transparent)`,
										borderColor: `color-mix(in srgb, ${heroColor} 40%, transparent)`,
										borderWidth: "1px",
									}}
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
							{publishedYear && (
								<span className="inline-flex h-7 items-center rounded-full border border-border bg-background/70 px-2.5 font-medium text-[11px] uppercase tracking-wide">
									{publishedYear}
								</span>
							)}
							{book.languageCode && (
								<span className="inline-flex h-7 items-center rounded-full border border-border bg-background/70 px-2.5 font-medium text-[11px] uppercase tracking-wide">
									{book.languageCode.toUpperCase()}
								</span>
							)}
						</div>

						{/* Reading progress */}
						<ReadingProgressBar bookUuid={book.uuid} />

						{/* Primary actions */}
						<HeroActions bookUuid={book.uuid} heroColor={heroColor} />
					</div>
				</div>
			</div>

			{/* ZONE 2: Content */}
			<div className="relative px-5 pb-8 lg:px-8 xl:px-10 2xl:px-12">
				<div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_300px]">
					{/* Main content */}
					<div className="space-y-6">
						<SynopsisSection description={book.description} />

						{/* Collections — visible on lg+ */}
						<div className="hidden lg:block">
							<Suspense
								fallback={
									<div className="h-20 animate-pulse rounded-md bg-muted/25" />
								}
							>
								<BookSidebarActions bookUuid={book.uuid} />
							</Suspense>
						</div>
					</div>

					{/* Sidebar metadata */}
					<aside className="space-y-5">
						<MetadataDetails book={book} />
						<MetadataIdentifiers book={book} />
						<MetadataFile book={book} />

						{/* Shelf + Collections on mobile */}
						<div className="lg:hidden">
							<Suspense
								fallback={
									<div className="h-20 animate-pulse rounded-md bg-muted/25" />
								}
							>
								<BookSidebarActions bookUuid={book.uuid} />
							</Suspense>
						</div>
					</aside>
				</div>
			</div>
		</div>
	);
}

/* ─── Reading Progress Bar ─── */

function ReadingProgressBar({ bookUuid }: { bookUuid: string }) {
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
				<span className="text-muted-foreground">Progreso de lectura</span>
				<span className="font-medium tabular-nums">
					{pct}%
					{progress.readingTimeSeconds
						? ` · ${formatReadingTime(progress.readingTimeSeconds)}`
						: ""}
				</span>
			</div>
			<div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
				<div
					className="h-full rounded-full bg-white/80 transition-all"
					style={{ width: `${pct}%` }}
				/>
			</div>
		</div>
	);
}

/* ─── Hero Actions (Read / Download / Like) ─── */

function HeroActions({
	bookUuid,
	heroColor,
}: { bookUuid: string; heroColor: string }) {
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
		onSuccess: (result) => {
			queryClient.setQueryData(likeStatusQueryOptions.queryKey, result);
		},
		onError: (error) => {
			toast.error(
				error instanceof Error
					? error.message
					: "Failed to update like status",
			);
		},
	});
	const isLiked = likeStatusQuery.data?.liked ?? false;

	return (
		<div className="flex flex-wrap items-center gap-2">
			<Link to="/dashboard/books/$uuid/read" params={{ uuid: bookUuid }}>
				<Button
					className="h-10 gap-2 px-6"
					style={{
						backgroundColor: `color-mix(in srgb, ${heroColor} 85%, white)`,
					}}
				>
					<BookOpen className="size-4" />
					Read
				</Button>
			</Link>
			<Button
				onClick={handleDownload}
				variant="outline"
				className="h-10 gap-2 border-white/20 bg-white/5 hover:bg-white/10"
			>
				<Download className="size-4" />
				Download
			</Button>
			<Button
				type="button"
				variant="outline"
				size="icon"
				aria-pressed={isLiked}
				disabled={toggleLikeMutation.isPending || likeStatusQuery.isLoading}
				onClick={() => toggleLikeMutation.mutate()}
				className={`size-10 rounded-full border-white/20 bg-white/5 hover:bg-white/10 ${
					isLiked
						? "border-pink-500/60 bg-pink-500/10 text-pink-400 hover:bg-pink-500/20"
						: ""
				}`}
			>
				<Heart className={`size-4 ${isLiked ? "fill-current" : ""}`} />
			</Button>
		</div>
	);
}

/* ─── Synopsis ─── */

function SynopsisSection({
	description,
}: { description?: string | null }) {
	const [expanded, setExpanded] = useState(false);

	return (
		<section className="space-y-3">
			<h2 className="font-semibold text-muted-foreground text-xs uppercase tracking-[0.15em]">
				Synopsis
			</h2>
			{description ? (
				<div className="relative">
					<p
						className={`text-sm leading-relaxed md:text-[15px] ${!expanded ? "line-clamp-6" : ""}`}
					>
						{description}
					</p>
					{description.length > 400 && (
						<button
							type="button"
							onClick={() => setExpanded(!expanded)}
							className="mt-1 font-medium text-muted-foreground text-sm hover:text-foreground"
						>
							{expanded ? "Leer menos" : "Leer más"}
						</button>
					)}
				</div>
			) : (
				<p className="text-muted-foreground text-sm">
					No description available for this title.
				</p>
			)}
		</section>
	);
}

/* ─── Metadata: Details ─── */

function MetadataDetails({ book }: { book: BookData }) {
	const characterCount = book.amountChars
		? new Intl.NumberFormat().format(book.amountChars)
		: null;
	const authorDetailText = book.authors
		?.map((a: { name: string; role: string }) =>
			a.role && a.role !== "Author" ? `${a.name} (${a.role})` : a.name,
		)
		.join(", ");

	const rows = [
		{ label: "Formato", value: book.mediaType?.toUpperCase() ?? null },
		{ label: "Paginas", value: book.pageCount ? String(book.pageCount) : null },
		{ label: "Caracteres", value: characterCount ? `${characterCount}` : null },
		{ label: "Idioma", value: book.languageCode?.toUpperCase() ?? null },
		{ label: "Autores", value: authorDetailText ?? null },
		{ label: "Editorial", value: book.publisher?.name ?? null },
		{ label: "Serie", value: book.series?.name ?? null },
		{ label: "Publicado", value: formatDate(book.publishedDate) },
	].filter((r): r is { label: string; value: string } => Boolean(r.value));

	if (rows.length === 0) return null;

	return (
		<section className="space-y-2.5">
			<h2 className="font-semibold text-muted-foreground text-xs uppercase tracking-[0.15em]">
				Detalles
			</h2>
			<dl className="space-y-2">
				{rows.map((row) => (
					<div
						key={row.label}
						className="grid gap-0.5 border-border/60 border-b pb-2 last:border-b-0 last:pb-0"
					>
						<dt className="font-medium text-[11px] text-muted-foreground uppercase tracking-wide">
							{row.label}
						</dt>
						<dd className="text-sm">{row.value}</dd>
					</div>
				))}
			</dl>
		</section>
	);
}

/* ─── Metadata: Identifiers (collapsible) ─── */

function MetadataIdentifiers({ book }: { book: BookData }) {
	const [open, setOpen] = useState(false);

	const rows = [
		{ label: "ISBN-13", value: book.isbn13 ?? null },
		{ label: "ISBN-10", value: book.isbn10 ?? null },
		{ label: "ASIN", value: book.asin ?? null },
	].filter((r): r is { label: string; value: string } => Boolean(r.value));

	if (rows.length === 0) return null;

	return (
		<Collapsible open={open} onOpenChange={setOpen}>
			<CollapsibleTrigger className="flex w-full items-center justify-between py-1">
				<h2 className="font-semibold text-muted-foreground text-xs uppercase tracking-[0.15em]">
					Identificadores
				</h2>
				<ChevronRight
					className={`size-4 text-muted-foreground transition-transform ${open ? "rotate-90" : ""}`}
				/>
			</CollapsibleTrigger>
			<CollapsibleContent>
				<dl className="space-y-2 pt-2">
					{rows.map((row) => (
						<div
							key={row.label}
							className="grid gap-0.5 border-border/60 border-b pb-2 last:border-b-0 last:pb-0"
						>
							<dt className="font-medium text-[11px] text-muted-foreground uppercase tracking-wide">
								{row.label}
							</dt>
							<dd className="text-sm">{row.value}</dd>
						</div>
					))}
				</dl>
			</CollapsibleContent>
		</Collapsible>
	);
}

/* ─── Metadata: File info (collapsible) ─── */

function MetadataFile({ book }: { book: BookData }) {
	const [open, setOpen] = useState(false);
	const fileSize = formatFileSize(book.filesizeKb);

	const rows = [
		{ label: "Archivo", value: book.filename, breakAll: true },
		{ label: "Tamano", value: fileSize },
		{ label: "Agregado", value: formatDate(book.createdAt) },
		{ label: "Modificado", value: formatDate(book.lastModified) },
	].filter(
		(r): r is { label: string; value: string; breakAll?: boolean } =>
			Boolean(r.value),
	);

	if (rows.length === 0) return null;

	return (
		<Collapsible open={open} onOpenChange={setOpen}>
			<CollapsibleTrigger className="flex w-full items-center justify-between py-1">
				<h2 className="font-semibold text-muted-foreground text-xs uppercase tracking-[0.15em]">
					Archivo
				</h2>
				<ChevronRight
					className={`size-4 text-muted-foreground transition-transform ${open ? "rotate-90" : ""}`}
				/>
			</CollapsibleTrigger>
			<CollapsibleContent>
				<dl className="space-y-2 pt-2">
					{rows.map((row) => (
						<div
							key={row.label}
							className="grid gap-0.5 border-border/60 border-b pb-2 last:border-b-0 last:pb-0"
						>
							<dt className="font-medium text-[11px] text-muted-foreground uppercase tracking-wide">
								{row.label}
							</dt>
							<dd
								className={`text-sm ${row.breakAll ? "break-all" : ""}`}
							>
								{row.value}
							</dd>
						</div>
					))}
				</dl>
			</CollapsibleContent>
		</Collapsible>
	);
}
