import { useQuery } from "@tanstack/react-query";
import { type JSX, memo } from "react";
import { m } from "@/paraglide/messages";
import { orpc } from "@/utils/orpc";
import { DASHBOARD_LIMIT } from "./section-skeleton";
import { type SeriesEntry, SeriesSection } from "./series-section";

export const AudiobookSeriesSection = memo(
	function AudiobookSeriesSection(): JSX.Element | null {
		const { data: series, isLoading } = useQuery({
			...orpc.audiobooks.listSeries.queryOptions({
				input: { limit: DASHBOARD_LIMIT, sort: "random" },
			}),
			// Random discovery row: pin the shuffle for the session so it never
			// re-randomizes on refocus/reconnect/remount (matches RandomAudiobooks).
			staleTime: Number.POSITIVE_INFINITY,
			gcTime: Number.POSITIVE_INFINITY,
			refetchOnWindowFocus: false,
			refetchOnReconnect: false,
		});

		if (isLoading) return null;
		if (!series || series.length === 0) return null;

		const entries: SeriesEntry[] = series.map((s) => ({
			uuid: s.uuid,
			name: s.name,
			count: s.audiobookCount,
			cover: s.cover,
			color: s.coverColor,
			author: s.author,
		}));

		return (
			<SeriesSection
				title={m["home.audiobook_series"]()}
				showAllHref="/dashboard/series"
				showAllState={{ format: "audiobooks" }}
				seriesDetailPath="/dashboard/audiobooks/series/$uuid"
				series={entries}
				restoreId="series-audiobooks"
				aspectRatio="square"
				countMessage={m["home.series_audiobook_count"]}
			/>
		);
	},
);
