import { useQuery } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { useState } from "react";
import { Linking, View } from "react-native";
import Animated from "react-native-reanimated";
import { DetailHero } from "@/components/detail-hero";
import { byPrefix, LinkedNames } from "@/components/linked-names";
import { RefreshControl } from "@/components/refresh-control";
import { Shelf } from "@/components/shelf";
import { useArrival } from "@/components/skeleton";
import { ErrorState } from "@/components/states";
import type { TileItem } from "@/components/title-tile";
import {
	formatCount,
	joinNames,
	languageName,
	percent,
	titleOrUntitled,
} from "@/lib/format";
import { t } from "@/lib/i18n";
import { htmlToText } from "@/lib/plain-text";
import { routes } from "@/lib/routes";
import { bookDetailQueries } from "@/lib/title-queries";
import { useMiniPlayerInset } from "@/player/mini-player";
import { useApi } from "@/providers/app-provider";
import { space } from "@/theme";
import { BookCopies, DuplicateNotice } from "./book-copies";
import { BookFileDetails, bookDate } from "./book-file-details";
import { DetailReading } from "./detail-reading";
import { DetailHeaderMenu } from "./header-menu";
import {
	DetailColumn,
	DetailSkeleton,
	DetailTabs,
	Divider,
	InfoGrid,
	SectionLabel,
} from "./layout";
import { Description, TagChips } from "./parts";
import { TitleActions } from "./title-actions";
import { useDetailHeader } from "./use-detail-header";

type Tab = "overview" | "reading" | "file" | "copies";

/**
 * Book detail, Fable's flat page: hero, then tabs — the overview (synopsis,
 * facts in two columns, rails), reading history, file and copies.
 */
export function BookDetail({ uuid }: { uuid: string }) {
	const miniPlayerInset = useMiniPlayerInset();
	const { orpc } = useApi();
	const queries = bookDetailQueries(orpc, uuid);
	const [tab, setTab] = useState<Tab>("overview");
	const book = useQuery(queries.detail);
	const progress = useQuery(queries.progress);
	const similar = useQuery(
		orpc.recommendations.similarToBook.queryOptions({
			input: { bookUuid: uuid },
		}),
	);
	const seriesUuid = book.data?.series?.uuid;
	const series = useQuery({
		...orpc.books.listBySeries.queryOptions({
			input: { seriesUuid: seriesUuid ?? "" },
		}),
		enabled: !!seriesUuid,
	});
	const authorUuids = book.data?.authors.map((author) => author.uuid) ?? [];
	const moreBooks = useQuery({
		...orpc.books.search.queryOptions({
			input: { filters: { authorUuids }, limit: 20, sort: "newest" },
		}),
		enabled: authorUuids.length > 0,
	});
	const moreAudio = useQuery({
		...orpc.audiobooks.search.queryOptions({
			input: { filters: { authorUuids }, limit: 20, sort: "newest" },
		}),
		enabled: authorUuids.length > 0,
	});
	const detailHeader = useDetailHeader(
		book.data ? titleOrUntitled(book.data.title ?? book.data.filename) : "",
	);

	const arrival = useArrival(!!book.data);

	if (book.isError) return <ErrorState onRetry={() => book.refetch()} />;
	if (!book.data)
		return (
			<>
				<Stack.Screen options={{ title: "" }} />
				<DetailSkeleton audio={false} />
			</>
		);
	const data = book.data;
	const read = percent(
		progress.data?.exploredCharCount,
		progress.data?.bookCharCount ?? data.amountChars,
	);

	const seriesItems: TileItem[] = (series.data ?? []).map((item) => ({
		uuid: item.uuid,
		kind: "book",
		title: item.title,
		cover: item.cover,
		color: item.mainColor,
		subtitle:
			item.position != null
				? t("mobile.series.book_n", { n: item.position })
				: joinNames(item.authors, 1),
	}));
	// Like the web's selectMoreByAuthorItems: skip this title and its series.
	const inSeries = new Set(seriesItems.map((item) => item.uuid));
	const moreItems: TileItem[] = [
		...(moreBooks.data?.books ?? []).map((item) => ({
			uuid: item.uuid,
			kind: "book" as const,
			title: item.title ?? null,
			cover: item.cover ?? null,
			color: item.color ?? null,
			subtitle: joinNames(item.authors, 1),
		})),
		...(moreAudio.data?.audiobooks ?? []).map((item) => ({
			uuid: item.uuid,
			kind: "audiobook" as const,
			title: item.title ?? null,
			cover: item.cover ?? null,
			color: item.mainColor ?? null,
			subtitle: joinNames(item.authors, 1),
		})),
	].filter((item) => item.uuid !== uuid && !inSeries.has(item.uuid));

	const copies = data.otherCopies?.length ?? 0;
	const tabs = [
		{ value: "overview" as const, label: t("book.tab_overview") },
		{ value: "reading" as const, label: t("reading_title") },
		{ value: "file" as const, label: t("book.tab_file_metadata") },
		...(copies > 0
			? [
					{
						value: "copies" as const,
						label: t("book.tab_copies_short", { count: copies + 1 }),
					},
				]
			: []),
	];
	const target = {
		uuid,
		kind: "book" as const,
		title: data.title,
		cover: data.cover,
		color: data.mainColor,
		subtitle: joinNames(data.authors),
		onDetailPage: true,
	};

	return (
		<>
			<DetailHeaderMenu target={target} />
			{detailHeader.header}
			<Animated.ScrollView
				{...detailHeader.scrollProps}
				entering={arrival}
				contentContainerStyle={{
					paddingBottom: space.xxl * 2 + miniPlayerInset,
				}}
				refreshControl={
					<RefreshControl
						refreshing={book.isRefetching}
						onRefresh={() => {
							void book.refetch();
							void progress.refetch();
						}}
					/>
				}
			>
				<DetailHero
					uuid={uuid}
					onTitleOffset={detailHeader.onTitleOffset}
					scrollY={detailHeader.scrollY}
					cover={data.cover}
					color={data.mainColor}
					shape="book"
					title={titleOrUntitled(data.title ?? data.filename)}
					subtitle={data.subtitle}
					people={
						<LinkedNames
							prefix={byPrefix(t("mobile.detail.by", { names: "\u0000" }))}
							people={data.authors}
							hrefFor={(author) => routes.author(author.uuid)}
						/>
					}
					actions={<TitleActions uuid={uuid} kind="ebook" progress={read} />}
				/>

				<DetailColumn>
					<View style={{ marginTop: space.xl, marginBottom: space.xl }}>
						<DetailTabs options={tabs} value={tab} onChange={setTab} />
					</View>
					{tab === "overview" ? (
						<>
							{data.description ? (
								<View style={{ gap: space.sm }}>
									<SectionLabel>{t("book.meta_description")}</SectionLabel>
									<Description text={htmlToText(data.description)} />
								</View>
							) : null}
							{data.genres.length + data.tags.length > 0 ? (
								<View style={{ marginTop: space.lg }}>
									<TagChips
										tags={[
											...data.genres.map((genre) => ({
												key: genre.uuid,
												label: genre.name,
												href: {
													pathname: "/genre/[uuid]" as const,
													params: { uuid: genre.uuid, name: genre.name },
												},
											})),
											...data.tags.map((tag) => ({
												key: tag.uuid,
												label: tag.name,
												href: {
													pathname: "/tag/[uuid]" as const,
													params: { uuid: tag.uuid, name: tag.name },
												},
											})),
										]}
									/>
								</View>
							) : null}
							{data.description || data.genres.length + data.tags.length > 0 ? (
								<Divider />
							) : null}
							<InfoGrid
								items={[
									{ label: t("book.format"), value: t("home.format_book") },
									data.pageCount
										? {
												label: t("book.pages"),
												value: t("book.pages_count", { count: data.pageCount }),
											}
										: data.amountChars
											? {
													label: t("book.characters"),
													value: formatCount(data.amountChars),
												}
											: null,
									data.publisher
										? {
												label: t("book.publisher"),
												value: data.publisher.name,
												href: {
													pathname: "/publisher/[uuid]",
													params: { uuid: data.publisher.uuid },
												},
											}
										: null,
									data.publishedDate
										? {
												label: t("book.published"),
												value:
													bookDate(data.publishedDate) ?? data.publishedDate,
											}
										: null,
									data.languageCode
										? {
												label: t("book.language"),
												value:
													languageName(data.languageCode) ?? data.languageCode,
											}
										: null,
									data.rating != null
										? {
												label: t("mobile.detail.rating"),
												value: `★ ${data.rating.toFixed(1)}${data.ratingCount != null ? ` (${formatCount(data.ratingCount)})` : ""}`,
											}
										: null,
									data.libraryName && data.libraryUuid
										? {
												label: t("book.library"),
												value: data.libraryName,
												href: {
													pathname: "/library/[uuid]",
													params: { uuid: data.libraryUuid },
												},
											}
										: null,
									data.isbn13 ? { label: "ISBN", value: data.isbn13 } : null,
									!data.isbn13 && data.isbn10
										? { label: "ISBN", value: data.isbn10 }
										: null,
									data.asin
										? {
												label: "ASIN",
												value: data.asin,
												onPress: () =>
													void Linking.openURL(
														`https://www.amazon.co.jp/dp/${encodeURIComponent(data.asin ?? "")}`,
													),
											}
										: null,
								]}
							/>
							<Divider />
						</>
					) : tab === "reading" ? (
						<DetailReading uuid={uuid} />
					) : tab === "copies" ? (
						<BookCopies book={data} />
					) : (
						<View style={{ gap: space.xl }}>
							<DuplicateNotice book={data} />
							<BookFileDetails book={data} />
						</View>
					)}
				</DetailColumn>

				{tab === "overview" ? (
					<View
						style={{
							gap: 40,
							maxWidth: 1464,
							width: "100%",
							alignSelf: "center",
						}}
					>
						{data.series && seriesItems.length > 1 ? (
							<Shelf
								detail
								title={data.series.name}
								href={routes.series(data.series.uuid, "book")}
								items={seriesItems}
							/>
						) : null}
						<Shelf
							detail
							title={
								data.authors.length === 1
									? t("recs.more_by_author", { author: data.authors[0].name })
									: t("recs.more_by_authors")
							}
							href={
								data.authors.length === 1
									? routes.author(data.authors[0].uuid)
									: undefined
							}
							items={moreItems}
						/>
						{similar.data?.enabled ? (
							<Shelf
								detail
								title={t("recs.similar_title")}
								items={similar.data.items
									.filter(
										(item) =>
											!moreItems.some((other) => other.uuid === item.book.uuid),
									)
									.map((item) => ({
										uuid: item.book.uuid,
										kind:
											item.book.mediaType === "audiobook"
												? "audiobook"
												: "book",
										title: item.seriesName ?? item.book.title,
										cover: item.book.cover,
										color: item.book.mainColor,
										subtitle: joinNames(item.book.authors, 1),
									}))}
							/>
						) : null}
					</View>
				) : null}
			</Animated.ScrollView>
		</>
	);
}
