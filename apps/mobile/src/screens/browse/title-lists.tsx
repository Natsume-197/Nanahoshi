import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { TitleGrid } from "@/components/title-grid";
import type { TileItem } from "@/components/title-tile";
import { joinNames } from "@/lib/format";
import { t } from "@/lib/i18n";
import { type ShelfFormat, type ShelfStatus, shelfMeta } from "@/lib/shelves";
import { useApi } from "@/providers/app-provider";

const PAGE = 40;
const offsetNext = (last: unknown[], pages: unknown[][]) =>
	last.length === PAGE ? pages.length * PAGE : undefined;

/** Every title in one library (the web's /dashboard/libraries/$uuid). */
export function LibraryTitles({ uuid }: { uuid: string }) {
	const { orpc } = useApi();
	const overview = useQuery(orpc.libraries.getLibrariesOverview.queryOptions());
	const audio =
		overview.data?.find((library) => library.uuid === uuid)?.mediaType ===
		"audiobook";
	const titles = useInfiniteQuery(
		orpc.books.listByLibrary.infiniteOptions({
			input: (cursor: number) => ({
				libraryUuid: uuid,
				cursor,
				limit: PAGE,
				sort: "recent",
			}),
			initialPageParam: 0,
			getNextPageParam: offsetNext,
		}),
	);
	const items: TileItem[] = (titles.data?.pages.flat() ?? []).map((item) => ({
		uuid: item.uuid,
		kind: audio ? "audiobook" : "book",
		title: item.title,
		cover: item.cover,
		color: item.mainColor,
		subtitle: joinNames(item.authors, 1),
	}));
	return <TitleGrid items={items} query={titles} />;
}

/** A reading-status shelf (the web's /dashboard/shelves/$status). */
export function ShelfTitles({
	status,
	format,
}: {
	status: ShelfStatus;
	format: ShelfFormat;
}) {
	const { orpc } = useApi();
	const shelf = useQuery(
		orpc.shelves.list.queryOptions({
			input: { status, mediaType: format, limit: 200 },
		}),
	);
	const items: TileItem[] = (shelf.data ?? []).map((item) => ({
		uuid: item.bookUuid,
		kind: item.mediaType === "audiobook" ? "audiobook" : "book",
		title: item.title,
		cover: item.cover,
		color: item.mainColor,
		subtitle: joinNames(item.authors, 1),
	}));
	return (
		<TitleGrid
			items={items}
			query={{
				...shelf,
				isFetchingNextPage: false,
				hasNextPage: false,
				fetchNextPage: () => {},
			}}
			emptyTitle={t("shelves.empty_title")}
			emptyMessage={t("shelves.empty_desc")}
		/>
	);
}

export const shelfTitle = (status: ShelfStatus, format: ShelfFormat) =>
	shelfMeta(status, format).label;

/** Titles of a genre, tag or publisher (books.listByEntity, as the web's
 * entity pages). */
export function EntityTitles({
	kind,
	uuid,
}: {
	kind: "genre" | "tag" | "publisher";
	uuid: string;
}) {
	const { orpc } = useApi();
	const titles = useInfiniteQuery(
		orpc.books.listByEntity.infiniteOptions({
			input: (cursor: number) => ({
				kind,
				uuid,
				cursor,
				limit: PAGE,
			}),
			initialPageParam: 0,
			getNextPageParam: (last) => last.nextCursor ?? undefined,
		}),
	);
	const items: TileItem[] = (
		titles.data?.pages.flatMap((page) => page.books) ?? []
	).map((item) => ({
		uuid: item.uuid,
		kind: item.mediaType === "audiobook" ? "audiobook" : "book",
		title: item.title,
		cover: item.cover,
		color: item.mainColor,
		subtitle: joinNames(item.authors, 1),
	}));
	return <TitleGrid items={items} query={titles} />;
}

/** Audiobooks a narrator reads (audiobooks.search by narrator). */
export function NarratorTitles({ uuid }: { uuid: string }) {
	const { orpc } = useApi();
	const titles = useInfiniteQuery(
		orpc.audiobooks.search.infiniteOptions({
			input: (cursor: string | undefined) => ({
				filters: { narratorUuids: [uuid] },
				sort: "newest",
				cursor,
				limit: PAGE,
			}),
			initialPageParam: undefined as string | undefined,
			getNextPageParam: (last) => last.pagination.cursor,
		}),
	);
	const items: TileItem[] = (
		titles.data?.pages.flatMap((page) => page.audiobooks) ?? []
	).map((item) => ({
		uuid: item.uuid,
		kind: "audiobook",
		title: item.title ?? null,
		cover: item.cover ?? null,
		color: item.mainColor ?? null,
		subtitle: joinNames(item.authors, 1),
	}));
	return <TitleGrid items={items} query={titles} />;
}
