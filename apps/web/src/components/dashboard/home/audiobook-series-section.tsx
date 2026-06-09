import { useQuery } from "@tanstack/react-query";
import { type JSX, memo } from "react";
import { orpc } from "@/utils/orpc";
import { DASHBOARD_LIMIT } from "./section-skeleton";
import { type SeriesEntry, SeriesSection } from "./series-section";

export const AudiobookSeriesSection = memo(
	function AudiobookSeriesSection(): JSX.Element | null {
		const { data: series, isLoading } = useQuery(
			orpc.audiobooks.listSeries.queryOptions({
				input: { limit: DASHBOARD_LIMIT },
			}),
		);

		if (isLoading) return null;
		if (!series || series.length === 0) return null;

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
				aspectRatio="square"
				countLabel={["audiobook", "audiobooks"]}
			/>
		);
	},
);
