import { type JSX, memo } from "react";
import { BookCardShell } from "@/components/books/book-card-shell";
import { ScrollSection } from "@/components/shared/scroll-section";
import { coverPresets, getCoverFilename } from "@/utils/covers";
import { DASHBOARD_BOOK_TILE_CLASS } from "./section-skeleton";

export type SeriesEntry = {
	id: number;
	name: string;
	count: number;
	cover: string | null;
};

type SeriesSectionProps = {
	title: string;
	showAllHref: string;
	seriesDetailPath: string;
	series: SeriesEntry[];
	aspectRatio?: "square" | "book";
	countLabel: [string, string];
};

export const SeriesSection = memo(function SeriesSection({
	title,
	showAllHref,
	seriesDetailPath,
	series,
	aspectRatio = "book",
	countLabel,
}: SeriesSectionProps): JSX.Element | null {
	if (series.length === 0) {
		return null;
	}

	return (
		<ScrollSection title={title} showAllHref={showAllHref}>
			{series.map((s) => (
				<div key={s.id} className={DASHBOARD_BOOK_TILE_CLASS}>
					<BookCardShell
						linkProps={{
							to: seriesDetailPath,
							params: { seriesName: s.name },
							preload: "intent",
						}}
						ariaLabel={s.name}
						coverFilename={getCoverFilename(s.cover) ?? undefined}
						coverPreset={coverPresets.small}
						square={aspectRatio === "square"}
						title={s.name}
						subtitle={`${s.count} ${s.count === 1 ? countLabel[0] : countLabel[1]}`}
					/>
				</div>
			))}
		</ScrollSection>
	);
});
