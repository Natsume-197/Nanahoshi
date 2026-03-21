import { X } from "lucide-react";
import { useMemo, useState } from "react";
import {
	useReaderDispatch,
	useReaderState,
	useReaderUI,
} from "@/context/reader-context";
import type { Bookmark } from "@/lib/epub/types";
import { cn } from "@/lib/utils";

export function ReaderTocPanel() {
	const { sideBar } = useReaderUI();
	const dispatch = useReaderDispatch();

	if (sideBar !== "toc" && sideBar !== "bookmarks") return null;

	return (
		<>
			{/* Backdrop */}
			<div
				className="fixed inset-0 z-40 bg-black/50"
				onClick={() => dispatch.setSidebar(null)}
				onKeyDown={() => {}}
			/>

			{/* Panel */}
			<div className="fixed top-0 left-0 z-50 h-full w-80 overflow-y-auto border-border border-r bg-background p-6 shadow-lg">
				<div className="mb-4 flex items-center justify-between">
					<h2 className="font-semibold text-lg">
						{sideBar === "toc" ? "Table of Contents" : "Bookmarks"}
					</h2>
					<button
						type="button"
						onClick={() => dispatch.setSidebar(null)}
						className="rounded-md p-1 text-muted-foreground hover:text-foreground"
					>
						<X className="size-5" strokeWidth={1.5} />
					</button>
				</div>

				{sideBar === "toc" && <TocContent />}
				{sideBar === "bookmarks" && <BookmarksContent />}
			</div>
		</>
	);
}

function TocContent() {
	const state = useReaderState();
	const dispatch = useReaderDispatch();

	return (
		<div className="space-y-1">
			{state.book.nav.map((item, i) => (
				<button
					key={`${item.file ?? ""}-${i}`}
					type="button"
					onClick={() => {
						if (item.file) {
							dispatch.navigationGoTo(item.file);
							dispatch.setSidebar(null);
						}
					}}
					className={cn(
						"block w-full rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent",
						!item.file && "cursor-default opacity-60",
					)}
				>
					{item.text}
					{item.totalChars !== undefined && (
						<span className="ml-2 text-xs opacity-50">
							{item.totalChars.toLocaleString()} chars
						</span>
					)}
				</button>
			))}
		</div>
	);
}

function BookmarksContent() {
	const state = useReaderState();
	const dispatch = useReaderDispatch();
	const [sortOption, setSortOption] = useState("added-newest");

	const sortedBookmarks = useMemo(() => {
		const bookmarks = [...state.book.bookmarks];
		switch (sortOption) {
			case "added-oldest":
				return bookmarks;
			case "paragraph-asc":
				return bookmarks.sort((a, b) => a.paragraphId - b.paragraphId);
			case "paragraph-desc":
				return bookmarks.sort((a, b) => b.paragraphId - a.paragraphId);
			case "added-newest":
			default:
				return bookmarks.reverse();
		}
	}, [state.book.bookmarks, sortOption]);

	const handleBookmarkClick = (b: Bookmark) => {
		dispatch.setSidebar(null);
		dispatch.bookmarkGoTo(b);
	};

	return (
		<div>
			<div className="mb-3 flex items-center gap-2">
				<label
					htmlFor="bookmark-sort"
					className="text-muted-foreground text-xs"
				>
					Sort by:
				</label>
				<select
					id="bookmark-sort"
					value={sortOption}
					onChange={(e) => setSortOption(e.target.value)}
					className="rounded-md border border-border bg-background px-2 py-1 text-xs"
				>
					<option value="added-newest">Added (Newest)</option>
					<option value="added-oldest">Added (Oldest)</option>
					<option value="paragraph-asc">Paragraph (Ascending)</option>
					<option value="paragraph-desc">Paragraph (Descending)</option>
				</select>
			</div>

			<div className="space-y-1">
				{sortedBookmarks.map((b, i) => (
					<button
						key={b.paragraphId}
						type="button"
						onClick={() => handleBookmarkClick(b)}
						className="block w-full rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent"
					>
						<span className="text-muted-foreground">{i + 1}. </span>
						<span
							dangerouslySetInnerHTML={{
								__html: b.content.trim(),
							}}
						/>
					</button>
				))}
				{sortedBookmarks.length === 0 && (
					<p className="py-4 text-center text-muted-foreground text-sm">
						No bookmarks yet
					</p>
				)}
			</div>
		</div>
	);
}
