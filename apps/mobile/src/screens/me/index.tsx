import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { Image } from "expo-image";
import { router, Stack } from "expo-router";
import { useRef, useState } from "react";
import { Pressable, useWindowDimensions, View } from "react-native";
import Animated, {
	type SharedValue,
	useAnimatedStyle,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ChipRow } from "@/components/chip";
import { Icon, type IconName, icons } from "@/components/icon";
import { LineTabs } from "@/components/line-tabs";
import { askChoice } from "@/components/prompt";
import { ErrorState, OfflineState } from "@/components/states";
import { Text } from "@/components/text";
import { TitleGrid } from "@/components/title-grid";
import type { TileItem } from "@/components/title-tile";
import { useIsOnline } from "@/downloads/provider";
import { joinNames } from "@/lib/format";
import { t } from "@/lib/i18n";
import { mediaUrl } from "@/lib/media";
import { IS_ANDROID } from "@/lib/platform";
import { useApi, useConnection } from "@/providers/app-provider";
import { useDetailHeader } from "@/screens/detail/use-detail-header";
import { space, usePalette } from "@/theme";

type Tab = "books" | "audiobooks";
type BookStatus = "completed" | "reading" | "backlog" | "want_to_read";
type AudioStatus = "listening" | "completed" | "backlog" | "want_to_listen";
const PAGE = 40;
const AVATAR = 96;

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
		subtitle: joinNames(row.authors ?? []),
	};
}

type ProfileData = {
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

/** The web's profile page (/dashboard/user/$username): banner, avatar and
 * name, then Books / Audiobooks; your own one's ⋯ menu carries the account
 * actions. Another member's is read-only. */
export function Profile({ username: requested }: { username?: string }) {
	const { orpc } = useApi();
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
	const [tab, setTab] = useState<Tab>("books");
	const [bookStatus, setBookStatus] = useState<BookStatus | "all">("all");
	const [audioStatus, setAudioStatus] = useState<AudioStatus | "all">("all");
	const name =
		profile.data?.name?.trim() ||
		profile.data?.displayUsername ||
		profile.data?.username ||
		"";
	// The book detail's bar: transparent over the banner, solid with the name
	// once the name scrolls under it.
	const bar = useDetailHeader(name);

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
			: {
					query: audiobooks,
					items: (
						audiobooks.data?.pages.flatMap((page) => page.items) ?? []
					).map((row) => toTile(row, "audiobook")),
					total: audiobooks.data?.pages[0]?.total,
					count: (n: number) => t("media.audiobook_count", { count: n }),
				};

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
		) : (
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
		);

	const emptyTitle = t(
		tab === "audiobooks" ? "shelves.empty_title" : "library_page.empty_title",
	);
	const emptyMessage =
		(tab === "books" ? bookStatus : audioStatus) !== "all"
			? t(
					tab === "audiobooks"
						? "catalog_pages.no_status_audiobooks"
						: "catalog_pages.no_status_books",
				)
			: t("catalog_pages.empty_shelf");

	// Offline the shelves can't load or change: say so instead of a stale grid.
	const offline = !useIsOnline();

	if (!isOwn && other.isError)
		return <ErrorState onRetry={() => other.refetch()} />;

	return (
		<View style={{ flex: 1 }}>
			{/* The banner runs under a see-through bar. */}
			<Stack.Screen
				options={{
					title: "",
					headerShown: true,
					headerTransparent: true,
					headerStyle: { backgroundColor: "transparent" },
					headerShadowVisible: false,
				}}
			/>
			{bar.header}
			{isOwn ? <ProfileBar username={username} /> : null}
			<TitleGrid
				onScroll={bar.scrollProps.onScroll}
				items={offline ? [] : grid.items}
				query={grid.query}
				empty={offline ? <OfflineState /> : undefined}
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
						<ProfileHeader
							scrollY={bar.scrollY}
							onTitleOffset={bar.onTitleOffset}
							profile={profile.data ?? null}
						/>
						{offline ? null : (
							<LineTabs
								value={tab}
								onChange={setTab}
								options={[
									{ value: "books", label: t("nav.books") },
									{ value: "audiobooks", label: t("nav.audiobooks") },
								]}
							/>
						)}
						{offline ? null : filters}
						{!offline && grid.total != null ? (
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
		</View>
	);
}

function ProfileHeader({
	scrollY,
	onTitleOffset,
	profile,
}: {
	scrollY: SharedValue<number>;
	onTitleOffset: (y: number) => void;
	profile: ProfileData | null;
}) {
	const palette = usePalette();
	const insets = useSafeAreaInsets();
	const { width } = useWindowDimensions();
	const { serverUrl } = useConnection();
	const username = profile?.displayUsername ?? profile?.username ?? "";
	const name = profile?.name?.trim() || username;
	const avatar = mediaUrl(serverUrl, profile?.image);
	const banner = mediaUrl(serverUrl, profile?.headerImage);
	const bg = palette.background;
	// Where the name sits in the list, for the bar's fade.
	const infoY = useRef(0);
	const nameY = useRef(0);
	// Full bleed under the status bar; the 4:1 banner crops to its middle.
	const height = insets.top + Math.max(150, Math.round(width / 2.4));
	// Pulling past the top stretches the banner instead of opening a gap.
	const stretch = useAnimatedStyle(() => {
		const pull = Math.min(scrollY.get(), 0);
		return {
			transform: [{ translateY: pull / 2 }, { scale: 1 - pull / height }],
		};
	});

	return (
		<View>
			<View style={{ height }}>
				<Animated.View
					pointerEvents="none"
					style={[
						{ position: "absolute", inset: 0, overflow: "hidden" },
						stretch,
					]}
				>
					{banner ? (
						<Image
							source={{ uri: banner }}
							style={{ position: "absolute", inset: 0 }}
							contentFit="cover"
							transition={200}
						/>
					) : (
						<View
							style={{
								position: "absolute",
								inset: 0,
								backgroundColor: palette.accentSoft,
							}}
						/>
					)}
				</Animated.View>
			</View>

			<View
				style={{ paddingHorizontal: space.lg, gap: space.lg }}
				onLayout={(event) => {
					infoY.current = event.nativeEvent.layout.y;
					onTitleOffset(infoY.current + nameY.current);
				}}
			>
				<View
					style={{
						flexDirection: "row",
						alignItems: "flex-end",
						gap: space.sm,
						marginTop: -AVATAR / 2,
					}}
				>
					<View
						style={{
							width: AVATAR,
							height: AVATAR,
							borderRadius: AVATAR / 2,
							borderWidth: 4,
							borderColor: bg,
							backgroundColor: palette.surface,
							overflow: "hidden",
							alignItems: "center",
							justifyContent: "center",
						}}
					>
						{avatar ? (
							<Image
								source={{ uri: avatar }}
								style={{ width: AVATAR - 8, height: AVATAR - 8 }}
								contentFit="cover"
							/>
						) : (
							<Text variant="display">{name.slice(0, 1).toUpperCase()}</Text>
						)}
					</View>
				</View>

				<View
					style={{ gap: space.xs }}
					onLayout={(event) => {
						nameY.current = event.nativeEvent.layout.y;
						onTitleOffset(infoY.current + nameY.current);
					}}
				>
					<Text
						variant="largeTitle"
						selectable
						accessibilityRole="header"
						style={{ letterSpacing: -0.5 }}
					>
						{name}
					</Text>
					<Text variant="subhead" tone="secondary" selectable>
						@{username}
					</Text>
				</View>
			</View>
		</View>
	);
}

/** Your account's ⋯: the actions that have no tab of their own. */
function useAccountMenu(username: string) {
	return async () => {
		const answer = await askChoice({
			title: t("mobile.me.account"),
			message: t("mobile.me.signed_in_as", { name: `@${username}` }),
			options: [
				{
					id: "edit",
					label: t("user_profile.edit_profile"),
					icon: icons.edit,
				},
				{ id: "stats", label: t("nav.stats"), icon: icons.stats },
			],
		});
		if (answer === "edit") router.push("/settings/profile");
		else if (answer === "stats") router.push("/stats");
	};
}

/** Your own profile's top bar: ⋯ then settings, bare icons in the bar. */
function ProfileBar({ username }: { username: string }) {
	const openMenu = useAccountMenu(username);
	const openSettings = () => router.push("/settings");
	if (!IS_ANDROID)
		return (
			<Stack.Screen
				options={{
					unstable_headerRightItems: () => [
						{
							type: "button",
							label: t("mobile.me.account"),
							icon: { type: "sfSymbol", name: icons.more.ios },
							onPress: () => void openMenu(),
						},
						{
							type: "button",
							label: t("nav.settings"),
							icon: { type: "sfSymbol", name: icons.settings.ios },
							onPress: openSettings,
						},
					],
				}}
			/>
		);
	return (
		<Stack.Screen
			options={{
				headerRight: () => (
					<View style={{ flexDirection: "row", marginEnd: -space.sm }}>
						<BarButton
							label={t("mobile.me.account")}
							icon={icons.more}
							onPress={() => void openMenu()}
						/>
						<BarButton
							label={t("nav.settings")}
							icon={icons.settings}
							onPress={openSettings}
						/>
					</View>
				),
			}}
		/>
	);
}

function BarButton({
	label,
	icon,
	onPress,
}: {
	label: string;
	icon: IconName;
	onPress: () => void;
}) {
	const palette = usePalette();
	return (
		<Pressable
			accessibilityRole="button"
			accessibilityLabel={label}
			onPress={onPress}
			android_ripple={{ color: palette.ripple, borderless: true, radius: 20 }}
			style={{
				width: 48,
				height: 48,
				alignItems: "center",
				justifyContent: "center",
			}}
		>
			<Icon name={icon} size={24} color={palette.text} />
		</Pressable>
	);
}
