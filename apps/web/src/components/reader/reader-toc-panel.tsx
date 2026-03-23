import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from "@/components/ui/sheet";
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

	const isOpen = sideBar === "toc" || sideBar === "bookmarks";

	return (
		<Sheet
			open={isOpen}
			onOpenChange={(open) => {
				if (!open) dispatch.setSidebar(null);
			}}
		>
			<SheetContent side="left" showCloseButton={false} className="w-80">
				<SheetHeader className="sr-only">
					<SheetTitle>
						{sideBar === "toc" ? "Table of Contents" : "Bookmarks"}
					</SheetTitle>
					<SheetDescription>Navigate through the book</SheetDescription>
				</SheetHeader>

				<div className="p-6">
					<div className="mb-4 flex items-center justify-between">
						<h2 className="font-semibold text-lg">
							{sideBar === "toc" ? "Table of Contents" : "Bookmarks"}
						</h2>
					</div>

					{sideBar === "toc" && <TocContent />}
					{sideBar === "bookmarks" && <BookmarksContent />}
				</div>
			</SheetContent>
		</Sheet>
	);
}

function TocContent() {
	const state = useReaderState();
	const dispatch = useReaderDispatch();

	return (
		<div className="space-y-1">
			{state.book.nav.map((item, i) => (
				<Button
					key={`${item.file ?? ""}-${i}`}
					variant="ghost"
					className={cn(
						"h-auto w-full justify-start px-2 py-1.5 text-left text-sm",
						!item.file && "cursor-default opacity-60",
					)}
					onClick={() => {
						if (item.file) {
							dispatch.navigationGoTo(item.file);
							dispatch.setSidebar(null);
						}
					}}
				>
					{item.text}
					{item.totalChars !== undefined && (
						<span className="ml-2 text-xs opacity-50">
							{item.totalChars.toLocaleString()} chars
						</span>
					)}
				</Button>
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
				<Label className="text-muted-foreground text-xs">Sort by:</Label>
				<Select value={sortOption} onValueChange={setSortOption}>
					<SelectTrigger className="h-7 text-xs">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="added-newest">Added (Newest)</SelectItem>
						<SelectItem value="added-oldest">Added (Oldest)</SelectItem>
						<SelectItem value="paragraph-asc">Paragraph (Ascending)</SelectItem>
						<SelectItem value="paragraph-desc">
							Paragraph (Descending)
						</SelectItem>
					</SelectContent>
				</Select>
			</div>

			<div className="space-y-1">
				{sortedBookmarks.map((b, i) => (
					<Button
						key={b.paragraphId}
						variant="ghost"
						className="h-auto w-full justify-start px-2 py-1.5 text-left text-sm"
						onClick={() => handleBookmarkClick(b)}
					>
						<span className="text-muted-foreground">{i + 1}. </span>
						<span
							dangerouslySetInnerHTML={{
								__html: b.content.trim(),
							}}
						/>
					</Button>
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
