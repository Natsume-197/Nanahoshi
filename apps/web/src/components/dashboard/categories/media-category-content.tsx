import { type JSX, memo } from "react";
import { BookContextMenuRoot } from "@/components/books/book-context-menu";
import { PAGE_GUTTER } from "@/lib/page-layout";
import { cn } from "@/lib/utils";
import { AudiobookSeriesSection } from "../home/audiobook-series-section";
import { BookSeriesSection } from "../home/book-series-section";
import { ContinueSection } from "../home/continue-section";
import { PopularSection } from "../home/popular-section";
import { RandomAudiobooksSection } from "../home/random-audiobooks-section";
import { RandomBooksSection } from "../home/random-books-section";
import { RecentlyAddedSection } from "../home/recently-added-section";
import { RecommendationsSection } from "../home/recommendation-mixes";

export type MediaCategory = "books" | "audiobooks";

const CATEGORY_SHELL_CLASS = "relative flex flex-col pt-3 pb-8 md:pt-4";
const CATEGORY_STACK_CLASS = "flex flex-col gap-8 md:gap-12";

export const MediaCategoryContent = memo(function MediaCategoryContent({
	category,
}: {
	category: MediaCategory;
}): JSX.Element {
	const isBooks = category === "books";

	return (
		<BookContextMenuRoot mediaType={isBooks ? "ebook" : "audiobook"}>
			<div className={cn(PAGE_GUTTER, CATEGORY_SHELL_CLASS)}>
				<div className={CATEGORY_STACK_CLASS}>
					<ContinueSection format={category} />
					<RecentlyAddedSection format={category} />
					<RecommendationsSection format={category} />
					<PopularSection format={category} />
					{isBooks ? <BookSeriesSection /> : <AudiobookSeriesSection />}
					{isBooks ? <RandomBooksSection /> : <RandomAudiobooksSection />}
				</div>
			</div>
		</BookContextMenuRoot>
	);
});
