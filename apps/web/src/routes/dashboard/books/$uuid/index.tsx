import { env } from "@nanahoshi-v2/env/web";
import { createFileRoute, Link, useLoaderData } from "@tanstack/react-router";
import {
	BookmarkPlus,
	BookOpen,
	CalendarDays,
	Check,
	Download,
	FileText,
	HardDrive,
	Languages,
	Library,
	ListTodo,
	ScrollText,
	Timer,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { client } from "@/utils/orpc";

export const Route = createFileRoute("/dashboard/books/$uuid/")({
	component: BookDetailPage,
});

function formatFileSize(filesizeKb?: number | null) {
	if (!filesizeKb) return null;
	return filesizeKb >= 1024
		? `${(filesizeKb / 1024).toFixed(1)} MB`
		: `${filesizeKb} KB`;
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

	const handleDownload = async () => {
		const { url } = await client.files.getSignedDownloadUrl({
			uuid: book.uuid,
		});
		window.open(url, "_blank");
	};

	const coverFilename = book.cover?.split("/").pop();
	const heroColor = book.mainColor ?? "hsl(var(--accent))";
	const publishedYear = book.publishedDate?.match(/\d{4}/)?.[0] ?? null;
	const quickMeta = [
		{
			label: "Format",
			value: book.mediaType ? book.mediaType.toUpperCase() : null,
			icon: Library,
		},
		{
			label: "Language",
			value: book.languageCode ? book.languageCode.toUpperCase() : null,
			icon: Languages,
		},
		{
			label: "Pages",
			value: book.pageCount ? String(book.pageCount) : null,
			icon: ScrollText,
		},
		{
			label: "Published",
			value: publishedYear ?? book.publishedDate ?? null,
			icon: CalendarDays,
		},
	].filter((item) => item.value);
	const detailRows = [
		{
			label: "Language",
			value: book.languageCode ? book.languageCode.toUpperCase() : null,
		},
		{ label: "Pages", value: book.pageCount ? String(book.pageCount) : null },
		{ label: "Published", value: book.publishedDate ?? null },
		{ label: "ISBN", value: book.isbn13 ?? book.isbn10 ?? null },
		{ label: "ASIN", value: book.asin ?? null },
	].filter((item) => item.value);
	const fileSize = formatFileSize(book.filesizeKb);

	return (
		<div className="relative min-h-screen pb-8">
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

			<div className="relative mx-auto max-w-[1680px] px-5 lg:px-8 xl:px-10 2xl:px-12">
				<div className="h-[110px] lg:h-[140px]" />
				<div className="grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)] xl:grid-cols-[320px_minmax(0,1fr)]">
					<aside className="space-y-4">
						<div className="rounded-lg border border-border bg-card p-3 shadow-sm">
							<div className="mx-auto w-fit">
								{coverFilename ? (
									<img
										src={`${env.VITE_SERVER_URL}/api/data/covers/${coverFilename}?width=300`}
										alt={book.title ?? book.filename}
										className="w-[190px] rounded-md shadow-md ring-1 ring-border md:w-[220px] lg:w-[240px]"
										decoding="async"
										fetchPriority="high"
									/>
								) : (
									<div className="flex h-[290px] w-[190px] items-center justify-center rounded-md bg-muted text-muted-foreground text-sm md:h-[335px] md:w-[220px] lg:h-[365px] lg:w-[240px]">
										No cover
									</div>
								)}
							</div>
							<div className="mt-4 border-border border-t pt-4">
								<p className="mb-2 text-muted-foreground text-xs uppercase tracking-wide">
									Estado rapido
								</p>
								<div className="flex flex-col gap-2">
									{QUICK_SHELF_OPTIONS.map((option) => {
										const Icon = option.icon;
										return (
											<Button
												key={option.value}
												type="button"
												size="sm"
												variant="outline"
												className="h-8 w-full justify-start gap-1.5 border-border/80 bg-background/70 hover:bg-muted/80"
											>
												<Icon className="size-3.5" />
												{option.label}
											</Button>
										);
									})}
								</div>
							</div>
						</div>

						<Card className="border-border bg-card shadow-sm">
							<CardHeader className="pb-2">
								<h2 className="font-semibold text-sm">Overview</h2>
							</CardHeader>
							<CardContent className="space-y-2">
								{quickMeta.map((item) => {
									const Icon = item.icon;
									return (
										<div
											key={item.label}
											className="rounded-md border border-border bg-background px-3 py-2 transition-colors hover:bg-muted/30"
										>
											<p className="flex items-center gap-1.5 text-muted-foreground text-xs">
												<Icon className="size-3.5" />
												{item.label}
											</p>
											<p className="mt-1 font-medium text-sm">{item.value}</p>
										</div>
									);
								})}
							</CardContent>
						</Card>
					</aside>

					<main className="space-y-4">
						<section className="rounded-xl border border-border bg-card p-5 shadow-sm md:p-7">
							<div
								className="mb-4 h-1 w-16 rounded-full"
								style={{ backgroundColor: heroColor }}
							/>
							<h1 className="font-semibold text-2xl leading-tight tracking-tight md:text-3xl lg:text-4xl">
								{book.title ?? book.filename}
							</h1>
							{book.subtitle && (
								<p className="mt-2 text-base text-muted-foreground">
									{book.subtitle}
								</p>
							)}
							{book.titleRomaji && (
								<p className="mt-1 text-muted-foreground text-sm">
									{book.titleRomaji}
								</p>
							)}

							<div className="mt-6 flex flex-wrap gap-2.5">
								<Link
									to="/dashboard/books/$uuid/read"
									params={{ uuid: book.uuid }}
								>
									<Button className="h-9 gap-2 px-4">
										<BookOpen className="size-4" />
										Read
									</Button>
								</Link>
								<Button
									onClick={handleDownload}
									variant="outline"
									className="h-9 gap-2 px-4"
								>
									<Download className="size-4" />
									Download
								</Button>
								{book.mediaType && (
									<span className="inline-flex h-9 items-center rounded-md border border-border bg-background px-3 font-medium text-xs uppercase tracking-wide">
										{book.mediaType}
									</span>
								)}
								{publishedYear && (
									<span className="inline-flex h-9 items-center rounded-md border border-border bg-background px-3 font-medium text-xs uppercase tracking-wide">
										{publishedYear}
									</span>
								)}
							</div>
						</section>

						<section className="grid gap-5 xl:grid-cols-[minmax(0,1.45fr)_340px]">
							<Card className="border-border bg-card shadow-sm">
								<CardHeader className="pb-2">
									<h2 className="font-semibold text-base">Synopsis</h2>
								</CardHeader>
								<CardContent>
									{book.description ? (
										<p className="leading-relaxed text-sm md:text-[15px]">
											{book.description}
										</p>
									) : (
										<p className="text-muted-foreground text-sm">
											No description available for this title.
										</p>
									)}
								</CardContent>
							</Card>

							<Card className="border-border bg-card shadow-sm">
								<CardHeader className="pb-2">
									<h2 className="font-semibold text-base">File</h2>
								</CardHeader>
								<CardContent className="space-y-2">
									<div className="rounded-md border border-border bg-background px-3 py-2 text-sm">
										<p className="mb-1 flex items-center gap-1.5 text-muted-foreground text-xs">
											<FileText className="size-3.5" />
											Name
										</p>
										<p className="break-all">{book.filename}</p>
									</div>
									{fileSize && (
										<div className="rounded-md border border-border bg-background px-3 py-2 text-sm">
											<p className="mb-1 flex items-center gap-1.5 text-muted-foreground text-xs">
												<HardDrive className="size-3.5" />
												Size
											</p>
											<p>{fileSize}</p>
										</div>
									)}
								</CardContent>
							</Card>
						</section>

						<Card className="border-border bg-card shadow-sm">
							<CardHeader className="pb-2">
								<h2 className="font-semibold text-base">Details</h2>
							</CardHeader>
							<CardContent>
								<div className="divide-y divide-border rounded-md border border-border bg-background">
									{detailRows.map((row) => (
										<div
											key={row.label}
											className="grid gap-1 px-4 py-3 md:grid-cols-[180px_minmax(0,1fr)] md:items-start"
										>
											<p className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
												{row.label}
											</p>
											<p className="text-sm">{row.value}</p>
										</div>
									))}
								</div>
							</CardContent>
						</Card>
					</main>
				</div>
			</div>
		</div>
	);
}
