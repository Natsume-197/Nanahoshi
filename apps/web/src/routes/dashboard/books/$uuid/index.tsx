import { env } from "@nanahoshi-v2/env/web";
import { createFileRoute, Link, useLoaderData } from "@tanstack/react-router";
import { BookOpen, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { client } from "@/utils/orpc";

export const Route = createFileRoute("/dashboard/books/$uuid/")({
	component: BookDetailPage,
});

function BookDetailPage() {
	const { book } = useLoaderData({ from: "/dashboard/books/$uuid" });

	const handleDownload = async () => {
		const { url } = await client.files.getSignedDownloadUrl({
			uuid: book.uuid,
		});
		window.open(url, "_blank");
	};

	const coverFilename = book.cover?.split("/").pop();
	const mainColor = book.mainColor ?? null;

	return (
		<div>
			{/* Hero gradient banner */}
			<div
				className="relative h-48 lg:h-64"
				style={{
					background: mainColor
						? `linear-gradient(to bottom, ${mainColor}33, transparent)`
						: "linear-gradient(to bottom, hsl(var(--accent) / 0.3), transparent)",
				}}
			/>

			<div className="mx-auto max-w-4xl px-6 lg:px-8">
				<div className="-mt-32 flex flex-col gap-8 md:flex-row lg:-mt-40">
					{/* Cover */}
					<div className="shrink-0">
						{coverFilename ? (
							<img
								src={`${env.VITE_SERVER_URL}/api/data/covers/${coverFilename}?width=300`}
								alt={book.title ?? book.filename}
								className="w-[200px] rounded-lg shadow-xl md:w-[260px] lg:w-[300px]"
							/>
						) : (
							<div className="flex h-[375px] w-[250px] items-center justify-center rounded-lg bg-muted text-muted-foreground shadow-xl md:h-[390px] md:w-[260px] lg:h-[450px] lg:w-[300px]">
								No cover
							</div>
						)}
					</div>

					{/* Info */}
					<div className="flex-1 space-y-6 pt-4 md:pt-12">
						<div>
							<h1 className="font-bold text-2xl tracking-tight lg:text-3xl">
								{book.title ?? book.filename}
							</h1>
							{book.subtitle && (
								<p className="mt-1 text-lg text-muted-foreground lg:text-xl">
									{book.subtitle}
								</p>
							)}
							{book.titleRomaji && (
								<p className="mt-1 text-muted-foreground text-sm">
									{book.titleRomaji}
								</p>
							)}
						</div>

						{book.description && (
							<p className="text-sm leading-relaxed">{book.description}</p>
						)}

						<div className="flex gap-2">
							<Link
								to="/dashboard/books/$uuid/read"
								params={{ uuid: book.uuid }}
							>
								<Button className="gap-2">
									<BookOpen className="size-4" />
									Read
								</Button>
							</Link>

							<Button
								onClick={handleDownload}
								variant={book.mediaType === "epub" ? "outline" : "default"}
								className="gap-2"
							>
								<Download className="size-4" />
								Download
							</Button>
						</div>
					</div>
				</div>

				{/* Details card */}
				<Card className="mt-8 mb-8">
					<CardHeader className="pb-3">
						<h2 className="font-semibold text-sm">Details</h2>
					</CardHeader>
					<CardContent>
						<dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
							{book.authors && book.authors.length > 0 && (
								<>
									<dt className="text-muted-foreground">Authors</dt>
									<dd>{book.authors.map((a: any) => a.name).join(", ")}</dd>
								</>
							)}
							{book.publisher && (
								<>
									<dt className="text-muted-foreground">Publisher</dt>
									<dd>{book.publisher.name}</dd>
								</>
							)}
							{book.languageCode && (
								<>
									<dt className="text-muted-foreground">Language</dt>
									<dd>{book.languageCode}</dd>
								</>
							)}
							{book.pageCount && (
								<>
									<dt className="text-muted-foreground">Pages</dt>
									<dd>{book.pageCount}</dd>
								</>
							)}
							{book.publishedDate && (
								<>
									<dt className="text-muted-foreground">Published</dt>
									<dd>{book.publishedDate}</dd>
								</>
							)}
							{(book.isbn13 || book.isbn10) && (
								<>
									<dt className="text-muted-foreground">ISBN</dt>
									<dd>{book.isbn13 ?? book.isbn10}</dd>
								</>
							)}
							{book.asin && (
								<>
									<dt className="text-muted-foreground">ASIN</dt>
									<dd>{book.asin}</dd>
								</>
							)}
							<dt className="text-muted-foreground">File</dt>
							<dd className="truncate">{book.filename}</dd>
							{book.filesizeKb && (
								<>
									<dt className="text-muted-foreground">Size</dt>
									<dd>
										{book.filesizeKb >= 1024
											? `${(book.filesizeKb / 1024).toFixed(1)} MB`
											: `${book.filesizeKb} KB`}
									</dd>
								</>
							)}
						</dl>
					</CardContent>
				</Card>
			</div>
		</div>
	);
}
