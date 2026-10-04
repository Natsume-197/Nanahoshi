import { useQuery } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { SearchField } from "@/components/search-field";
import { SortButton } from "@/components/sort-button";
import { Text } from "@/components/text";
import { TitleGrid } from "@/components/title-grid";
import type { TileItem } from "@/components/title-tile";
import { formatDuration, joinNames } from "@/lib/format";
import { t } from "@/lib/i18n";
import { htmlToText } from "@/lib/plain-text";
import type { MediaKind } from "@/lib/routes";
import { useApi } from "@/providers/app-provider";
import { space } from "@/theme";
import { Description } from "./parts";

type Sort = "position" | "title" | "author";
type Row = TileItem & { position: number | null; author: string };

/** The web's series page (EntityBooksView): name as the title, a count and
 * average-rating line, search + sort, then the volumes as a grid. The
 * audiobook variant is the same page with square covers. */
export function SeriesDetail({
	uuid,
	kind,
}: {
	uuid: string;
	kind: MediaKind;
}) {
	const { orpc } = useApi();
	const [sort, setSort] = useState<Sort>("position");
	const [query, setQuery] = useState("");
	const series = useQuery(
		orpc.series.getByUuid.queryOptions({ input: { uuid }, staleTime: 30_000 }),
	);
	const rating = useQuery({
		...orpc.series.ratingStats.queryOptions({
			input: { uuid },
			staleTime: 60_000,
		}),
		enabled: kind === "book",
	});
	const books = useQuery({
		...orpc.books.listBySeries.queryOptions({
			input: { seriesUuid: uuid },
			staleTime: 30_000,
		}),
		enabled: kind === "book",
	});
	const audiobooks = useQuery({
		...orpc.audiobooks.listBySeries.queryOptions({
			input: { seriesUuid: uuid },
			staleTime: 30_000,
		}),
		enabled: kind === "audiobook",
	});
	const list = kind === "audiobook" ? audiobooks : books;

	const rows: Row[] =
		kind === "audiobook"
			? (audiobooks.data ?? []).map((item) => ({
					uuid: item.uuid,
					kind: "audiobook",
					title: item.title,
					cover: item.cover,
					color: item.mainColor,
					position: item.position ?? null,
					author: "",
					subtitle: item.sequence
						? t("mobile.series.book_n", { n: item.sequence })
						: formatDuration(item.duration),
				}))
			: (books.data ?? []).map((item) => ({
					uuid: item.uuid,
					kind: "book",
					title: item.title,
					cover: item.cover,
					color: item.mainColor,
					position: item.position ?? null,
					author: item.authors[0]?.name ?? "",
					subtitle: joinNames(item.authors),
				}));

	const needle = query.toLowerCase();
	const items = rows
		.filter(
			(row) => !needle || (row.title ?? "").toLowerCase().includes(needle),
		)
		.sort((a, b) =>
			sort === "title"
				? (a.title ?? "").localeCompare(b.title ?? "")
				: sort === "author"
					? a.author.localeCompare(b.author)
					: (a.position ?? Number.POSITIVE_INFINITY) -
						(b.position ?? Number.POSITIVE_INFINITY),
		);

	const total = rows.length;
	const average = rating.data?.average;
	const subtitle = [
		total
			? kind === "audiobook"
				? t("mobile.series.titles", { count: total })
				: t("entity_page.series_subtitle", { count: total })
			: null,
		average != null ? `★ ${average.toFixed(1)}` : null,
	]
		.filter(Boolean)
		.join("  ·  ");

	return (
		<>
			<Stack.Screen
				options={{
					title: series.data?.name ?? t("entity_page.series_fallback"),
				}}
			/>
			<TitleGrid
				items={items}
				query={{
					isPending: list.isPending,
					isError: list.isError || series.isError,
					isFetchingNextPage: false,
					fetchStatus: list.fetchStatus,
					data: list.data,
					hasNextPage: false,
					fetchNextPage: () => undefined,
					refetch: () => {
						void series.refetch();
						return list.refetch();
					},
				}}
				emptyTitle={
					query ? t("settings.no_matches") : t("entity_page.empty_title")
				}
				emptyMessage={
					query
						? t("entity_page.series_no_query_matches", { query })
						: t("entity_page.series_empty_desc")
				}
				header={
					<View
						style={{
							gap: space.md,
							paddingTop: space.xs,
							paddingBottom: space.lg,
							paddingHorizontal: space.sm / 2,
						}}
					>
						{subtitle ? (
							<Text variant="subhead" tone="secondary">
								{subtitle}
							</Text>
						) : null}
						{series.data?.description ? (
							<Description text={htmlToText(series.data.description)} />
						) : null}
						{total > 1 ? (
							<>
								<SearchField
									placeholder={t("entity_page.search_placeholder")}
									onQuery={setQuery}
								/>
								<SortButton
									value={sort}
									onChange={setSort}
									options={[
										{
											value: "position",
											label: t("entity_page.sort_series_order"),
										},
										{ value: "title", label: t("common.title") },
										...(kind === "book"
											? [
													{
														value: "author" as const,
														label: t("common.author"),
													},
												]
											: []),
									]}
								/>
							</>
						) : null}
					</View>
				}
			/>
		</>
	);
}
