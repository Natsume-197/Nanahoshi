import { env } from "@nanahoshi-v2/env/web";
import {
	createFileRoute,
	Link,
	redirect,
	useLoaderData,
} from "@tanstack/react-router";
import { ArrowLeft, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { getBook } from "@/functions/get-book";
import { getUser } from "@/functions/get-user";
import { client } from "@/utils/orpc";

export const Route = createFileRoute("/dashboard/books/$uuid")({
	component: BookDetailPage,
	beforeLoad: async () => {
		const session = await getUser();
		if (!session) {
			throw redirect({ to: "/login" });
		}
		return { session };
	},
	loader: async ({ params }) => {
		const book = await getBook({ data: params.uuid });
		return { book };
	},
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

	return (
		<div className="mx-auto max-w-4xl space-y-6 p-6">
			<Link
				to="/dashboard"
				className="inline-flex items-center gap-1 text-muted-foreground text-sm transition-colors hover:text-foreground"
			>
				<ArrowLeft className="size-4" />
				Back to dashboard
			</Link>

			<div className="flex flex-col gap-8 md:flex-row">
				{/* Cover */}
				<div className="shrink-0">
					{coverFilename ? (
						<img
							src={`${env.VITE_SERVER_URL}/api/data/covers/${coverFilename}?width=300`}
							alt={book.title ?? book.filename}
							className="w-[300px] rounded-lg shadow-md"
						/>
					) : (
						<div className="flex h-[450px] w-[300px] items-center justify-center rounded-lg bg-muted text-muted-foreground">
							No cover
						</div>
					)}
				</div>

				{/* Info */}
				<div className="flex-1 space-y-6">
					<div>
						<h1 className="font-bold text-3xl tracking-tight">
							{book.title ?? book.filename}
						</h1>
						{book.subtitle && (
							<p className="mt-1 text-muted-foreground text-xl">
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

					<Card>
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

					<Button onClick={handleDownload} className="gap-2">
						<Download className="size-4" />
						Download
					</Button>
				</div>
			</div>
		</div>
	);
}
