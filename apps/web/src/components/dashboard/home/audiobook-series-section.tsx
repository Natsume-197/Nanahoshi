import { Headphones } from "lucide-react";
import { type JSX, memo } from "react";
import { type SeriesEntry, SeriesSection } from "./series-section";

export type AudiobookSeriesEntry = {
	id: number;
	name: string;
	audiobookCount: number;
	cover: string | null;
};

type AudiobookSeriesSectionProps = {
	series: AudiobookSeriesEntry[];
};

export const AudiobookSeriesSection = memo(function AudiobookSeriesSection({
	series,
}: AudiobookSeriesSectionProps): JSX.Element | null {
	const entries: SeriesEntry[] = series.map((s) => ({
		id: s.id,
		name: s.name,
		count: s.audiobookCount,
		cover: s.cover,
	}));

	return (
		<SeriesSection
			title="Audiobook series"
			showAllHref="/dashboard/audiobooks/series"
			seriesDetailPath="/dashboard/audiobooks/series/$seriesName"
			series={entries}
			icon={Headphones}
			aspectRatio="square"
			countLabel={["audiobook", "audiobooks"]}
		/>
	);
});
