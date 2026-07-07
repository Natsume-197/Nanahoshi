import { useQuery } from "@tanstack/react-query";
import { type JSX, memo } from "react";
import { m } from "@/paraglide/messages";
import { orpc } from "@/utils/orpc";
import { DASHBOARD_LIMIT, SectionSkeleton } from "./section-skeleton";
import { type SeriesEntry, SeriesSection } from "./series-section";

export const BookSeriesSection = memo(
	function BookSeriesSection(): JSX.Element | null {
		const { data: series, isLoading } = useQuery(
			orpc.series.list.queryOptions({
				input: { limit: DASHBOARD_LIMIT, sort: "random" },
			}),
		);

		if (isLoading) return <SectionSkeleton />;
		if (!series || series.length === 0) return null;

		const entries: SeriesEntry[] = series.map((s) => ({
			uuid: s.uuid,
			name: s.name,
			count: s.bookCount,
			cover: s.cover,
			author: s.author,
		}));

		return (
			<SeriesSection
				title={m["home.book_series"]()}
				showAllHref="/dashboard/series"
				seriesDetailPath="/dashboard/series/$uuid"
				series={entries}
				countMessage={m["home.series_book_count"]}
			/>
		);
	},
);
