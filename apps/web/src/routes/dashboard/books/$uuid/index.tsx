import { env } from "@nanahoshi-v2/env/web";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useLoaderData } from "@tanstack/react-router";
import {
	BookmarkPlus,
	BookOpen,
	Check,
	Download,
	Heart,
	ListTodo,
	Timer,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { client, orpc } from "@/utils/orpc";

export const Route = createFileRoute("/dashboard/books/$uuid/")({
	component: BookDetailPage,
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

const QUICK_SHELF_OPTIONS: Array<{
	value: string;
	label: string;
	icon: typeof Check;
}> = [
	{ value: "read", label: "Leido", icon: Check },
	{ value: "reading", label: "Leyendo", icon: Timer },
	{ value: "backlog", label: "Backlog", icon: ListTodo },
	{ value: "want_to_read", label: "Quiero leer", icon: BookmarkPlus },
];

function BookDetailPage() {
	const { book } = useLoaderData({ from: "/dashboard/books/$uuid" });
	const queryClient = useQueryClient();

	const handleDownload = async () => {
		const { url } = await client.files.getSignedDownloadUrl({
			uuid: book.uuid,
		});
		window.open(url, "_blank");
	};

	const likeStatusQueryOptions = orpc.likedBooks.getLikeStatus.queryOptions({
		input: { bookUuid: book.uuid },
	});
	const likeStatusQuery = useQuery(likeStatusQueryOptions);
	const toggleLikeMutation = useMutation({
		mutationFn: () => client.likedBooks.toggleLike({ bookUuid: book.uuid }),
		onSuccess: (result) => {
			queryClient.setQueryData(likeStatusQueryOptions.queryKey, result);
		},
	});

	const title = book.title ?? book.filename;
	const heroColor = book.mainColor ?? "hsl(var(--accent))";
	const coverFilename = book.cover?.split("/").pop();
	const coverUrl = coverFilename
		? `${env.VITE_SERVER_URL}/api/data/covers/${coverFilename}?width=420&height=630`
		: null;
	const publishedYear = book.publishedDate?.match(/\d{4}/)?.[0] ?? null;
	const authorText = book.authors?.map((author) => author.name).join(", ");
	const authorDetailText = book.authors
		?.map((author) =>
			author.role && author.role !== "Author"
				? `${author.name} (${author.role})`
				: author.name,
		)
		.join(", ");
	const isLiked = likeStatusQuery.data?.liked ?? false;
	const fileSize = formatFileSize(book.filesizeKb);
	const characterCount = book.amountChars
		? new Intl.NumberFormat().format(book.amountChars)
		: null;
	const overviewRows = [
		{ label: "Autores", value: authorDetailText ?? null },
		{ label: "Editorial", value: book.publisher?.name ?? null },
		{ label: "Serie", value: book.series?.name ?? null },
		{
			label: "Formato",
			value: book.mediaType ? book.mediaType.toUpperCase() : null,
		},
		{
			label: "Idioma",
			value: book.languageCode ? book.languageCode.toUpperCase() : null,
		},
		{
			label: "Paginas",
			value: book.pageCount ? String(book.pageCount) : null,
		},
		{
			label: "Caracteres",
			value: characterCount ? `${characterCount} chars` : null,
		},
		{ label: "Publicado", value: formatDate(book.publishedDate) },
		{ label: "Agregado", value: formatDate(book.createdAt) },
		{ label: "Modificado", value: formatDate(book.lastModified) },
		{ label: "ISBN-13", value: book.isbn13 ?? null },
		{ label: "ISBN-10", value: book.isbn10 ?? null },
		{ label: "ASIN", value: book.asin ?? null },
		{ label: "Tamano", value: fileSize },
		{ label: "Archivo", value: book.filename, breakAll: true },
	].filter((row): row is { label: string; value: string; breakAll?: boolean } =>
		Boolean(row.value),
	);

	return (
		<div className="relative min-h-full">
			<div
				className="pointer-events-none absolute inset-0"
				style={{
					background: `
							radial-gradient(1250px 360px at 18% 18%, color-mix(in srgb, ${heroColor} 22%, transparent), transparent 72%),
							linear-gradient(
								180deg,
								color-mix(in srgb, ${heroColor} 16%, transparent) 0%,
								color-mix(in srgb, ${heroColor} 10%, transparent) 42%,
								color-mix(in srgb, ${heroColor} 7%, transparent) 100%
							)
						`,
				}}
			/>
			<div className="pointer-events-none absolute inset-x-0 top-0 h-[310px] bg-gradient-to-b from-black/30 to-transparent" />

			<section className="relative h-[230px] md:h-[280px] lg:h-[320px]" />

			<div className="relative mx-auto -mt-32 max-w-[1680px] px-5 pb-8 md:-mt-36 lg:px-8 xl:-mt-40 xl:px-10 2xl:px-12">
				<section className="overflow-hidden rounded-2xl border border-border/70 bg-card/95 shadow-xl backdrop-blur">
					<div className="grid gap-6 p-4 md:p-6 xl:grid-cols-[340px_minmax(0,1fr)_300px] xl:gap-8">
						<aside className="mx-auto w-full max-w-[340px] space-y-3 xl:mx-0 xl:max-w-none">
							{coverUrl ? (
								<div className="relative mx-auto h-[360px] w-[240px] overflow-hidden rounded-xl shadow-xl ring-1 ring-border md:h-[420px] md:w-[280px] xl:mx-0 xl:h-[510px] xl:w-full">
									<img
										src={coverUrl}
										alt={title}
										className="h-full w-full object-cover"
										decoding="async"
										fetchPriority="high"
									/>
									<div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/45 to-transparent" />
								</div>
							) : (
								<div className="relative mx-auto h-[360px] w-[240px] overflow-hidden rounded-xl shadow-xl ring-1 ring-border md:h-[420px] md:w-[280px] xl:mx-0 xl:h-[510px] xl:w-full">
									<div
										className="absolute inset-0"
										style={{
											background: `linear-gradient(158deg, color-mix(in srgb, ${heroColor} 78%, hsl(var(--background))) 0%, color-mix(in srgb, ${heroColor} 44%, hsl(var(--background))) 48%, hsl(var(--background)) 100%)`,
										}}
									/>
									<div className="absolute inset-0 bg-[radial-gradient(180px_110px_at_80%_20%,rgba(255,255,255,0.16),transparent_70%)]" />
									<div className="absolute inset-0 bg-[radial-gradient(220px_130px_at_20%_82%,rgba(0,0,0,0.24),transparent_75%)]" />
									<div className="absolute inset-x-0 bottom-0 space-y-1 bg-gradient-to-t from-black/65 to-transparent px-4 pb-4 pt-10">
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

							<div className="grid gap-2 pt-1">
								<Link
									to="/dashboard/books/$uuid/read"
									params={{ uuid: book.uuid }}
								>
									<Button className="h-9 w-full gap-2">
										<BookOpen className="size-4" />
										Read
									</Button>
								</Link>
								<Button
									onClick={handleDownload}
									variant="outline"
									className="h-9 w-full gap-2"
								>
									<Download className="size-4" />
									Download
								</Button>
								<Button
									type="button"
									variant="outline"
									aria-pressed={isLiked}
									disabled={
										toggleLikeMutation.isPending || likeStatusQuery.isLoading
									}
									onClick={() => toggleLikeMutation.mutate()}
									className={`h-9 w-full gap-2 ${
										isLiked
											? "border-pink-500/60 bg-pink-500/10 text-pink-600 hover:bg-pink-500/20 dark:text-pink-300"
											: ""
									}`}
								>
									<Heart
										className={`size-4 ${isLiked ? "fill-current" : ""}`}
									/>
									{isLiked ? "Liked" : "Like"}
								</Button>
							</div>

							<section className="space-y-2.5 pt-2">
								<h2 className="font-semibold text-xs uppercase tracking-[0.15em] text-muted-foreground">
									Estado
								</h2>
								<div className="grid gap-2">
									{QUICK_SHELF_OPTIONS.map((option) => {
										const Icon = option.icon;
										return (
											<Button
												key={option.value}
												type="button"
												size="sm"
												variant="outline"
												className="h-8 justify-start gap-1.5 border-border/80 bg-background/60 hover:bg-muted/80"
											>
												<Icon className="size-3.5" />
												{option.label}
											</Button>
										);
									})}
								</div>
							</section>
						</aside>

						<main className="space-y-5 md:space-y-6">
							<header className="space-y-3">
								<p className="font-medium text-[11px] uppercase tracking-[0.18em] text-primary/90">
									Book
								</p>
								<h1 className="font-semibold text-2xl leading-tight tracking-tight md:text-3xl xl:text-4xl">
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

								<div className="flex flex-wrap gap-2 pt-1">
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
								</div>
							</header>

							<div className="h-px w-full bg-border/60" />

							<section className="space-y-3">
								<h2 className="font-semibold text-xs uppercase tracking-[0.15em] text-muted-foreground">
									Synopsis
								</h2>
								{book.description ? (
									<p className="leading-relaxed text-sm md:text-[15px]">
										{book.description}
									</p>
								) : (
									<p className="text-muted-foreground text-sm">
										No description available for this title.
									</p>
								)}
							</section>
						</main>

						<aside className="space-y-5 xl:border-l xl:border-border/60 xl:pl-6">
							<section className="space-y-2.5">
								<h2 className="font-semibold text-xs uppercase tracking-[0.15em] text-muted-foreground">
									Overview
								</h2>
								<dl className="space-y-2.5">
									{overviewRows.map((row) => (
										<div
											key={row.label}
											className="grid gap-0.5 border-border/60 border-b pb-2 last:border-b-0 last:pb-0"
										>
											<dt className="font-medium text-[11px] uppercase tracking-wide text-muted-foreground">
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
							</section>
						</aside>
					</div>
				</section>
			</div>
		</div>
	);
}
