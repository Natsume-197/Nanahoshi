import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { View } from "react-native";
import { ChipRow } from "@/components/chip";
import { SortButton } from "@/components/sort-button";
import { TitleGrid } from "@/components/title-grid";
import type { TileItem } from "@/components/title-tile";
import { joinNames } from "@/lib/format";
import { t } from "@/lib/i18n";
import { useApi } from "@/providers/app-provider";
import { space } from "@/theme";

type Format = "ebook" | "audiobook";
type Sort = "recent" | "title" | "author" | "rating";
const PAGE = 30;

/** The web's catalog (/dashboard/books): every title the user can reach,
 * per format, sortable, as a two-column grid. */
export function Catalog({ initialFormat }: { initialFormat?: Format }) {
	const { orpc } = useApi();
	const formats = useQuery(
		orpc.books.availableFormats.queryOptions({ staleTime: 60_000 }),
	);
	const [format, setFormat] = useState<Format>(initialFormat ?? "ebook");
	const [sort, setSort] = useState<Sort>("recent");
	const both = !!formats.data?.books && !!formats.data?.audiobooks;
	const effective: Format =
		formats.data && !formats.data.books
			? "audiobook"
			: formats.data && !formats.data.audiobooks
				? "ebook"
				: format;

	const titles = useInfiniteQuery(
		orpc.books.listAll.infiniteOptions({
			input: (cursor: number) => ({
				mediaType: effective,
				sort,
				cursor,
				limit: PAGE,
			}),
			initialPageParam: 0,
			getNextPageParam: (last, pages) =>
				last.length === PAGE ? pages.length * PAGE : undefined,
		}),
	);
	const items: TileItem[] = (titles.data?.pages.flat() ?? []).map((item) => ({
		uuid: item.uuid,
		kind: item.mediaType === "audiobook" ? "audiobook" : "book",
		title: item.title,
		cover: item.cover,
		color: item.mainColor,
		subtitle: joinNames(item.authors, 1),
	}));

	return (
		<TitleGrid
			items={items}
			query={titles}
			header={
				<View
					style={{
						gap: space.md,
						paddingTop: space.sm,
						paddingBottom: space.lg,
						marginHorizontal: -(space.lg - space.sm / 2),
					}}
				>
					{both ? (
						<ChipRow
							value={effective}
							onChange={setFormat}
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
								{ value: "title", label: t("common.title") },
								{ value: "author", label: t("common.author") },
								{ value: "rating", label: t("mobile.sort.rating") },
							]}
						/>
					</View>
				</View>
			}
		/>
	);
}
