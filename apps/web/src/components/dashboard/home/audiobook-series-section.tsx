import { useQuery } from "@tanstack/react-query";
import { type JSX, memo } from "react";
import { m } from "@/paraglide/messages";
import { orpc } from "@/utils/orpc";
import { DASHBOARD_LIMIT } from "./section-skeleton";
import { type SeriesEntry, SeriesSection } from "./series-section";

export const AudiobookSeriesSection = memo(
	function AudiobookSeriesSection(): JSX.Element | null {
		const { data: series, isLoading } = useQuery(
			orpc.audiobooks.listSeries.queryOptions({
				input: { limit: DASHBOARD_LIMIT, sort: "random" },
			}),
		);

		if (isLoading) return null;
		if (!series || series.length === 0) return null;

		const entries: SeriesEntry[] = series.map((s) => ({
			uuid: s.uuid,
			name: s.name,
			count: s.audiobookCount,
			cover: s.cover,
		}));

		return (
			<SeriesSection
				title={m["home.audiobook_series"]()}
				showAllHref="/dashboard/series"
				showAllState={{ format: "audiobooks" }}
				seriesDetailPath="/dashboard/audiobooks/series/$uuid"
				series={entries}
				aspectRatio="square"
				countMessage={m["home.series_audiobook_count"]}
			/>
		);
	},
);
