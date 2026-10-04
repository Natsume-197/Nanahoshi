import { useInfiniteQuery } from "@tanstack/react-query";
import { Stack, useLocalSearchParams } from "expo-router";
import { TitleGrid } from "@/components/title-grid";
import type { TileItem } from "@/components/title-tile";
import { joinNames } from "@/lib/format";
import { t } from "@/lib/i18n";
import { useApi } from "@/providers/app-provider";

export default function GenreRoute() {
	const { uuid, name } = useLocalSearchParams<{
		uuid: string;
		name?: string;
	}>();
	return (
		<>
			<Stack.Screen options={{ title: name ?? t("nav.genres") }} />
			<GenreTitles key={uuid} uuid={uuid} />
		</>
	);
}

function GenreTitles({ uuid }: { uuid: string }) {
	const { orpc } = useApi();
	const titles = useInfiniteQuery(
		orpc.books.listByEntity.infiniteOptions({
			input: (cursor: number) => ({ kind: "genre", uuid, cursor, limit: 40 }),
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
