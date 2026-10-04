import { useInfiniteQuery, useQueries, useQuery } from "@tanstack/react-query";
import { Image } from "expo-image";
import { router, Stack } from "expo-router";
import { useState } from "react";
import {
	Platform,
	useColorScheme,
	useWindowDimensions,
	View,
} from "react-native";
import Animated, {
	Extrapolation,
	interpolate,
	type SharedValue,
	useAnimatedScrollHandler,
	useAnimatedStyle,
	useSharedValue,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button, IconButton } from "@/components/button";
import { ChipRow } from "@/components/chip";
import { CollectionCard } from "@/components/collection-card";
import { Icon, icons } from "@/components/icon";
import { LineTabs } from "@/components/line-tabs";
import { askChoice } from "@/components/prompt";
import { Shelf } from "@/components/shelf";
import { ErrorState, ShelfSkeleton } from "@/components/states";
import { Text } from "@/components/text";
import { TitleGrid } from "@/components/title-grid";
import type { TileItem } from "@/components/title-tile";
import { clearDownloads } from "@/downloads/files";
import { useGridTileWidth } from "@/hooks/use-grid-tile-width";
import { formatCount, joinNames } from "@/lib/format";
import { t } from "@/lib/i18n";
import { mediaUrl } from "@/lib/media";
import { IS_ANDROID } from "@/lib/platform";
import { routes } from "@/lib/routes";
import { useApi, useConnection, useServer } from "@/providers/app-provider";
import { radius, sizes, space, usePalette } from "@/theme";
import { buildRails } from "./profile-model";

type Tab = "overview" | "books" | "audiobooks" | "likes";
type BookStatus = "completed" | "reading" | "backlog" | "want_to_read";
type AudioStatus = "listening" | "completed" | "backlog" | "want_to_listen";
const PAGE = 40;
const RAIL = 12;
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
		subtitle: joinNames(row.authors ?? [], 1),
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
 * name, then Overview / Books / Audiobooks, plus Likes on your own, whose ⋯
 * menu carries the account actions. Another member's is read-only. */
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
	const [tab, setTab] = useState<Tab>("overview");
	const [bookStatus, setBookStatus] = useState<BookStatus | "all">("all");
	const [audioStatus, setAudioStatus] = useState<AudioStatus | "all">("all");
	const [likedFormat, setLikedFormat] = useState<"books" | "audiobooks">(
		"books",
	);
	const scrollY = useSharedValue(0);
	const onScroll = useAnimatedScrollHandler({
		onScroll: (event) => {
			scrollY.set(event.contentOffset.y);
		},
	});
	const viewShelf = (next: "books" | "audiobooks", status: string) => {
		if (next === "books") setBookStatus(status as BookStatus | "all");
		else setAudioStatus(status as AudioStatus | "all");
		setTab(next);
	};

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
		enabled: isOwn && tab === "likes",
	});
	const likedCount = useQuery({
		...orpc.likedBooks.count.queryOptions({ input: { format: likedFormat } }),
		enabled: isOwn && tab === "likes",
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

	if (!isOwn && other.isError)
		return <ErrorState onRetry={() => other.refetch()} />;

	return (
		<View style={{ flex: 1 }}>
			{/* The banner runs under a see-through bar (iOS; Android hides it). */}
			<Stack.Screen
				options={{
					title: "",
					headerTransparent: true,
					headerStyle: { backgroundColor: "transparent" },
				}}
			/>
			<TitleGrid
				onScroll={onScroll}
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
						<Overview username={username} onViewMore={viewShelf} />
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
						<ProfileHeader
							scrollY={scrollY}
							profile={profile.data ?? null}
							isOwn={isOwn}
						/>
						<LineTabs
							value={tab}
							onChange={setTab}
							options={[
								{ value: "overview", label: t("mobile.me.overview") },
								{ value: "books", label: t("nav.books") },
								{ value: "audiobooks", label: t("nav.audiobooks") },
								// Likes are private, so only your own profile has the tab.
								...(isOwn
									? [{ value: "likes" as const, label: t("mobile.me.likes") }]
									: []),
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
			{IS_ANDROID ? <StatusBarScrim scrollY={scrollY} /> : null}
		</View>
	);
}

/** Android has no bar over the page: once the banner is gone, a strip of
 * page colour keeps the list from running into the status bar. */
function StatusBarScrim({ scrollY }: { scrollY: SharedValue<number> }) {
	const palette = usePalette();
	const insets = useSafeAreaInsets();
	const style = useAnimatedStyle(() => ({
		opacity: interpolate(
			scrollY.get(),
			[insets.top * 2, insets.top * 4],
			[0, 1],
			Extrapolation.CLAMP,
		),
	}));
	return (
		<Animated.View
			pointerEvents="none"
			style={[
				{
					position: "absolute",
					top: 0,
					left: 0,
					right: 0,
					height: insets.top,
					backgroundColor: palette.background,
				},
				style,
			]}
		/>
	);
}

function ProfileHeader({
	scrollY,
	profile,
	isOwn,
}: {
	scrollY: SharedValue<number>;
	profile: ProfileData | null;
	isOwn: boolean;
}) {
	const palette = usePalette();
	const dark = useColorScheme() === "dark";
	const insets = useSafeAreaInsets();
	const { width } = useWindowDimensions();
	const { auth, serverUrl } = useConnection();
	const { setServerUrl } = useServer();
	const username = profile?.displayUsername ?? profile?.username ?? "";
	const name = profile?.name?.trim() || username;
	const avatar = mediaUrl(serverUrl, profile?.image);
	const banner = mediaUrl(serverUrl, profile?.headerImage);
	const bg = palette.background;
	// Full bleed under the status bar; the 4:1 banner crops to its middle.
	const height = insets.top + Math.max(150, Math.round(width / 2.4));
	// Pulling past the top stretches the banner instead of opening a gap.
	const stretch = useAnimatedStyle(() => {
		const pull = Math.min(scrollY.get(), 0);
		return {
			transform: [{ translateY: pull / 2 }, { scale: 1 - pull / height }],
		};
	});

	const openMenu = async () => {
		const answer = await askChoice({
			title: t("mobile.me.account"),
			message: t("mobile.me.signed_in_as", { name: `@${username}` }),
			options: [
				{ id: "stats", label: t("nav.stats"), icon: icons.stats },
				{
					id: "downloads",
					label: t("mobile.downloads.title"),
					icon: icons.downloaded,
				},
				{ id: "tasks", label: t("settings.nav.tasks"), icon: icons.tasks },
				{ id: "settings", label: t("nav.settings"), icon: icons.settings },
				{
					id: "server",
					label: t("mobile.signin.change_server"),
					icon: icons.server,
				},
				{
					id: "sign-out",
					label: t("nav.sign_out"),
					icon: icons.signOut,
					destructive: true,
				},
			],
		});
		if (answer === "stats") router.push("/stats");
		else if (answer === "downloads") router.push("/downloads");
		else if (answer === "tasks") router.push("/tasks");
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
					) : avatar ? (
						<BlurredAvatar uri={avatar} dark={dark} />
					) : (
						<View
							style={{
								position: "absolute",
								inset: 0,
								experimental_backgroundImage: `linear-gradient(160deg, ${palette.accentSoft}, ${bg})`,
							}}
						/>
					)}
					{/* Keeps the status bar and the iOS bar buttons legible. */}
					<View
						style={{
							position: "absolute",
							top: 0,
							left: 0,
							right: 0,
							height: insets.top + 56,
							experimental_backgroundImage: `linear-gradient(to bottom, ${bg}99, ${bg}00)`,
						}}
					/>
					{/* The banner dissolves into the page, never a hard edge. */}
					<View
						style={{
							position: "absolute",
							left: 0,
							right: 0,
							bottom: 0,
							height: "55%",
							experimental_backgroundImage: `linear-gradient(to bottom, ${bg}00 0%, ${bg}40 40%, ${bg}b3 75%, ${bg} 100%)`,
						}}
					/>
				</Animated.View>
			</View>

			<View style={{ paddingHorizontal: space.lg, gap: space.lg }}>
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
					<View style={{ flex: 1 }} />
					{isOwn ? (
						<>
							<Button
								variant="secondary"
								label={t("user_profile.edit_profile")}
								onPress={() => router.push("/settings/profile")}
							/>
							<IconButton label={t("mobile.me.account")} onPress={openMenu}>
								<Icon name={icons.more} size={20} color={palette.text} />
							</IconButton>
						</>
					) : null}
				</View>

				<View style={{ gap: space.xs }}>
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

/** No banner yet: the avatar's own colours, blurred wide (the detail hero's
 * backdrop). */
function BlurredAvatar({ uri, dark }: { uri: string; dark: boolean }) {
	// Expo Image's bitmap blur is weak on Android 12+; blur the view instead.
	const nativeBlur =
		Platform.OS === "android" && Number(Platform.Version) >= 31;
	return (
		<View
			style={{
				position: "absolute",
				inset: -60,
				opacity: dark ? 0.55 : 0.45,
				filter: nativeBlur ? [{ blur: 50 }] : undefined,
			}}
		>
			<Image
				source={{ uri }}
				blurRadius={nativeBlur ? 0 : 50}
				contentFit="cover"
				style={{ position: "absolute", inset: 0 }}
			/>
		</View>
	);
}

/** What you're on now first, then what you finished, then what's waiting
 * (backlog and want-to shelves merged), then public collections. */
function Overview({
	username,
	onViewMore,
}: {
	username: string;
	onViewMore: (tab: "books" | "audiobooks", status: string) => void;
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

	const book = (status: BookStatus) =>
		bookShelves[BOOK_SECTIONS.findIndex((s) => s.status === status)]?.data;
	const audio = (status: AudioStatus) =>
		audioShelves[AUDIO_SECTIONS.findIndex((s) => s.status === status)]?.data;
	const rails = buildRails<ShelfRow>([
		{
			key: "reading",
			label: t("catalog_pages.reading"),
			kind: "book",
			status: "reading",
			pages: [book("reading")],
		},
		{
			key: "listening",
			label: t("catalog_pages.listening"),
			kind: "audiobook",
			status: "listening",
			pages: [audio("listening")],
		},
		{
			key: "books-completed",
			label: t("mobile.me.books_completed"),
			kind: "book",
			status: "completed",
			pages: [book("completed")],
		},
		{
			key: "audio-completed",
			label: t("mobile.me.audio_completed"),
			kind: "audiobook",
			status: "completed",
			pages: [audio("completed")],
		},
		{
			key: "books-pending",
			label: t("mobile.me.books_pending"),
			kind: "book",
			status: "all",
			pages: [book("backlog"), book("want_to_read")],
		},
		{
			key: "audio-pending",
			label: t("mobile.me.audio_backlog"),
			kind: "audiobook",
			status: "all",
			pages: [audio("backlog"), audio("want_to_listen")],
		},
	]);

	return (
		<View style={{ gap: space.xxl, paddingBottom: space.xl }}>
			{rails.length === 0 ? <EmptyShelves /> : null}
			{rails.map((rail) => (
				<Shelf
					key={rail.key}
					title={`${rail.label}  ·  ${formatCount(rail.total)}`}
					onMore={() =>
						onViewMore(
							rail.kind === "book" ? "books" : "audiobooks",
							rail.status,
						)
					}
					items={rail.items.map((row) => toTile(row, rail.kind))}
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
