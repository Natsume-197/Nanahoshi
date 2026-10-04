import { useInfiniteQuery, useQueries, useQuery } from "@tanstack/react-query";
import { Image } from "expo-image";
import { router } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { IconButton } from "@/components/button";
import { ChipRow } from "@/components/chip";
import { CollectionCard } from "@/components/collection-card";
import { Icon, icons } from "@/components/icon";
import { LineTabs } from "@/components/line-tabs";
import { askChoice } from "@/components/prompt";
import { Shelf } from "@/components/shelf";
import { ShelfSkeleton } from "@/components/states";
import { Text } from "@/components/text";
import { TitleGrid } from "@/components/title-grid";
import type { TileItem } from "@/components/title-tile";
import { clearDownloads } from "@/downloads/files";
import { useGridTileWidth } from "@/hooks/use-grid-tile-width";
import { joinNames } from "@/lib/format";
import { t } from "@/lib/i18n";
import { mediaUrl } from "@/lib/media";
import { routes } from "@/lib/routes";
import { useApi, useConnection, useServer } from "@/providers/app-provider";
import { radius, sizes, space, usePalette } from "@/theme";

type Tab = "overview" | "books" | "audiobooks" | "likes";
type BookStatus = "completed" | "reading" | "backlog" | "want_to_read";
type AudioStatus = "listening" | "completed" | "backlog" | "want_to_listen";
const PAGE = 40;
const RAIL = 12;

const BOOK_SECTIONS: { status: BookStatus; label: () => string }[] = [
	{ status: "completed", label: () => t("catalog_pages.completed") },
	{ status: "reading", label: () => t("catalog_pages.reading") },
	{ status: "backlog", label: () => t("catalog_pages.backlog") },
	{ status: "want_to_read", label: () => t("catalog_pages.want_read") },
];
const AUDIO_SECTIONS: { status: AudioStatus; label: () => string }[] = [
	{ status: "listening", label: () => t("catalog_pages.listening") },
	{ status: "completed", label: () => t("mobile.me.audio_completed") },
	{ status: "backlog", label: () => t("mobile.me.audio_backlog") },
	{ status: "want_to_listen", label: () => t("catalog_pages.want_listen") },
];

type ShelfRow = {
	bookUuid: string;
	title: string | null;
	cover: string | null;
	mainColor?: string | null;
	authors?: { name: string }[] | null;
};

function toTile(row: ShelfRow, kind: TileItem["kind"]): TileItem {
	return {
		uuid: row.bookUuid,
		kind,
		title: row.title,
		cover: row.cover,
		color: row.mainColor ?? null,
		subtitle: joinNames(row.authors ?? [], 1),
	};
}

/** The web's own profile page (/dashboard/user/$username), which on phones
 * is the account tab: banner, avatar and name, then Overview / Books /
 * Audiobooks / Likes. The ⋯ menu carries the account actions. */
export function Me() {
	const { orpc } = useApi();
	const profile = useQuery(orpc.profile.getProfile.queryOptions());
	const username = profile.data?.username ?? "";
	const [tab, setTab] = useState<Tab>("overview");
	const [bookStatus, setBookStatus] = useState<BookStatus | "all">("all");
	const [audioStatus, setAudioStatus] = useState<AudioStatus | "all">("all");
	const [likedFormat, setLikedFormat] = useState<"books" | "audiobooks">(
		"books",
	);

	const books = useInfiniteQuery({
		...orpc.bookShelf.getPublicShelfPaginated.infiniteOptions({
			input: (offset: number) => ({
				username,
				status: bookStatus === "all" ? undefined : bookStatus,
				limit: PAGE,
				offset,
			}),
			initialPageParam: 0,
			getNextPageParam: (last, pages) =>
				pages.length * PAGE < last.total ? pages.length * PAGE : undefined,
		}),
		enabled: !!username && tab === "books",
	});
	const audiobooks = useInfiniteQuery({
		...orpc.audiobookShelf.getPublicShelfPaginated.infiniteOptions({
			input: (offset: number) => ({
				username,
				status: audioStatus === "all" ? undefined : audioStatus,
				limit: PAGE,
				offset,
			}),
			initialPageParam: 0,
			getNextPageParam: (last, pages) =>
				pages.length * PAGE < last.total ? pages.length * PAGE : undefined,
		}),
		enabled: !!username && tab === "audiobooks",
	});
	const likes = useInfiniteQuery({
		...orpc.likedBooks.listLiked.infiniteOptions({
			input: (cursor: number) => ({ limit: PAGE, cursor, format: likedFormat }),
			initialPageParam: 0,
			getNextPageParam: (last, pages) =>
				last.length === PAGE ? pages.length * PAGE : undefined,
		}),
		enabled: tab === "likes",
	});
	const likedCount = useQuery({
		...orpc.likedBooks.count.queryOptions({ input: { format: likedFormat } }),
		enabled: tab === "likes",
	});

	const grid =
		tab === "books"
			? {
					query: books,
					items: (books.data?.pages.flatMap((page) => page.items) ?? []).map(
						(row) => toTile(row, "book"),
					),
					total: books.data?.pages[0]?.total,
					count: (n: number) => t("media.book_count", { count: n }),
				}
			: tab === "audiobooks"
				? {
						query: audiobooks,
						items: (
							audiobooks.data?.pages.flatMap((page) => page.items) ?? []
						).map((row) => toTile(row, "audiobook")),
						total: audiobooks.data?.pages[0]?.total,
						count: (n: number) => t("media.audiobook_count", { count: n }),
					}
				: tab === "likes"
					? {
							query: likes,
							items: (likes.data?.pages.flat() ?? []).map(
								(item): TileItem => ({
									uuid: item.bookUuid,
									kind: likedFormat === "audiobooks" ? "audiobook" : "book",
									title: item.title ?? null,
									cover: item.cover ?? null,
									color: item.mainColor ?? null,
									subtitle: joinNames(item.authors ?? [], 1),
								}),
							),
							total: likedCount.data,
							count: (n: number) =>
								t(
									likedFormat === "audiobooks"
										? "media.audiobook_count"
										: "media.book_count",
									{ count: n },
								),
						}
					: null;

	const filters =
		tab === "books" ? (
			<ChipRow
				value={bookStatus}
				onChange={setBookStatus}
				options={[
					{ value: "all", label: t("catalog_pages.all") },
					...BOOK_SECTIONS.map((section) => ({
						value: section.status,
						label: section.label(),
					})),
				]}
			/>
		) : tab === "audiobooks" ? (
			<ChipRow
				value={audioStatus}
				onChange={setAudioStatus}
				options={[
					{ value: "all", label: t("catalog_pages.all") },
					...AUDIO_SECTIONS.map((section) => ({
						value: section.status,
						label: section.label(),
					})),
				]}
			/>
		) : tab === "likes" ? (
			<ChipRow
				value={likedFormat}
				onChange={setLikedFormat}
				options={[
					{ value: "books", label: t("nav.books") },
					{ value: "audiobooks", label: t("nav.audiobooks") },
				]}
			/>
		) : null;

	const emptyTitle =
		tab === "likes"
			? t(
					likedFormat === "audiobooks"
						? "likes.empty_title_audiobooks"
						: "likes.empty_title",
				)
			: t(
					tab === "audiobooks"
						? "likes.empty_title_audiobooks"
						: "library_page.empty_title",
				);
	const emptyMessage =
		tab === "likes"
			? t(
					likedFormat === "audiobooks"
						? "likes.empty_desc_audiobooks"
						: "likes.empty_desc",
				)
			: (tab === "books" ? bookStatus : audioStatus) !== "all"
				? t(
						tab === "audiobooks"
							? "catalog_pages.no_status_audiobooks"
							: "catalog_pages.no_status_books",
					)
				: t("catalog_pages.empty_shelf");

	return (
		<TitleGrid
			items={grid?.items ?? []}
			query={
				grid?.query ?? {
					isPending: false,
					isError: false,
					isRefetching: profile.isRefetching,
					isFetchingNextPage: false,
					hasNextPage: false,
					fetchNextPage: () => undefined,
					refetch: () => profile.refetch(),
				}
			}
			empty={
				tab === "overview" ? (
					<Overview username={username} onViewMore={setTab} />
				) : undefined
			}
			emptyTitle={emptyTitle}
			emptyMessage={emptyMessage}
			header={
				<View
					style={{
						marginHorizontal: -(space.lg - space.sm / 2),
						paddingBottom: space.lg,
						gap: space.lg,
					}}
				>
					<ProfileHeader />
					<LineTabs
						value={tab}
						onChange={setTab}
						options={[
							{ value: "overview", label: t("mobile.me.overview") },
							{ value: "books", label: t("nav.books") },
							{ value: "audiobooks", label: t("nav.audiobooks") },
							{ value: "likes", label: t("mobile.me.likes") },
						]}
					/>
					{filters}
					{grid && grid.total != null ? (
						<Text
							variant="label"
							tone="secondary"
							style={{ paddingHorizontal: space.lg }}
						>
							{grid.count(grid.total)}
						</Text>
					) : null}
				</View>
			}
		/>
	);
}

function ProfileHeader() {
	const palette = usePalette();
	const insets = useSafeAreaInsets();
	const { orpc } = useApi();
	const { auth, serverUrl } = useConnection();
	const { setServerUrl } = useServer();
	const profile = useQuery(orpc.profile.getProfile.queryOptions());
	const username =
		profile.data?.displayUsername ?? profile.data?.username ?? "";
	const name = profile.data?.name?.trim() || username;
	const avatar = mediaUrl(serverUrl, profile.data?.image);
	const banner = mediaUrl(serverUrl, profile.data?.headerImage);

	const openMenu = async () => {
		const answer = await askChoice({
			title: t("mobile.me.account"),
			message: t("mobile.me.signed_in_as", { name: `@${username}` }),
			options: [
				{ id: "stats", label: t("nav.stats") },
				{ id: "downloads", label: t("mobile.downloads.title") },
				{ id: "settings", label: t("nav.settings") },
				{ id: "server", label: t("mobile.signin.change_server") },
				{ id: "sign-out", label: t("nav.sign_out"), destructive: true },
			],
		});
		if (answer === "stats") router.push("/stats");
		else if (answer === "downloads") router.push("/downloads");
		else if (answer === "settings") router.push("/settings");
		else if (answer === "server") {
			await auth.signOut().catch(() => undefined);
			clearDownloads();
			await setServerUrl(null);
		}
		// The root guard sees the session end and swaps to sign-in.
		else if (answer === "sign-out") void auth.signOut().then(clearDownloads);
	};

	return (
		<View
			style={{
				paddingTop: (process.env.EXPO_OS === "ios" ? 0 : insets.top) + space.md,
				paddingHorizontal: space.lg,
			}}
		>
			<View
				style={{
					height: 160,
					borderRadius: radius.card,
					borderCurve: "continuous",
					overflow: "hidden",
					backgroundColor: palette.surface,
				}}
			>
				{banner ? (
					<Image
						source={{ uri: banner }}
						style={{ flex: 1 }}
						contentFit="cover"
						transition={200}
					/>
				) : (
					<View
						style={{
							flex: 1,
							experimental_backgroundImage: `linear-gradient(135deg, ${palette.accentSoft}, ${palette.surface} 55%, ${palette.accentSoft})`,
						}}
					>
						{/* The web's two faint rings in the corner. */}
						{[-48, -112].map((right) => (
							<View
								key={right}
								style={{
									position: "absolute",
									top: right === -48 ? -144 : -80,
									right,
									width: 384,
									height: 384,
									borderRadius: 192,
									borderWidth: 1,
									borderColor: palette.separator,
									opacity: 0.6,
								}}
							/>
						))}
					</View>
				)}
			</View>
			<View
				style={{
					flexDirection: "row",
					alignItems: "flex-end",
					paddingHorizontal: space.sm,
				}}
			>
				<View
					style={{
						marginTop: -40,
						width: 96,
						height: 96,
						borderRadius: 48,
						borderWidth: 5,
						borderColor: palette.background,
						backgroundColor: palette.surface,
						overflow: "hidden",
						alignItems: "center",
						justifyContent: "center",
					}}
				>
					{avatar ? (
						<Image
							source={{ uri: avatar }}
							style={{ width: 86, height: 86 }}
							contentFit="cover"
						/>
					) : (
						<Text variant="display" style={{ fontSize: 30, lineHeight: 36 }}>
							{name.slice(0, 1).toUpperCase()}
						</Text>
					)}
				</View>
				<View style={{ flex: 1 }} />
				<IconButton label={t("mobile.me.account")} onPress={openMenu}>
					<Icon name={icons.more} size={20} color={palette.text} />
				</IconButton>
			</View>
			<View
				style={{
					gap: space.xs,
					paddingHorizontal: space.sm,
					paddingTop: space.lg,
				}}
			>
				<Text variant="largeTitle" selectable accessibilityRole="header">
					{name}
				</Text>
				<Text variant="subhead" tone="secondary" selectable>
					@{username}
				</Text>
			</View>
		</View>
	);
}

/** Every shelf as a rail with its count, books first, then audiobooks, then
 * the user's public collections (the web's overview tab). */
function Overview({
	username,
	onViewMore,
}: {
	username: string;
	onViewMore: (tab: Tab) => void;
}) {
	const { orpc } = useApi();
	const tileWidth = useGridTileWidth(2, space.lg);
	const bookShelves = useQueries({
		queries: BOOK_SECTIONS.map((section) =>
			orpc.bookShelf.getPublicShelfPaginated.queryOptions({
				input: { username, status: section.status, limit: RAIL, offset: 0 },
				enabled: !!username,
				staleTime: 60_000,
			}),
		),
	});
	const audioShelves = useQueries({
		queries: AUDIO_SECTIONS.map((section) =>
			orpc.audiobookShelf.getPublicShelfPaginated.queryOptions({
				input: { username, status: section.status, limit: RAIL, offset: 0 },
				enabled: !!username,
				staleTime: 60_000,
			}),
		),
	});
	const collections = useQuery({
		...orpc.collections.listPublic.queryOptions({
			input: { username, limit: 4 },
		}),
		enabled: !!username,
	});

	if (!username || bookShelves.some((query) => query.isPending))
		return <ShelfSkeleton width={sizes.tile} />;

	const rails = [
		...BOOK_SECTIONS.map((section, index) => ({
			key: `book:${section.status}`,
			label: section.label(),
			data: bookShelves[index]?.data,
			kind: "book" as const,
			tab: "books" as const,
		})),
		...AUDIO_SECTIONS.map((section, index) => ({
			key: `audio:${section.status}`,
			label: section.label(),
			data: audioShelves[index]?.data,
			kind: "audiobook" as const,
			tab: "audiobooks" as const,
		})),
	].filter((rail) => (rail.data?.items.length ?? 0) > 0);

	return (
		<View style={{ gap: space.xxl, paddingBottom: space.xl }}>
			{rails.length === 0 ? <EmptyShelves /> : null}
			{rails.map((rail) => (
				<Shelf
					key={rail.key}
					title={`${rail.label}  ·  ${rail.data?.total ?? 0}`}
					onMore={() => onViewMore(rail.tab)}
					items={rail.data?.items.map((row) => toTile(row, rail.kind))}
				/>
			))}
			{collections.data && collections.data.length > 0 ? (
				<View style={{ gap: space.lg, paddingHorizontal: space.lg }}>
					<Text variant="section" accessibilityRole="header">
						{t("mobile.me.public_collections")}
					</Text>
					<View
						style={{ flexDirection: "row", flexWrap: "wrap", gap: space.lg }}
					>
						{collections.data.map((collection) => (
							<CollectionCard
								key={collection.id}
								href={routes.collection(collection.id)}
								name={collection.name}
								covers={collection.previewCovers ?? []}
								subtitle={t("media.item_count", {
									count: collection.bookCount ?? 0,
								})}
								width={tileWidth}
							/>
						))}
					</View>
				</View>
			) : null}
		</View>
	);
}

function EmptyShelves() {
	const palette = usePalette();
	return (
		<View
			style={{
				marginHorizontal: space.lg,
				alignItems: "center",
				gap: space.xs,
				paddingVertical: space.xxl,
				paddingHorizontal: space.xl,
				borderRadius: radius.card,
				borderCurve: "continuous",
				borderWidth: 1,
				borderColor: palette.separator,
			}}
		>
			<View
				style={{
					width: 48,
					height: 48,
					borderRadius: 24,
					backgroundColor: palette.surface,
					alignItems: "center",
					justifyContent: "center",
					marginBottom: space.sm,
				}}
			>
				<Icon name={icons.book} size={22} color={palette.textSecondary} />
			</View>
			<Text variant="headline">{t("nav.books")}</Text>
			<Text variant="subhead" tone="secondary" style={{ textAlign: "center" }}>
				{t("catalog_pages.empty_shelf")}
			</Text>
		</View>
	);
}
