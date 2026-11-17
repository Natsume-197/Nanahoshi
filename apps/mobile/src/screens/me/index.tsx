import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { Image } from "expo-image";
import { router, Stack } from "expo-router";
import { useState } from "react";
import { StyleSheet, useWindowDimensions, View } from "react-native";
import {
	useAnimatedScrollHandler,
	useSharedValue,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppBarAction } from "@/components/home-app-bar";
import { icons } from "@/components/icon";
import { LineTabs } from "@/components/line-tabs";
import { PinnedRow, PinnedSlot, usePinnedRow } from "@/components/pinned-row";
import { Pressable } from "@/components/pressable";
import { SortButton } from "@/components/sort-button";
import { ErrorState, OfflineState } from "@/components/states";
import { Text } from "@/components/text";
import { BARE_GAP, TitleGrid } from "@/components/title-grid";
import type { TileItem } from "@/components/title-tile";
import { useIsOnline } from "@/downloads/provider";
import { formatCount, joinNames } from "@/lib/format";
import { locale, t } from "@/lib/i18n";
import { mediaUrl } from "@/lib/media";
import { IS_ANDROID } from "@/lib/platform";
import { useApi, useConnection } from "@/providers/app-provider";
import { radius, space, usePalette } from "@/theme";
import { ProfileEmpty } from "./profile-empty";
import {
	membershipOf,
	monthYear,
	type ProfileFigures,
	profileFigures,
	type ServerRole,
} from "./profile-model";

type Tab = "books" | "audiobooks";
type BookStatus = "completed" | "reading" | "backlog" | "want_to_read";
type AudioStatus = "listening" | "completed" | "backlog" | "want_to_listen";
const PAGE = 40;
const AVATAR = 96;
const COLUMNS = 3;

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

const ROLE_LABEL: Record<ServerRole, () => string> = {
	owner: () => t("settings.members.owner"),
	admin: () => t("settings.invitations.admin"),
	member: () => t("settings.members.member"),
};

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
		subtitle: joinNames(row.authors ?? []),
		authors: row.authors ?? [],
	};
}

type ProfileData = {
	id: string;
	name: string;
	username: string | null;
	displayUsername: string | null;
	image: string | null;
	headerImage: string | null;
};

/** The account tab: your own profile page. */
export function Me() {
	return <Profile />;
}

/**
 * A member's page: the server's name and your shortcuts on top, a low banner
 * over a centred identity (avatar, name, role and join date, three shelf
 * figures), then Books / Audiobooks as a grid of covers. Another member's
 * page is the same, read-only.
 */
export function Profile({ username: requested }: { username?: string }) {
	const { orpc } = useApi();
	const { auth } = useConnection();
	const own = useQuery(orpc.profile.getProfile.queryOptions());
	const isOwn =
		!requested ||
		(!!own.data?.username && own.data.username === requested.toLowerCase());
	const other = useQuery({
		...orpc.profile.getPublicProfile.queryOptions({
			input: { username: requested ?? "" },
		}),
		enabled: !isOwn && !!requested,
	});
	const profile = isOwn ? own : other;
	const username = profile.data?.username ?? "";
	const server = auth.useActiveOrganization();
	const membership = membershipOf(server.data?.members, profile.data?.id);
	const [tab, setTab] = useState<Tab>("books");
	const [bookStatus, setBookStatus] = useState<BookStatus | "all">("all");
	const [audioStatus, setAudioStatus] = useState<AudioStatus | "all">("all");
	const figures = useShelfFigures(username);

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

	const audio = tab === "audiobooks";
	const status = audio ? audioStatus : bookStatus;
	const grid = audio
		? {
				query: audiobooks,
				items: (audiobooks.data?.pages.flatMap((page) => page.items) ?? []).map(
					(row) => toTile(row, "audiobook"),
				),
				total: audiobooks.data?.pages[0]?.total,
				count: (n: number) => t("media.audiobook_count", { count: n }),
			}
		: {
				query: books,
				items: (books.data?.pages.flatMap((page) => page.items) ?? []).map(
					(row) => toTile(row, "book"),
				),
				total: books.data?.pages[0]?.total,
				count: (n: number) => t("media.book_count", { count: n }),
			};

	// Books ⇄ audiobooks sticks under the bar once the identity scrolls away.
	const scrollY = useSharedValue(0);
	const onScroll = useAnimatedScrollHandler((event) => {
		scrollY.set(event.contentOffset.y);
	});
	const pinned = usePinnedRow();
	const pinTop = useSharedValue(0);
	const offline = !useIsOnline();

	const selector = audio ? (
		<SortButton
			icon={null}
			value={audioStatus}
			onChange={setAudioStatus}
			options={[
				{ value: "all" as const, label: t("catalog_pages.all") },
				...AUDIO_SECTIONS.map((section) => ({
					value: section.status,
					label: section.label(),
				})),
			]}
		/>
	) : (
		<SortButton
			icon={null}
			value={bookStatus}
			onChange={setBookStatus}
			options={[
				{ value: "all" as const, label: t("catalog_pages.all") },
				...BOOK_SECTIONS.map((section) => ({
					value: section.status,
					label: section.label(),
				})),
			]}
		/>
	);

	const empty = offline ? (
		<OfflineState />
	) : grid.query.isSuccess ? (
		<ProfileEmpty
			audio={audio}
			message={
				!isOwn
					? t("mobile.profile.empty_other")
					: status !== "all"
						? t("mobile.profile.empty_status")
						: t(
								audio
									? "mobile.profile.empty_audiobooks"
									: "mobile.profile.empty_books",
							)
			}
			action={
				isOwn && status === "all"
					? {
							label: t("mobile.profile.browse"),
							format: audio ? "audiobook" : "ebook",
						}
					: null
			}
		/>
	) : undefined;

	if (!isOwn && other.isError)
		return <ErrorState onRetry={() => other.refetch()} />;

	return (
		<View style={{ flex: 1 }}>
			<ProfileScreenOptions own={isOwn} serverName={server.data?.name ?? ""} />
			{isOwn && IS_ANDROID ? (
				<ProfileTopBar serverName={server.data?.name ?? ""} />
			) : null}
			<View style={{ flex: 1 }}>
				<TitleGrid
					bare
					columns={COLUMNS}
					onScroll={onScroll}
					items={offline ? [] : grid.items}
					query={grid.query}
					empty={empty}
					header={
						<View
							style={{
								marginHorizontal: -(space.lg - BARE_GAP / 2),
								paddingBottom: space.sm,
							}}
						>
							<Identity
								profile={profile.data ?? null}
								role={membership?.role ?? null}
								joinedAt={membership?.joinedAt ?? null}
								figures={figures}
								own={isOwn}
							/>
							{offline ? null : (
								<PinnedSlot pinned={pinned} marginTop={space.xl} />
							)}
							{offline ? null : (
								<View
									style={{
										flexDirection: "row",
										alignItems: "center",
										justifyContent: "space-between",
										paddingHorizontal: space.md,
										paddingTop: space.sm,
									}}
								>
									{selector}
									{grid.total != null ? (
										<Text variant="caption" tone="tertiary">
											{grid.count(grid.total)}
										</Text>
									) : null}
								</View>
							)}
						</View>
					}
				/>
				{offline ? null : (
					<PinnedRow pinned={pinned} scrollY={scrollY} pinTop={pinTop}>
						<LineTabs
							centered
							value={tab}
							onChange={setTab}
							options={[
								{ value: "books", label: t("nav.books") },
								{ value: "audiobooks", label: t("nav.audiobooks") },
							]}
						/>
					</PinnedRow>
				)}
			</View>
		</View>
	);
}

/** Shelf totals for the three figures: one-row pages, so only `total`. */
function useShelfFigures(username: string): ProfileFigures | null {
	const { orpc } = useApi();
	const book = (status: "completed" | "reading" | "want_to_read") =>
		({
			...orpc.bookShelf.getPublicShelfPaginated.queryOptions({
				input: { username, status, limit: 1, offset: 0 },
			}),
			enabled: !!username,
		}) as const;
	const audio = (status: "completed" | "listening" | "want_to_listen") =>
		({
			...orpc.audiobookShelf.getPublicShelfPaginated.queryOptions({
				input: { username, status, limit: 1, offset: 0 },
			}),
			enabled: !!username,
		}) as const;
	const booksDone = useQuery(book("completed"));
	const booksReading = useQuery(book("reading"));
	const booksWant = useQuery(book("want_to_read"));
	const audioDone = useQuery(audio("completed"));
	const audioListening = useQuery(audio("listening"));
	const audioWant = useQuery(audio("want_to_listen"));
	return profileFigures(
		{
			completed: booksDone.data?.total,
			reading: booksReading.data?.total,
			want: booksWant.data?.total,
		},
		{
			completed: audioDone.data?.total,
			reading: audioListening.data?.total,
			want: audioWant.data?.total,
		},
	);
}

/** Your own page names the server it belongs to, with notifications and
 * settings beside it; another member's page is a pushed page with back. */
function ProfileScreenOptions({
	own,
	serverName,
}: {
	own: boolean;
	serverName: string;
}) {
	const palette = usePalette();
	if (!own)
		return (
			<Stack.Screen
				options={{
					title: "",
					headerShown: true,
					headerShadowVisible: false,
					headerStyle: { backgroundColor: palette.background },
				}}
			/>
		);
	if (IS_ANDROID) return <Stack.Screen options={{ headerShown: false }} />;
	return (
		<Stack.Screen
			options={{
				title: serverName,
				headerShown: true,
				headerLargeTitle: false,
				headerShadowVisible: false,
				unstable_headerRightItems: () => [
					{
						type: "button",
						label: t("notifications.title"),
						icon: { type: "sfSymbol", name: "bell" },
						onPress: () => router.push("/notifications"),
					},
					{
						type: "button",
						label: t("nav.settings"),
						icon: { type: "sfSymbol", name: icons.settings.ios },
						onPress: () => router.push("/settings"),
					},
				],
			}}
		/>
	);
}

function ProfileTopBar({ serverName }: { serverName: string }) {
	const { orpc } = useApi();
	const insets = useSafeAreaInsets();
	const unread = useQuery({
		...orpc.notifications.unreadCount.queryOptions(),
		refetchInterval: 60_000,
	});
	return (
		<View
			style={{
				paddingTop: insets.top,
				paddingLeft: space.lg,
				paddingRight: 4,
				height: insets.top + 64,
				flexDirection: "row",
				alignItems: "center",
			}}
		>
			<Text
				variant="section"
				accessibilityRole="header"
				numberOfLines={1}
				style={{ flex: 1, fontWeight: "500" }}
			>
				{serverName}
			</Text>
			<AppBarAction
				label={t("notifications.title")}
				icon={{ ios: "bell", android: "notifications" }}
				badge={(unread.data?.count ?? 0) > 0}
				onPress={() => router.push("/notifications")}
			/>
			<AppBarAction
				label={t("nav.settings")}
				icon={icons.settings}
				onPress={() => router.push("/settings")}
			/>
		</View>
	);
}

function Identity({
	profile,
	role,
	joinedAt,
	figures,
	own,
}: {
	profile: ProfileData | null;
	role: ServerRole | null;
	joinedAt: Date | null;
	figures: ProfileFigures | null;
	own: boolean;
}) {
	const palette = usePalette();
	const { serverUrl } = useConnection();
	const { width } = useWindowDimensions();
	const username = profile?.displayUsername ?? profile?.username ?? "";
	const name = profile?.name?.trim() || username;
	const avatar = mediaUrl(serverUrl, profile?.image);
	const banner = mediaUrl(serverUrl, profile?.headerImage);
	const bannerHeight = Math.round(width / 3.2);
	const pills = [
		role ? { key: "role", label: ROLE_LABEL[role](), strong: true } : null,
		joinedAt
			? {
					key: "joined",
					label: t("mobile.profile.joined", {
						date: monthYear(joinedAt, locale),
					}),
					strong: false,
				}
			: null,
	].filter((pill) => pill !== null);

	return (
		<View style={{ alignItems: "center" }}>
			{banner ? (
				<View
					style={{
						alignSelf: "stretch",
						height: bannerHeight,
						overflow: "hidden",
						backgroundColor: palette.surface,
					}}
				>
					<Image
						source={{ uri: banner }}
						style={{ flex: 1 }}
						contentFit="cover"
						cachePolicy="memory-disk"
						transition={200}
					/>
				</View>
			) : null}
			<View
				style={{
					width: AVATAR,
					height: AVATAR,
					marginTop: banner ? -AVATAR / 2 : space.lg,
					borderRadius: AVATAR / 2,
					borderWidth: banner ? 4 : 0,
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
						style={{ width: "100%", height: "100%" }}
						contentFit="cover"
					/>
				) : (
					<Text variant="display">{name.slice(0, 1).toUpperCase()}</Text>
				)}
			</View>

			<View style={{ alignItems: "center", gap: 2, marginTop: space.md }}>
				<Text
					variant="title"
					selectable
					accessibilityRole="header"
					style={{ textAlign: "center", paddingHorizontal: space.lg }}
				>
					{name}
				</Text>
				{username ? (
					<Text variant="subhead" tone="secondary" selectable>
						@{username}
					</Text>
				) : null}
			</View>

			{pills.length > 0 ? (
				<View
					style={{
						flexDirection: "row",
						flexWrap: "wrap",
						justifyContent: "center",
						gap: space.sm,
						marginTop: space.lg,
						paddingHorizontal: space.lg,
					}}
				>
					{pills.map((pill) => (
						<View
							key={pill.key}
							style={{
								height: 30,
								paddingHorizontal: 14,
								borderRadius: radius.pill,
								borderWidth: 1,
								borderColor: palette.fieldBorder,
								justifyContent: "center",
							}}
						>
							<Text
								variant="subhead"
								tone={pill.strong ? undefined : "secondary"}
							>
								{pill.label}
							</Text>
						</View>
					))}
				</View>
			) : null}

			<Figures figures={figures} own={own} />

			{own ? (
				<Pressable
					accessibilityRole="button"
					onPress={() => router.push("/settings/profile")}
					android_ripple={{ color: palette.ripple }}
					style={{
						alignSelf: "stretch",
						marginHorizontal: space.lg,
						marginTop: space.xl,
						height: 44,
						borderRadius: radius.pill,
						borderWidth: 1,
						borderColor: palette.fieldBorder,
						overflow: "hidden",
						alignItems: "center",
						justifyContent: "center",
					}}
				>
					<Text variant="headline">{t("user_profile.edit_profile")}</Text>
				</Pressable>
			) : null}
		</View>
	);
}

/** Three numbers over their labels, split by hairlines. Your own open the
 * reading stats. */
function Figures({
	figures,
	own,
}: {
	figures: ProfileFigures | null;
	own: boolean;
}) {
	const palette = usePalette();
	const cells = [
		{
			key: "finished",
			value: figures?.finished,
			label: t("mobile.profile.finished"),
		},
		{
			key: "progress",
			value: figures?.inProgress,
			label: t("book.shelf_in_progress"),
		},
		{
			key: "want",
			value: figures?.wantTo,
			label: t("book.shelf_want_to_start"),
		},
	];
	const row = (
		<View style={{ flexDirection: "row", alignItems: "center" }}>
			{cells.map((cell, index) => (
				<View
					key={cell.key}
					style={{ flex: 1, flexDirection: "row", alignItems: "center" }}
				>
					{index > 0 ? (
						<View
							style={{
								width: StyleSheet.hairlineWidth,
								height: 32,
								backgroundColor: palette.separator,
							}}
						/>
					) : null}
					<View style={{ flex: 1, alignItems: "center", gap: 2 }}>
						<Text
							variant="section"
							style={{ fontWeight: "500", fontVariant: ["tabular-nums"] }}
						>
							{cell.value == null ? "–" : formatCount(cell.value)}
						</Text>
						<Text variant="subhead" tone="secondary" numberOfLines={1}>
							{cell.label}
						</Text>
					</View>
				</View>
			))}
		</View>
	);
	const frame = {
		alignSelf: "stretch" as const,
		marginTop: space.xl,
		paddingHorizontal: space.sm,
	};
	if (!own) return <View style={frame}>{row}</View>;
	return (
		<Pressable
			accessibilityRole="button"
			accessibilityLabel={t("nav.stats")}
			onPress={() => router.push("/stats")}
			style={({ pressed }) => [frame, { opacity: pressed ? 0.6 : 1 }]}
		>
			{row}
		</Pressable>
	);
}
