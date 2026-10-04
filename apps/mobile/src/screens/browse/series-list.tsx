import { FlashList } from "@shopify/flash-list";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { RefreshControl, View } from "react-native";
import { ChipRow } from "@/components/chip";
import { icons } from "@/components/icon";
import { SeriesTile, type SeriesTileItem } from "@/components/series-tile";
import { SortButton } from "@/components/sort-button";
import {
	EmptyState,
	ErrorState,
	ShelfSkeleton,
	Spinner,
} from "@/components/states";
import { useGridTileWidth } from "@/hooks/use-grid-tile-width";
import { t } from "@/lib/i18n";
import { useApi } from "@/providers/app-provider";
import { space } from "@/theme";

type Format = "ebook" | "audiobook";
type Sort = "recent" | "name" | "books";
const PAGE = 30;

export function SeriesList({ initialFormat }: { initialFormat?: Format }) {
	const { orpc } = useApi();
	const formats = useQuery(
		orpc.books.availableFormats.queryOptions({ staleTime: 60_000 }),
	);
	const [picked, setPicked] = useState<Format>(initialFormat ?? "ebook");
	const [sort, setSort] = useState<Sort>("recent");
	const both = !!formats.data?.books && !!formats.data?.audiobooks;
	const format: Format =
		formats.data && !formats.data.books
			? "audiobook"
			: formats.data && !formats.data.audiobooks
				? "ebook"
				: picked;
	const gap = space.sm;
	const width = useGridTileWidth(2, gap);

	const next = (last: unknown[], pages: unknown[][]) =>
		last.length === PAGE ? pages.length * PAGE : undefined;
	const books = useInfiniteQuery({
		...orpc.series.list.infiniteOptions({
			input: (cursor: number) => ({ sort, cursor, limit: PAGE }),
			initialPageParam: 0,
			getNextPageParam: next,
		}),
		enabled: format === "ebook",
	});
	const audio = useInfiniteQuery({
		...orpc.audiobooks.listSeries.infiniteOptions({
			input: (cursor: number) => ({ sort, cursor, limit: PAGE }),
			initialPageParam: 0,
			getNextPageParam: next,
		}),
		enabled: format === "audiobook",
	});
	const query = format === "audiobook" ? audio : books;
	const items: SeriesTileItem[] =
		format === "audiobook"
			? (audio.data?.pages.flat() ?? []).map((item) => ({
					uuid: item.uuid,
					name: item.name,
					cover: item.cover,
					color: item.coverColor,
					subtitle: t("home.series_audiobook_count", {
						count: item.audiobookCount,
					}),
				}))
			: (books.data?.pages.flat() ?? []).map((item) => ({
					uuid: item.uuid,
					name: item.name,
					cover: item.cover,
					color: item.coverColor,
					subtitle: t("home.series_book_count", { count: item.bookCount }),
				}));

	return (
		<FlashList
			data={items}
			numColumns={2}
			contentInsetAdjustmentBehavior="automatic"
			keyExtractor={(item) => item.uuid}
			contentContainerStyle={{
				paddingHorizontal: space.lg - gap / 2,
				paddingBottom: space.xxl,
			}}
			onEndReachedThreshold={0.6}
			onEndReached={() => {
				if (query.hasNextPage && !query.isFetchingNextPage)
					void query.fetchNextPage();
			}}
			refreshControl={
				<RefreshControl
					refreshing={query.isRefetching && !query.isFetchingNextPage}
					onRefresh={() => query.refetch()}
				/>
			}
			ListHeaderComponent={
				<View
					style={{
						gap: space.md,
						paddingTop: space.sm,
						paddingBottom: space.lg,
						marginHorizontal: -(space.lg - gap / 2),
					}}
				>
					{both ? (
						<ChipRow
							value={format}
							onChange={setPicked}
							options={[
								{ value: "ebook", label: t("nav.books") },
								{ value: "audiobook", label: t("nav.audiobooks") },
							]}
						/>
					) : null}
					<View style={{ paddingHorizontal: space.lg }}>
						<SortButton
							value={sort}
							onChange={setSort}
							options={[
								{ value: "recent", label: t("mobile.library.recents") },
								{ value: "name", label: t("common.title") },
								{ value: "books", label: t("mobile.sort.size") },
							]}
						/>
					</View>
				</View>
			}
			ListEmptyComponent={
				query.isError ? (
					<ErrorState onRetry={() => query.refetch()} />
				) : query.isPending ? (
					<ShelfSkeleton width={width} audio={format === "audiobook"} />
				) : (
					<EmptyState icon={icons.series} title={t("mobile.library.empty")} />
				)
			}
			ListFooterComponent={query.isFetchingNextPage ? <Spinner /> : null}
			renderItem={({ item }) => (
				<View style={{ paddingHorizontal: gap / 2, paddingBottom: space.xl }}>
					<SeriesTile
						item={item}
						kind={format === "audiobook" ? "audiobook" : "book"}
						width={width}
					/>
				</View>
			)}
		/>
	);
}
