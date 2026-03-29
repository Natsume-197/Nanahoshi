import { Library } from "lucide-react";
import { type JSX, memo } from "react";
import { type SeriesEntry, SeriesSection } from "./series-section";

export type BookSeriesEntry = {
	id: number;
	name: string;
	bookCount: number;
	cover: string | null;
};

type BookSeriesSectionProps = {
	series: BookSeriesEntry[];
};

export const BookSeriesSection = memo(function BookSeriesSection({
	series,
}: BookSeriesSectionProps): JSX.Element | null {
	const entries: SeriesEntry[] = series.map((s) => ({
		id: s.id,
		name: s.name,
		count: s.bookCount,
		cover: s.cover,
	}));

	return (
		<SeriesSection
			title="Book series"
			showAllHref="/dashboard/series"
			seriesDetailPath="/dashboard/series/$seriesName"
			series={entries}
			icon={Library}
			countLabel={["book", "books"]}
		/>
	);
});
