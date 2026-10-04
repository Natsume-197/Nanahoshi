import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { Image } from "expo-image";
import { router, Stack, useIsFocused } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useRef, useState } from "react";
import { Platform, Pressable, useWindowDimensions, View } from "react-native";
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
import { bannerFrame } from "./banner-model";

type Tab = "books" | "audiobooks";
type BookStatus = "completed" | "reading" | "backlog" | "want_to_read";
type AudioStatus = "listening" | "completed" | "backlog" | "want_to_listen";
const PAGE = 40;
const AVATAR = 96;
/** Android 12+ blurs the rendered view; older ones blur the bitmap. */
const NATIVE_BLUR = IS_ANDROID && Number(Platform.Version) >= 31;

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

	// X's profile bar: the banner pins behind it, blurred, and the name fades
	// in over it once the name scrolls under.
	const bar = useDetailHeader(name, {
		overImage: true,
		subtitle: grid.total != null ? grid.count(grid.total) : undefined,
	});
	const insets = useSafeAreaInsets();
	const { width } = useWindowDimensions();
	// Full bleed under the status bar; the 4:1 banner crops to its middle.
	const bannerHeight = insets.top + Math.max(150, Math.round(width / 2.4));

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

	const focused = useIsFocused();
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
			{/* Tabs stay mounted, so only the focused profile lightens the bar. */}
			{focused ? <StatusBar style="light" /> : null}
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
							bannerHeight={bannerHeight}
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
			{/* Over the page, in this order: the banner, then the avatar. */}
			<ProfileBanner
				scrollY={bar.scrollY}
				restHeight={bannerHeight}
				barBottom={bar.barBottom}
				image={profile.data?.headerImage ?? null}
			/>
			<ProfileAvatar
				scrollY={bar.scrollY}
				bannerHeight={bannerHeight}
				barBottom={bar.barBottom}
				profile={profile.data ?? null}
			/>
		</View>
	);
}

/**
 * The banner, over the page: it rides up with the page until only the bar's
 * height is left, then pins and the page slides beneath it. Transforms only:
 * re-laying out or re-stacking views mid-scroll stops an Android fling. A
 * pre-blurred copy fades in over the sharp one, so nothing re-blurs per frame.
 */
function ProfileBanner({
	scrollY,
	restHeight,
	barBottom,
	image,
}: {
	scrollY: SharedValue<number>;
	restHeight: number;
	barBottom: number;
	image: string | null;
}) {
	const palette = usePalette();
	const { serverUrl } = useConnection();
	const banner = mediaUrl(serverUrl, image);
	const frameStyle = useAnimatedStyle(() => {
		const frame = bannerFrame(scrollY.get(), restHeight, barBottom);
		return {
			transform: [
				{ translateY: -Math.max(0, restHeight - frame.height) },
				{ scale: frame.scale },
			],
		};
	});
	// The picture stays centred in whatever is left on screen.
	const pictureStyle = useAnimatedStyle(() => {
		const frame = bannerFrame(scrollY.get(), restHeight, barBottom);
		return {
			transform: [{ translateY: Math.max(0, restHeight - frame.height) / 2 }],
		};
	});
	const blurStyle = useAnimatedStyle(() => ({
		opacity: bannerFrame(scrollY.get(), restHeight, barBottom).progress,
	}));
	const scrimStyle = useAnimatedStyle(() => ({
		opacity: bannerFrame(scrollY.get(), restHeight, barBottom).scrim,
	}));
	const picture = (blurred: boolean) =>
		banner ? (
			<Image
				source={{ uri: banner }}
				style={{ position: "absolute", inset: 0 }}
				contentFit="cover"
				cachePolicy="memory-disk"
				blurRadius={blurred && !NATIVE_BLUR ? 40 : 0}
				transition={blurred ? 0 : 200}
			/>
		) : (
			<View
				style={{
					position: "absolute",
					inset: 0,
					backgroundColor: palette.accentSoft,
				}}
			/>
		);

	return (
		<Animated.View
			pointerEvents="none"
			style={[
				{
					position: "absolute",
					top: 0,
					left: 0,
					right: 0,
					height: restHeight,
					overflow: "hidden",
					transformOrigin: "top",
				},
				frameStyle,
			]}
		>
			<Animated.View style={[{ position: "absolute", inset: 0 }, pictureStyle]}>
				{picture(false)}
				<Animated.View
					style={[
						{
							position: "absolute",
							inset: 0,
							...(NATIVE_BLUR && { filter: [{ blur: 24 }] }),
						},
						blurStyle,
					]}
				>
					{picture(true)}
				</Animated.View>
				<Animated.View
					style={[
						{ position: "absolute", inset: 0, backgroundColor: "#000000" },
						scrimStyle,
					]}
				/>
			</Animated.View>
		</Animated.View>
	);
}

function ProfileHeader({
	bannerHeight,
	onTitleOffset,
	profile,
}: {
	bannerHeight: number;
	onTitleOffset: (y: number) => void;
	profile: ProfileData | null;
}) {
	const username = profile?.displayUsername ?? profile?.username ?? "";
	const name = profile?.name?.trim() || username;
	// Where the name sits in the list, for the bar's fade.
	const infoY = useRef(0);
	const nameY = useRef(0);

	return (
		<View>
			{/* Room for the banner, which lives behind the page. */}
			<View style={{ height: bannerHeight }} />

			<View
				style={{ paddingHorizontal: space.lg, gap: space.lg }}
				onLayout={(event) => {
					infoY.current = event.nativeEvent.layout.y;
					onTitleOffset(infoY.current + nameY.current);
				}}
			>
				{/* The avatar's seat; it's drawn above the banner (ProfileAvatar). */}
				<View style={{ height: AVATAR, marginTop: -AVATAR / 2 }} />

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

/** Your own profile's top bar: ⋯ then settings, on dark discs over the
 * banner as on X. */
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
	return (
		<Pressable
			accessibilityRole="button"
			accessibilityLabel={label}
			onPress={onPress}
			style={{
				width: 48,
				height: 48,
				alignItems: "center",
				justifyContent: "center",
			}}
		>
			<View
				style={{
					width: 36,
					height: 36,
					borderRadius: 18,
					backgroundColor: "rgba(0,0,0,0.45)",
					alignItems: "center",
					justifyContent: "center",
				}}
			>
				<Icon name={icon} size={20} color="#ffffff" />
			</View>
		</Pressable>
	);
}

/**
 * The avatar, drawn above the banner and moved with the page. Its layer
 * starts at the bar's bottom edge, so it slips under the pinned banner
 * instead of covering it; it shrinks to half from its bottom edge so it has
 * just left the banner as the banner pins.
 */
function ProfileAvatar({
	scrollY,
	bannerHeight,
	barBottom,
	profile,
}: {
	scrollY: SharedValue<number>;
	bannerHeight: number;
	barBottom: number;
	profile: ProfileData | null;
}) {
	const palette = usePalette();
	const { serverUrl } = useConnection();
	const username = profile?.displayUsername ?? profile?.username ?? "";
	const name = profile?.name?.trim() || username;
	const avatar = mediaUrl(serverUrl, profile?.image);
	const style = useAnimatedStyle(() => {
		const y = scrollY.get();
		return {
			transform: [
				{ translateY: -y },
				{ scale: bannerFrame(y, bannerHeight, barBottom).avatarScale },
			],
		};
	});

	return (
		<View
			pointerEvents="none"
			style={{
				position: "absolute",
				top: barBottom,
				left: 0,
				right: 0,
				bottom: 0,
				overflow: "hidden",
			}}
		>
			<Animated.View
				style={[
					{
						position: "absolute",
						top: bannerHeight - AVATAR / 2 - barBottom,
						left: space.lg,
						width: AVATAR,
						height: AVATAR,
						borderRadius: AVATAR / 2,
						borderWidth: 4,
						borderColor: palette.background,
						backgroundColor: palette.surface,
						overflow: "hidden",
						alignItems: "center",
						justifyContent: "center",
						transformOrigin: "left bottom",
					},
					style,
				]}
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
			</Animated.View>
		</View>
	);
}
