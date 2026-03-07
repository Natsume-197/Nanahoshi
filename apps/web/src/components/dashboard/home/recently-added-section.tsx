import { Link } from "@tanstack/react-router";
import { BookOpen } from "lucide-react";
import type { JSX } from "react";
import { BookCard } from "@/components/books/book-card";
import { Button } from "@/components/ui/button";
import { ScrollSection } from "@/components/shared/scroll-section";
import { coverPresets } from "@/utils/covers";
import { DashboardContextMenuBook } from "./dashboard-context-menu-book";

export type RecentlyAddedBook = {
	uuid: string;
	title: string | null;
	filename: string;
	cover: string | null;
	mainColor?: string | null;
	authors?: { name: string }[];
};

type RecentlyAddedSectionProps = {
	books: RecentlyAddedBook[];
	prioritizeFirstCover: boolean;
};

export function RecentlyAddedSection({
	books,
	prioritizeFirstCover,
}: RecentlyAddedSectionProps): JSX.Element {
	if (books.length === 0) {
		return (
			<div className="flex min-h-[280px] flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border/70 bg-card/30 px-6 text-center">
				<div className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
					<BookOpen className="size-5" />
				</div>
				<div className="flex flex-col gap-1">
					<h2 className="font-semibold text-lg">No books yet</h2>
					<p className="max-w-md text-muted-foreground text-sm">
						Add a library path in settings to start scanning your books.
					</p>
				</div>
				<Link to="/dashboard/settings/libraries">
					<Button variant="outline" size="sm" className="mt-2">
						Go to library settings
					</Button>
				</Link>
			</div>
		);
	}

	return (
		<ScrollSection title="Recently added" showAllHref="/dashboard/search">
			{books.map((book, index) => (
				<DashboardContextMenuBook key={book.uuid} bookUuid={book.uuid}>
					<BookCard
						uuid={book.uuid}
						title={book.title}
						filename={book.filename}
						cover={book.cover}
						authors={book.authors}
						contextMenuEnabled={false}
						priority={prioritizeFirstCover && index === 0}
						coverPreset={coverPresets.small}
					/>
				</DashboardContextMenuBook>
			))}
		</ScrollSection>
	);
}
