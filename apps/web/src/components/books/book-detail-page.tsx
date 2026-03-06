import { useLoaderData } from "@tanstack/react-router";
import { lazy, Suspense, useEffect, useState } from "react";
import {
	coverPresets,
	getCoverPresetUrl,
	getCoverSrcSet,
} from "@/utils/covers";

const BookSidebarActions = lazy(async () => {
	const module = await import("@/components/books/book-sidebar-actions");
	return { default: module.BookSidebarActions };
});

function preloadBookSidebarActions() {
	void import("@/components/books/book-sidebar-actions");
}

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

export function BookDetailPage() {
	const { book } = useLoaderData({ from: "/dashboard/books/$uuid" });
	const [shouldRenderSidebarActions, setShouldRenderSidebarActions] =
		useState(false);

	useEffect(() => {
		const idleWindow = window as Window & {
			requestIdleCallback?: (callback: () => void) => number;
			cancelIdleCallback?: (handle: number) => void;
		};
		if (
			typeof idleWindow.requestIdleCallback === "function" &&
			typeof idleWindow.cancelIdleCallback === "function"
		) {
			const idleId = idleWindow.requestIdleCallback(() => {
				setShouldRenderSidebarActions(true);
			});
			return () => {
				idleWindow.cancelIdleCallback?.(idleId);
			};
		}
		const timeoutId = idleWindow.setTimeout(() => {
			setShouldRenderSidebarActions(true);
		}, 600);
		return () => {
			idleWindow.clearTimeout(timeoutId);
		};
	}, []);

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
	const authorText = book.authors?.map((author) => author.name).join(", ");
	const authorDetailText = book.authors
		?.map((author) =>
			author.role && author.role !== "Author"
				? `${author.name} (${author.role})`
				: author.name,
		)
		.join(", ");
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
							linear-gradient(
								color-mix(in srgb, ${heroColor} 16%, transparent) 0%,
								color-mix(in srgb, ${heroColor} 10%, transparent) 52%,
								color-mix(in srgb, ${heroColor} 7%, transparent) 100%
							)
						`,
				}}
			/>
			<div className="pointer-events-none absolute inset-x-0 top-0 h-[310px] bg-gradient-to-b from-black/30 to-transparent" />

			<section className="relative h-[230px] md:h-[280px] lg:h-[290px]" />

			<div className="relative -mt-32 px-5 pb-8 md:-mt-36 lg:px-8 xl:-mt-40 xl:px-10 2xl:px-12">
				<section className="w-full">
					<div className="grid gap-6 xl:grid-cols-[340px_minmax(0,1fr)_300px] xl:gap-8">
						<aside className="mx-auto w-full max-w-[340px] space-y-3 xl:mx-0 xl:max-w-none">
							<div className="relative mx-auto h-[360px] w-[240px] overflow-hidden rounded-xl shadow-xl ring-1 ring-border md:h-[420px] md:w-[280px] xl:mx-0 xl:h-[510px] xl:w-full">
								{coverUrl && (
									<img
										src={coverUrl}
										srcSet={coverSrcSet}
										sizes={coverPresets.detail.sizes}
										alt={title}
										className="absolute inset-0 h-full w-full object-cover"
										loading="eager"
										decoding="async"
										fetchPriority="high"
										width={340}
										height={510}
									/>
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

							<div onPointerEnter={preloadBookSidebarActions}>
								{shouldRenderSidebarActions ? (
									<Suspense fallback={<BookSidebarActionsFallback />}>
										<BookSidebarActions bookUuid={book.uuid} />
									</Suspense>
								) : (
									<BookSidebarActionsFallback />
								)}
							</div>
						</aside>

						<main className="space-y-5 md:space-y-6">
							<header className="space-y-3">
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
								<h2 className="font-semibold text-muted-foreground text-xs uppercase tracking-[0.15em]">
									Synopsis
								</h2>
								{book.description ? (
									<p className="text-sm leading-relaxed md:text-[15px]">
										{book.description}
									</p>
								) : (
									<p className="text-muted-foreground text-sm">
										No description available for this title.
									</p>
								)}
							</section>
						</main>

						<aside className="space-y-5 xl:border-border/60 xl:border-l xl:pl-6">
							<section className="space-y-2.5">
								<h2 className="font-semibold text-muted-foreground text-xs uppercase tracking-[0.15em]">
									Overview
								</h2>
								<dl className="space-y-2.5">
									{overviewRows.map((row) => (
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
							</section>
						</aside>
					</div>
				</section>
			</div>
		</div>
	);
}

function BookSidebarActionsFallback() {
	return (
		<div className="space-y-2">
			<div className="h-9 animate-pulse rounded-md border border-border/60 bg-muted/40" />
			<div className="h-9 animate-pulse rounded-md border border-border/60 bg-muted/35" />
			<div className="h-9 animate-pulse rounded-md border border-border/60 bg-muted/30" />
			<div className="h-20 animate-pulse rounded-md border border-border/60 bg-muted/25" />
		</div>
	);
}
