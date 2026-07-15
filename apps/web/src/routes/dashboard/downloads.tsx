import { BookOpen, CloudArrowDown, Trash } from "@phosphor-icons/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import {
	CACHED_BOOKS_QUERY_KEY,
	useCachedBooks,
} from "@/hooks/use-cached-books";
import { clearCachedBooks, deleteCachedBook } from "@/lib/reader/db";
import { useReaderRouteTo } from "@/lib/reader-engine-store";
import {
	coverPresets,
	getCoverFilename,
	getCoverPresetUrl,
	getCoverSrcSet,
} from "@/utils/covers";
import { formatFileSize } from "@/utils/format";

export const Route = createFileRoute("/dashboard/downloads")({
	component: DownloadsPage,
	beforeLoad: ({ context }) => {
		if (!context.session) {
			throw redirect({ to: "/login" });
		}
	},
});

function DownloadsPage() {
	const queryClient = useQueryClient();
	const readerTo = useReaderRouteTo();
	const { data: books, isPending } = useCachedBooks();
	const invalidate = () =>
		queryClient.invalidateQueries({ queryKey: CACHED_BOOKS_QUERY_KEY });
	const removeOne = useMutation({
		mutationFn: deleteCachedBook,
		onSettled: invalidate,
	});
	const removeAll = useMutation({
		mutationFn: clearCachedBooks,
		onSettled: invalidate,
	});

	const totalKb = Math.round(
		(books ?? []).reduce((acc, book) => acc + book.sizeBytes, 0) / 1024,
	);

	return (
		<div className="mx-auto max-w-3xl px-4 py-6 md:px-6 md:py-8">
			<div className="flex items-end justify-between gap-4">
				<div>
					<h1 className="font-bold text-2xl tracking-tight">Downloads</h1>
					{books && books.length > 0 && (
						<p className="mt-1 text-muted-foreground text-sm">
							{books.length} {books.length === 1 ? "book" : "books"} ·{" "}
							{formatFileSize(totalKb)} on this device
						</p>
					)}
				</div>
				{books && books.length > 0 && (
					<Button
						variant="outline"
						size="sm"
						onClick={() => removeAll.mutate()}
						disabled={removeAll.isPending}
					>
						<Trash className="size-3.5" />
						Delete all
					</Button>
				)}
			</div>

			{!isPending && (!books || books.length === 0) && (
				<div className="flex flex-col items-center gap-3 py-24 text-center">
					<CloudArrowDown
						className="size-12 text-muted-foreground/40"
						weight="light"
					/>
					<p className="font-medium text-lg">No downloads yet</p>
					<p className="max-w-sm text-muted-foreground text-sm">
						Books you store offline appear here and can be read without a
						connection. Use “Store offline” on any book page.
					</p>
				</div>
			)}

			<ul className="mt-6 divide-y divide-border/60">
				{(books ?? []).map((book) => {
					const coverFilename = getCoverFilename(book.cover) ?? undefined;
					return (
						<li key={book.uuid} className="group relative flex gap-4 py-4">
							<Link
								to={readerTo}
								params={{ uuid: book.uuid }}
								aria-label={`Read ${book.title}`}
								className="absolute inset-0 z-0 rounded-lg transition-colors group-hover:bg-muted/40"
							/>
							<div className="pointer-events-none relative z-10 h-28 w-[4.7rem] shrink-0 overflow-hidden rounded-md bg-muted shadow-sm">
								{coverFilename ? (
									<img
										src={getCoverPresetUrl(coverFilename, coverPresets.small)}
										srcSet={getCoverSrcSet(
											coverFilename,
											coverPresets.small.widths,
										)}
										sizes="75px"
										alt=""
										className="h-full w-full object-cover"
										loading="lazy"
										decoding="async"
									/>
								) : (
									<div className="flex h-full items-center justify-center text-muted-foreground">
										<BookOpen className="size-6 opacity-50" weight="light" />
									</div>
								)}
							</div>
							<div className="pointer-events-none relative z-10 flex min-w-0 flex-1 flex-col justify-center gap-1">
								<p className="line-clamp-2 font-medium leading-snug">
									{book.title}
								</p>
								<p className="text-muted-foreground text-sm">
									{formatFileSize(Math.round(book.sizeBytes / 1024))} ·
									downloaded{" "}
									{new Date(book.storedAt).toLocaleDateString(undefined, {
										day: "numeric",
										month: "short",
									})}
								</p>
							</div>
							<div className="relative z-10 flex items-center">
								<Button
									variant="ghost"
									size="icon"
									aria-label={`Remove ${book.title} from downloads`}
									onClick={() => removeOne.mutate(book.uuid)}
									disabled={removeOne.isPending}
									className="text-muted-foreground hover:text-destructive"
								>
									<Trash className="size-4" />
								</Button>
							</div>
						</li>
					);
				})}
			</ul>
		</div>
	);
}
