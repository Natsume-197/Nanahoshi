import { useQuery } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { useState } from "react";
import { RefreshControl, ScrollView, View } from "react-native";
import { DetailHero } from "@/components/detail-hero";
import { byPrefix, LinkedNames } from "@/components/linked-names";
import { Shelf } from "@/components/shelf";
import { ErrorState } from "@/components/states";
import { Text } from "@/components/text";
import type { TileItem } from "@/components/title-tile";
import {
	formatDuration,
	joinNames,
	languageName,
	percent,
	titleOrUntitled,
} from "@/lib/format";
import { t } from "@/lib/i18n";
import { htmlToText } from "@/lib/plain-text";
import { routes } from "@/lib/routes";
import { useApi } from "@/providers/app-provider";
import { space, usePalette } from "@/theme";
import {
	type AudiobookDetailData,
	AudiobookTechnical,
} from "./audiobook-technical";
import { bookDate } from "./book-file-details";
import { currentChapter } from "./detail-model";
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

type Tab = "overview" | "chapters" | "listening" | "technical";

const clock = (seconds: number) => {
	const h = Math.floor(seconds / 3600);
	const m = Math.floor((seconds % 3600) / 60);
	const s = Math.floor(seconds % 60);
	const pad = (value: number) => String(value).padStart(2, "0");
	return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
};

/** Audiobook detail: the book page's layout plus the chapter list, which is
 * what a listener scans before pressing play. */
export function AudiobookDetail({ uuid }: { uuid: string }) {
	const { orpc } = useApi();
	const [tab, setTab] = useState<Tab>("overview");
	const audiobook = useQuery(
		orpc.audiobooks.getDetails.queryOptions({ input: { uuid } }),
	);
	const progress = useQuery(
		orpc.listeningProgress.getProgress.queryOptions({
			input: { bookUuid: uuid },
		}),
	);
	const seriesUuid = audiobook.data?.series?.uuid;
	const series = useQuery({
		...orpc.audiobooks.listBySeries.queryOptions({
			input: { seriesUuid: seriesUuid ?? "" },
		}),
		enabled: !!seriesUuid,
	});
	const authorUuids =
		audiobook.data?.authors.map((author) => author.uuid) ?? [];
	const more = useQuery({
		...orpc.audiobooks.search.queryOptions({
			input: { filters: { authorUuids }, limit: 20, sort: "newest" },
		}),
		enabled: authorUuids.length > 0,
	});

	if (audiobook.isError)
		return <ErrorState onRetry={() => audiobook.refetch()} />;
	if (!audiobook.data)
		return (
			<>
				<Stack.Screen options={{ title: "" }} />
				<DetailSkeleton audio />
			</>
		);
	const data = audiobook.data;
	const duration = progress.data?.durationSeconds || data.duration;
	const position = progress.data?.currentTimeSeconds ?? 0;
	const listened = percent(position, duration);

	const seriesItems: TileItem[] = (series.data ?? []).map((item) => ({
		uuid: item.uuid,
		kind: "audiobook",
		title: item.title,
		cover: item.cover,
		color: item.mainColor,
		subtitle: [
			(item.sequence ?? (item.position != null ? String(item.position) : null))
				? t("mobile.series.book_n", {
						n: item.sequence ?? String(item.position),
					})
				: null,
			formatDuration(item.duration),
		]
			.filter(Boolean)
			.join(" · "),
	}));
	const inSeries = new Set(seriesItems.map((item) => item.uuid));
	const moreItems: TileItem[] = (more.data?.audiobooks ?? [])
		.filter((item) => item.uuid !== uuid && !inSeries.has(item.uuid))
		.map((item) => ({
			uuid: item.uuid,
			kind: "audiobook",
			title: item.title ?? null,
			cover: item.cover ?? null,
			color: item.mainColor ?? null,
			subtitle: joinNames(item.authors, 1),
		}));
	const tabs = [
		{ value: "overview" as const, label: t("audiobook.tab_overview") },
		...(data.chapters.length > 1
			? [{ value: "chapters" as const, label: t("audiobook.tab_chapters") }]
			: []),
		{ value: "listening" as const, label: t("listening_title") },
		{ value: "technical" as const, label: t("audiobook.tab_technical") },
	];
	const target = {
		uuid,
		kind: "audiobook" as const,
		title: data.title,
		cover: data.cover,
		color: data.mainColor,
		subtitle: joinNames(data.authors),
		onDetailPage: true,
	};

	return (
		<>
			<DetailHeaderMenu target={target} />
			<ScrollView
				contentContainerStyle={{ paddingBottom: space.xxl * 2 }}
				refreshControl={
					<RefreshControl
						refreshing={audiobook.isRefetching}
						onRefresh={() => {
							void audiobook.refetch();
							void progress.refetch();
						}}
					/>
				}
			>
				<DetailHero
					uuid={uuid}
					cover={data.cover}
					color={data.mainColor}
					shape="audio"
					title={titleOrUntitled(data.title)}
					subtitle={data.subtitle}
					people={
						<View style={{ gap: space.xs }}>
							<LinkedNames
								prefix={byPrefix(t("mobile.detail.by", { names: "\u0000" }))}
								people={data.authors}
								hrefFor={(author) => routes.author(author.uuid)}
							/>
							<LinkedNames
								quiet
								prefix={t("audiobook.narrated_by")}
								people={data.narrators}
								hrefFor={(narrator) => ({
									pathname: "/narrator/[uuid]",
									params: { uuid: narrator.uuid, name: narrator.name },
								})}
							/>
						</View>
					}
					actions={
						<TitleActions
							uuid={uuid}
							kind="audiobook"
							progress={listened}
							duration={duration}
							position={position}
						/>
					}
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
									{
										label: t("book.format"),
										value: t("home.format_audiobook"),
									},
									formatDuration(data.duration)
										? {
												label: t("audiobook.duration"),
												value: formatDuration(data.duration) ?? "",
											}
										: null,
									data.publisherName
										? { label: t("book.publisher"), value: data.publisherName }
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
												label: t("audiobook.language"),
												value:
													languageName(data.languageCode) ?? data.languageCode,
											}
										: null,
									data.libraryName
										? { label: t("audiobook.library"), value: data.libraryName }
										: null,
									data.isbn ? { label: "ISBN", value: data.isbn } : null,
									data.asin ? { label: "ASIN", value: data.asin } : null,
								]}
							/>
							<Divider />
						</>
					) : tab === "chapters" ? (
						<Chapters chapters={data.chapters} position={position} />
					) : tab === "listening" ? (
						<DetailReading uuid={uuid} audio />
					) : (
						<AudiobookTechnical data={data} />
					)}
				</DetailColumn>

				{tab === "overview" ? (
					<View
						style={{
							gap: 40,
							width: "100%",
							maxWidth: 1464,
							alignSelf: "center",
						}}
					>
						{data.series?.uuid && seriesItems.length > 1 ? (
							<Shelf
								detail
								title={data.series.name}
								href={routes.series(data.series.uuid, "audiobook")}
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
					</View>
				) : null}
			</ScrollView>
		</>
	);
}

function Chapters({
	chapters,
	position,
}: {
	chapters: AudiobookDetailData["chapters"];
	position: number;
}) {
	const palette = usePalette();
	const current = currentChapter(chapters, position);
	return (
		<View style={{ gap: space.sm }}>
			<SectionLabel>
				{t("mobile.detail.chapters", { count: chapters.length })}
			</SectionLabel>
			<View>
				{chapters.map((chapter, index) => {
					const played = position >= chapter.endTime;
					const playing = index === current;
					return (
						<View
							key={chapter.id}
							style={{
								flexDirection: "row",
								alignItems: "center",
								gap: space.md,
								minHeight: 48,
								borderTopWidth: index === 0 ? 0 : 1,
								borderColor: palette.separator,
							}}
						>
							<Text
								variant="subhead"
								tone="tertiary"
								style={{ width: 24, fontVariant: ["tabular-nums"] }}
							>
								{index + 1}
							</Text>
							<Text
								variant="headline"
								numberOfLines={1}
								style={{
									flex: 1,
									fontWeight: playing ? "600" : "400",
									color: playing
										? palette.accent
										: played
											? palette.textSecondary
											: palette.text,
								}}
							>
								{chapter.title ??
									t("audiobook.chapter_fallback", { number: index + 1 })}
							</Text>
							<Text
								variant="subhead"
								tone="secondary"
								style={{ fontVariant: ["tabular-nums"] }}
							>
								{clock(chapter.endTime - chapter.startTime)}
							</Text>
						</View>
					);
				})}
			</View>
		</View>
	);
}
