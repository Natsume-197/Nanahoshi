import { type JSX, memo } from "react";
import { AuthorLinkList } from "@/components/books/author-link-list";
import { BookCardShell } from "@/components/books/book-card-shell";
import { SeriesContextMenu } from "@/components/series/series-context-menu";
import { ScrollSection } from "@/components/shared/scroll-section";
import { coverPresets, getCoverFilename } from "@/utils/covers";
import { DASHBOARD_BOOK_TILE_CLASS } from "./section-skeleton";

export type SeriesEntry = {
	uuid: string;
	name: string;
	count: number;
	cover: string | null;
	author?: { id: number; uuid?: string; name: string } | null;
};

type SeriesSectionProps = {
	title: string;
	showAllHref?: string;
	seriesDetailPath: string;
	series: SeriesEntry[];
	aspectRatio?: "square" | "book";
	/** Localized "{count} book(s)" plural message (e.g. m.home_series_book_count). */
	countMessage: (inputs: { count: number }) => string;
};

export const SeriesSection = memo(function SeriesSection({
	title,
	showAllHref,
	seriesDetailPath,
	series,
	aspectRatio = "book",
	countMessage,
}: SeriesSectionProps): JSX.Element | null {
	if (series.length === 0) {
		return null;
	}

	const showAuthor = series.some((s) => s.author);

	return (
		<ScrollSection title={title} showAllHref={showAllHref}>
			{series.map((s) => (
				<SeriesContextMenu
					key={s.uuid}
					href={seriesDetailPath.replace("$uuid", s.uuid)}
				>
					<div className={DASHBOARD_BOOK_TILE_CLASS}>
						<BookCardShell
							linkProps={{
								to: seriesDetailPath,
								params: { uuid: s.uuid },
								preload: "intent",
							}}
							ariaLabel={s.name}
							coverFilename={getCoverFilename(s.cover) ?? undefined}
							coverPreset={coverPresets.small}
							square={aspectRatio === "square"}
							title={s.name}
							subtitleLines={showAuthor ? 2 : 1}
							subtitle={
								<>
									<span className="line-clamp-1 block">
										{countMessage({ count: s.count })}
									</span>
									{s.author ? (
										<span className="pointer-events-auto line-clamp-1 block w-fit max-w-full">
											<AuthorLinkList
												authors={[s.author]}
												linkClassName="transition-colors hover:text-foreground"
											/>
										</span>
									) : null}
								</>
							}
						/>
					</div>
				</SeriesContextMenu>
			))}
		</ScrollSection>
	);
});
