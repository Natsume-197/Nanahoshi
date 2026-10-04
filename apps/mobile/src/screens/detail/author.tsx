import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { ChipRow } from "@/components/chip";
import { SearchField } from "@/components/search-field";
import { SortButton } from "@/components/sort-button";
import { Text } from "@/components/text";
import { TitleGrid } from "@/components/title-grid";
import type { TileItem } from "@/components/title-tile";
import { formatDuration, joinNames } from "@/lib/format";
import { t } from "@/lib/i18n";
import { htmlToText } from "@/lib/plain-text";
import { useApi } from "@/providers/app-provider";
import { space } from "@/theme";
import { Description } from "./parts";

type Sort = "newest" | "oldest" | "title_asc";
type Format = "ebook" | "audiobook";
const PAGE = 30;

/** The web's author page: the name, a works · rating line, search + sort,
 * then the works grid. The web stacks Books over Audiobooks; on a phone the
 * two grids become a format switch so each can page independently. */
export function AuthorDetail({ uuid }: { uuid: string }) {
	const { orpc, client } = useApi();
	const [sort, setSort] = useState<Sort>("newest");
	const [query, setQuery] = useState("");
	const [picked, setPicked] = useState<Format | null>(null);

	const author = useQuery(
		orpc.authors.getByUuid.queryOptions({ input: { uuid }, staleTime: 60_000 }),
	);
	const rating = useQuery(
		orpc.authors.ratingStats.queryOptions({
			input: { uuid },
			staleTime: 60_000,
		}),
	);
	const input = (cursor: string | undefined) => ({
		filters: { authorUuids: [uuid] },
		query: query || undefined,
		sort,
		cursor,
		limit: PAGE,
	});
	const books = useInfiniteQuery({
		queryKey: ["books", "author", uuid, sort, query],
		queryFn: ({ pageParam }) => client.books.search(input(pageParam)),
		initialPageParam: undefined as string | undefined,
		getNextPageParam: (last) => last.pagination.cursor ?? undefined,
		staleTime: 60_000,
	});
	const audiobooks = useInfiniteQuery({
		queryKey: ["audiobooks", "author", uuid, sort, query],
		queryFn: ({ pageParam }) => client.audiobooks.search(input(pageParam)),
		initialPageParam: undefined as string | undefined,
		getNextPageParam: (last) => last.pagination.cursor ?? undefined,
		staleTime: 60_000,
	});

	const bookTotal = books.data?.pages[0]?.pagination.totalHits ?? 0;
	const audioTotal = audiobooks.data?.pages[0]?.pagination.totalHits ?? 0;
	const both = bookTotal > 0 && audioTotal > 0;
	// Land on whichever format the author actually has.
	const format: Format =
		picked ?? (bookTotal === 0 && audioTotal > 0 ? "audiobook" : "ebook");
	const active = format === "audiobook" ? audiobooks : books;

	const items: TileItem[] =
		format === "audiobook"
			? (audiobooks.data?.pages.flatMap((page) => page.audiobooks) ?? []).map(
					(item) => ({
						uuid: item.uuid,
						kind: "audiobook",
						title: item.title ?? null,
						cover: item.cover ?? null,
						color: item.mainColor ?? null,
						subtitle: formatDuration(item.duration),
					}),
				)
			: (books.data?.pages.flatMap((page) => page.books) ?? []).map((item) => ({
					uuid: item.uuid,
					kind: "book",
					title: item.title ?? null,
					cover: item.cover ?? null,
					color: item.color ?? null,
					subtitle: joinNames(item.authors),
				}));

	const total = bookTotal + audioTotal;
	const average = rating.data?.average;
	const subtitle = query
		? null
		: [
				total
					? t("mobile.author.works", { count: total.toLocaleString() })
					: null,
				average != null ? `★ ${average.toFixed(1)}` : null,
			]
				.filter(Boolean)
				.join("  ·  ");
	const description = author.data?.description
		? htmlToText(author.data.description)
		: null;

	return (
		<>
			<Stack.Screen
				options={{ title: author.data?.name ?? t("common.author") }}
			/>
			<TitleGrid
				items={items}
				query={{
					...active,
					isPending: author.isPending || active.isPending,
					isError: author.isError || active.isError,
					refetch: () => {
						void author.refetch();
						void books.refetch();
						return audiobooks.refetch();
					},
				}}
				emptyTitle={
					query ? t("settings.no_matches") : t("mobile.author.empty_title")
				}
				emptyMessage={
					query
						? t("mobile.author.no_matches", { query })
						: t("mobile.author.empty_desc")
				}
				header={
					<View
						style={{
							gap: space.md,
							paddingTop: space.xs,
							paddingBottom: space.lg,
						}}
					>
						<View style={{ gap: space.md, paddingHorizontal: space.sm / 2 }}>
							{subtitle ? (
								<Text variant="subhead" tone="secondary">
									{subtitle}
								</Text>
							) : null}
							{description ? <Description text={description} /> : null}
							{total > 0 || query ? (
								<SearchField
									placeholder={t("mobile.author.search")}
									onQuery={setQuery}
								/>
							) : null}
						</View>
						{both ? (
							<View style={{ marginHorizontal: -(space.lg - space.sm / 2) }}>
								<ChipRow
									value={format}
									onChange={setPicked}
									options={[
										{
											value: "ebook",
											label: `${t("nav.books")} · ${bookTotal}`,
										},
										{
											value: "audiobook",
											label: `${t("nav.audiobooks")} · ${audioTotal}`,
										},
									]}
								/>
							</View>
						) : null}
						{total > 1 ? (
							<View style={{ paddingHorizontal: space.sm / 2 }}>
								<SortButton
									value={sort}
									onChange={setSort}
									options={[
										{ value: "newest", label: t("mobile.sort.newest") },
										{ value: "oldest", label: t("mobile.sort.oldest") },
										{ value: "title_asc", label: t("common.title") },
									]}
								/>
							</View>
						) : null}
					</View>
				}
			/>
		</>
	);
}
