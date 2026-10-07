import { Image } from "expo-image";
import { type Href, router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { type ReactNode, useState } from "react";
import {
	type LayoutChangeEvent,
	Platform,
	useWindowDimensions,
	View,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
	FadeIn,
	useAnimatedStyle,
	useSharedValue,
	withSpring,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { scheduleOnRN } from "react-native-worklets";
import { ActionMenuButton, type MenuItem } from "@/components/action-menu";
import { ActionSheet } from "@/components/action-menu/action-sheet";
import { openAddToList } from "@/components/add-to-list/open";
import { Cover } from "@/components/cover";
import { Icon, icons } from "@/components/icon";
import { Pressable } from "@/components/pressable";
import { PressableScale } from "@/components/pressable-scale";
import { Text } from "@/components/text";
import { localCoverUri } from "@/downloads/files";
import { useMountEffect } from "@/hooks/use-mount-effect";
import { ambientScene } from "@/lib/color";
import { coverUrl } from "@/lib/covers";
import { haptics } from "@/lib/haptics";
import { t } from "@/lib/i18n";
import { IS_ANDROID } from "@/lib/platform";
import { routes } from "@/lib/routes";
import { useConnection } from "@/providers/app-provider";
import {
	openReadListenFromPlayer,
	useReadyPairing,
} from "@/reader/read-listen-entry";
import { EASE_OUT, motion, radius, SNAP_SPRING, shadows, space } from "@/theme";
import { useBookmarks } from "./bookmarks";
import { chapterLabel, chapterName } from "./chapter-name";
import {
	BufferingRing,
	JumpButton,
	PlayPauseGlyph,
	TransportButton,
	usePlayLabel,
} from "./controls";
import type { PlayerBook } from "./engine";
import { ink } from "./ink";
import { type ListTab, PlayerListSheet } from "./player-list-sheet";
import { PlayerSheets, type Sheet, SleepGlyph } from "./player-sheets";
import { usePlayer, usePlayerState } from "./provider";
import { type ScrubLabel, SeekBar } from "./seek-bar";
import { seekPreview } from "./seek-preview";
import { setTimeScope, type TimeScope, useTimeScope } from "./time-scope";
import {
	activeChapterIndex,
	clock,
	formatSpeed,
	positionsInSpan,
} from "./timing";

const PLAY = 76;

/**
 * The web's ExpandedPlayer on a phone: the cover blurred into the scene,
 * collapse and more at the top, the artwork, title, author and chapter, the
 * seek bar, the transport, Up Next, and speed / sleep /
 * bookmark / chapters along the bottom. Lists open in a sheet over it.
 */
export function ExpandedPlayer() {
	const book = usePlayerState((s) => s.book);
	if (!book) {
		// Closed from elsewhere (stop): nothing to show, go back down.
		return <Dismiss />;
	}
	// Remount per book so the scene and panels start fresh on the next one.
	return <Player key={book.uuid} book={book} />;
}

function Dismiss() {
	useMountEffect(() => {
		if (router.canGoBack()) router.back();
	});
	return <View style={{ flex: 1, backgroundColor: ink.floor }} />;
}

function Player({ book }: { book: PlayerBook }) {
	const insets = useSafeAreaInsets();
	const [sheet, setSheet] = useState<Sheet | null>(null);
	const [list, setList] = useState<ListTab | null>(null);
	const [moreOpen, setMoreOpen] = useState(false);
	const scope = useTimeScope();
	const more = usePlayerMenu(book, scope, setTimeScope);
	const openList = (tab: ListTab) => {
		haptics.select();
		setList(tab);
	};
	// iOS presents a page sheet that already starts below the status bar.
	const top = IS_ANDROID ? insets.top : space.sm;

	return (
		<>
			<StatusBar style="light" />
			<DragToDismiss>
				<Scene book={book} />
				<View
					style={{
						flex: 1,
						paddingTop: top,
						paddingBottom: insets.bottom + space.lg,
						paddingHorizontal: space.xl,
						// Apple Music's rhythm: the art takes what's left, and the
						// transport gets extra air so each block reads on its own.
						gap: space.xl,
					}}
				>
					<Header book={book} more={more} onMore={() => setMoreOpen(true)} />
					<Stage book={book} />
					<TitleBlock book={book} onChapters={() => openList("chapters")} />
					<ErrorLine />
					<Progress book={book} scope={scope} />
					<View style={{ paddingVertical: space.sm }}>
						<Transport book={book} />
					</View>
					<UpNext />
					<BottomRow book={book} onList={openList} onSheet={setSheet} />
				</View>
			</DragToDismiss>
			{/* Outside the drag's GestureDetector: under it, the sheet's own
			    presses never fired. */}
			<PlayerSheets book={book} sheet={sheet} onClose={() => setSheet(null)} />
			{moreOpen ? (
				<ActionSheet sections={more} onClose={() => setMoreOpen(false)} />
			) : null}
			<PlayerListSheet book={book} tab={list} onClose={() => setList(null)} />
		</>
	);
}

/**
 * Android's player follows the finger down and closes past a third of the
 * way (or on a fling), like YouTube Music, with the app visible beneath it
 * (the route is a transparent modal). iOS gets the same from its native page
 * sheet.
 */
function DragToDismiss({ children }: { children: ReactNode }) {
	const { height } = useWindowDimensions();
	const offset = useSharedValue(0);
	const style = useAnimatedStyle(() => ({
		transform: [{ translateY: offset.get() }],
		borderRadius: offset.get() > 0 ? 20 : 0,
	}));
	const pan = Gesture.Pan()
		.enabled(IS_ANDROID)
		.activeOffsetY(12)
		.failOffsetY(-12)
		.failOffsetX([-16, 16])
		.onUpdate((event) => {
			offset.set(Math.max(0, event.translationY));
		})
		.onEnd((event) => {
			const velocity = event.velocityY;
			if (event.translationY > height / 3 || velocity > 1200) {
				// Pop only once it's off screen: popping mid-slide snapped the
				// sheet back to the top for the native exit animation (a flash).
				// The spring keeps the flick's speed; clamped, it never rebounds.
				offset.set(
					withSpring(
						height,
						{ ...SNAP_SPRING, velocity, overshootClamping: true },
						(finished) => {
							// Explicit: React Compiler hoists this capture-free callback out
							// of the gesture, where Reanimated no longer workletizes it.
							"worklet";
							if (finished) scheduleOnRN(router.back);
						},
					),
				);
			} else {
				offset.set(withSpring(0, { ...SNAP_SPRING, velocity }));
			}
		});
	return (
		<GestureDetector gesture={pan}>
			<Animated.View
				style={[
					{ flex: 1, backgroundColor: ink.floor, overflow: "hidden" },
					style,
				]}
			>
				{children}
			</Animated.View>
		</GestureDetector>
	);
}

// Expo Image's bitmap blur is weak on Android 12+; blur the view instead.
const NATIVE_BLUR = IS_ANDROID && Number(Platform.Version) >= 31;
// The smallest rung: only its colours survive the blur.
const BACKDROP_WIDTH = 128;

/**
 * Apple Music's backdrop: the cover itself, blurred to colour and dimmed so
 * white text holds over any artwork. The cover's colour glow stands in when
 * there's no art.
 */
function Scene({ book }: { book: PlayerBook }) {
	const { serverUrl } = useConnection();
	const uri =
		localCoverUri(book.uuid) ?? coverUrl(serverUrl, book.cover, BACKDROP_WIDTH);
	if (!uri) return <GlowScene book={book} />;
	return (
		<View
			pointerEvents="none"
			style={{ position: "absolute", inset: 0, overflow: "hidden" }}
		>
			{/* Far past the screen: a blur fades to transparent at the view's
			    edges, which showed as dark borders down the sides. */}
			<View
				style={{
					position: "absolute",
					inset: -240,
					filter: NATIVE_BLUR
						? [{ blur: 110 }, { saturate: 1.8 }, { brightness: 0.65 }]
						: [{ saturate: 1.8 }, { brightness: 0.65 }],
				}}
			>
				<Image
					source={{ uri }}
					cachePolicy="memory-disk"
					// Detail gone before the upscale, so only colour fields remain.
					blurRadius={NATIVE_BLUR ? 12 : 60}
					contentFit="cover"
					style={{ position: "absolute", inset: 0 }}
				/>
			</View>
			{/* Darker toward the text and controls: a white cover still lands
			    at 4.5:1 under the secondary lines. */}
			<View
				style={{
					position: "absolute",
					inset: 0,
					experimental_backgroundImage:
						"linear-gradient(to bottom, rgba(0,0,0,0.4) 0%, rgba(0,0,0,0.45) 45%, rgba(0,0,0,0.58) 100%)",
				}}
			/>
		</View>
	);
}

/** A dark base tinted by the cover and two soft glows in its hues. */
function GlowScene({ book }: { book: PlayerBook }) {
	const { base, glow, accent, strength } = ambientScene(book.color);
	const rgba = ([r, g, b]: [number, number, number], alpha: number) =>
		`rgba(${r}, ${g}, ${b}, ${alpha})`;
	return (
		<View
			pointerEvents="none"
			style={{
				position: "absolute",
				inset: 0,
				backgroundColor: base,
				experimental_backgroundImage: [
					`radial-gradient(circle at 100% 0%, ${rgba(glow, 0.42 * strength)} 0%, ${rgba(glow, 0.2 * strength)} 35%, ${rgba(glow, 0)} 80%)`,
					`radial-gradient(circle at 20% 100%, ${rgba(accent, 0.3 * strength)} 0%, ${rgba(accent, 0)} 70%)`,
				].join(", "),
			}}
		/>
	);
}

function usePlayerMenu(
	book: PlayerBook,
	scope: TimeScope,
	onScope: (scope: TimeScope) => void,
): MenuItem[][] {
	const player = usePlayer();
	const leaveTo = (href: Href) => {
		router.back();
		router.push(href);
	};
	return [
		[
			{
				id: "details",
				label: t("audiobook.player_view_details"),
				icon: icons.info,
				onPress: () => leaveTo(routes.title("audiobook", book.uuid)),
			},
			...(book.seriesUuid
				? [
						{
							id: "series",
							label: t("audiobook.player_go_to_series"),
							icon: icons.series,
							onPress: () =>
								book.seriesUuid &&
								leaveTo(routes.series(book.seriesUuid, "audiobook")),
						},
					]
				: []),
			{
				id: "add-to-list",
				label: t("add_to_list.title"),
				icon: icons.collection,
				onPress: () => {
					// iOS opens it as a page in the tabs, under this sheet.
					if (!IS_ANDROID) router.back();
					openAddToList({ uuid: book.uuid, kind: "audiobook" });
				},
			},
		],
		...(book.chapters.length > 0
			? [
					[
						{
							id: "scope",
							label: t(
								scope === "chapter"
									? "mobile.player.show_book_time"
									: "mobile.player.show_chapter_time",
							),
							icon: icons.clock,
							onPress: () => onScope(scope === "chapter" ? "book" : "chapter"),
						},
					],
				]
			: []),
		[
			{
				id: "stop",
				label: t("audiobook.player_stop"),
				icon: icons.stop,
				destructive: true,
				onPress: () => void player.stop(),
			},
		],
	];
}

/**
 * Android opens ⋮ as the Material sheet the app's other ⋮ menus use, mounted
 * outside the drag's GestureDetector (a dropdown under it never fired);
 * iOS keeps the UIMenu on the button.
 */
function Header({
	book,
	more,
	onMore,
}: {
	book: PlayerBook;
	more: MenuItem[][];
	onMore: () => void;
}) {
	// The web's "open reader": read along with this audiobook.
	const pairing = useReadyPairing(book.uuid);
	return (
		<View
			style={{
				flexDirection: "row",
				alignItems: "center",
				justifyContent: "space-between",
				marginHorizontal: -space.md,
				minHeight: 48,
			}}
		>
			<TransportButton
				icon={icons.collapse}
				label={t("audiobook.player_collapse")}
				color={ink.text}
				size={26}
				silent
				onPress={() => router.back()}
			/>
			<View style={{ flexDirection: "row", alignItems: "center" }}>
				{pairing ? (
					<TransportButton
						icon={icons.readListen}
						label={t("read_listen.open_reader")}
						color={ink.text}
						size={22}
						onPress={() =>
							openReadListenFromPlayer(pairing.ebook.uuid, pairing.id)
						}
					/>
				) : null}
				{IS_ANDROID ? (
					<TransportButton
						icon={icons.more}
						label={t("audiobook.player_more")}
						color={ink.text}
						size={22}
						silent
						onPress={onMore}
					/>
				) : (
					<ActionMenuButton
						sections={more}
						icon={icons.more}
						label={t("audiobook.player_more")}
						color={ink.text}
						size={22}
					/>
				)}
			</View>
		</View>
	);
}

// The stage measures the same on every open of one window size; remembering
// it paints the artwork in the player's first frame instead of after layout.
const stageSizes = new Map<string, number>();

/** The artwork, as large as the space left allows. */
function Stage({ book }: { book: PlayerBook }) {
	const screen = useWindowDimensions();
	const windowKey = `${screen.width}x${screen.height}`;
	const [size, setSize] = useState(() => stageSizes.get(windowKey) ?? 0);
	const onLayout = (event: LayoutChangeEvent) => {
		const { width, height } = event.nativeEvent.layout;
		const measured = Math.floor(Math.min(width, height));
		stageSizes.set(windowKey, measured);
		setSize(measured);
	};
	return (
		<View
			onLayout={onLayout}
			style={{
				flex: 1,
				minHeight: 120,
				alignItems: "center",
				justifyContent: "center",
			}}
		>
			{size > 0 ? <Artwork book={book} size={size} /> : null}
		</View>
	);
}

function Artwork({ book, size }: { book: PlayerBook; size: number }) {
	return (
		<View style={{ boxShadow: shadows.art, borderRadius: 12 }}>
			<Cover
				cover={book.cover}
				color={book.color}
				width={size}
				shape="audio"
				rounded={12}
			/>
		</View>
	);
}

function TitleBlock({
	book,
	onChapters,
}: {
	book: PlayerBook;
	onChapters: () => void;
}) {
	const chapterIndex = usePlayerState((s) =>
		activeChapterIndex(book.chapters, s.time),
	);
	const chapter = book.chapters[chapterIndex];
	const label = chapter ? chapterName(chapter, chapterIndex) : null;
	// Audiobooks often ship narrators and no author; the line reads the same.
	const byline = book.authors.join(", ") || book.narrators.join(", ");
	return (
		<View
			style={{ flexDirection: "row", alignItems: "flex-start", gap: space.md }}
		>
			<View style={{ flex: 1, gap: 2 }}>
				<Text
					variant="pageTitle"
					numberOfLines={2}
					style={{ color: ink.text, letterSpacing: -0.4 }}
				>
					{book.title}
				</Text>
				{byline ? (
					<Text
						variant="lead"
						numberOfLines={1}
						style={{ color: ink.soft, marginTop: space.xs }}
					>
						{byline}
					</Text>
				) : null}
				{label ? (
					<Pressable
						onPress={onChapters}
						accessibilityRole="button"
						accessibilityLabel={`${t("audiobook.player_chapters")}: ${label}`}
						hitSlop={{ top: 6, bottom: 6 }}
						style={({ pressed }) => ({
							flexDirection: "row",
							alignItems: "center",
							gap: 4,
							alignSelf: "flex-start",
							maxWidth: "100%",
							opacity: pressed ? 0.6 : 1,
						})}
					>
						<Text
							variant="subhead"
							numberOfLines={1}
							style={{ color: ink.muted, flexShrink: 1 }}
						>
							{label}
						</Text>
						<Icon name={icons.chevronRight} size={13} color={ink.muted} />
					</Pressable>
				) : null}
			</View>
		</View>
	);
}

function ErrorLine() {
	const error = usePlayerState((s) => s.error);
	if (!error) return null;
	return (
		<View
			accessibilityRole="alert"
			style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
		>
			<Icon name={icons.warning} size={16} color={ink.danger} />
			<Text variant="subhead" style={{ color: ink.danger, flex: 1 }}>
				{t("audiobook.playback_error")}
			</Text>
		</View>
	);
}

function Progress({ book, scope }: { book: PlayerBook; scope: TimeScope }) {
	const player = usePlayer();
	const time = usePlayerState((s) => Math.floor(s.time));
	const rate = usePlayerState((s) => s.rate);
	const bookmarks = useBookmarks(book.uuid);
	const chapterIndex = activeChapterIndex(book.chapters, time);
	const chapter = book.chapters[chapterIndex];
	const chapterScope = scope === "chapter" && chapter;
	const start = chapterScope ? chapter.startTime : 0;
	const end = chapterScope ? chapter.endTime : book.duration;
	const duration = Math.max(1, book.duration);
	const describe = (at: number): ScrubLabel => {
		const preview = seekPreview(at, end - start, book.chapters, bookmarks.list);
		const index = preview.chapterIndex;
		// Like the web: a bookmark's note wins, else the chapter.
		const bookmark = preview.bookmark?.label
			? `${preview.bookmark.number} · ${preview.bookmark.label}`
			: null;
		return {
			bookmark,
			chapter:
				!bookmark && index >= 0
					? chapterLabel(book.chapters[index], index)
					: null,
			bookmarkId: preview.bookmark?.id ?? null,
		};
	};
	return (
		<SeekBar
			start={start}
			end={end}
			time={time}
			rate={rate}
			onSeek={(value) => void player.seek(value)}
			markers={
				chapterScope
					? undefined
					: book.chapters
							.slice(1)
							.map((item) => item.startTime / duration)
							.filter((at) => at > 0 && at < 1)
			}
			ticks={positionsInSpan(
				bookmarks.list.map((bookmark) => bookmark.time),
				start,
				end,
			)}
			gap={ink.floor}
			color={ink.text}
			track={ink.track}
			muted={ink.muted}
			describe={describe}
		/>
	);
}

function Transport({ book }: { book: PlayerBook }) {
	const player = usePlayer();
	const playLabel = usePlayLabel();
	const hasChapters = book.chapters.length > 0;
	const hasNext = usePlayerState(
		(s) => activeChapterIndex(book.chapters, s.time) < book.chapters.length - 1,
	);
	return (
		<View
			style={{
				flexDirection: "row",
				alignItems: "center",
				justifyContent: hasChapters ? "space-between" : "space-evenly",
			}}
		>
			{hasChapters ? (
				<TransportButton
					icon={icons.prevChapter}
					label={t("audiobook.player_prev_chapter")}
					color={ink.text}
					size={26}
					box={52}
					onPress={player.prevChapter}
				/>
			) : null}
			<JumpButton direction="back" color={ink.text} size={34} box={60} />
			<View style={{ alignItems: "center", justifyContent: "center" }}>
				<BufferingRing size={PLAY + 8} color={ink.text} />
				<PressableScale
					accessibilityRole="button"
					accessibilityLabel={playLabel}
					onPress={() => {
						haptics.tap();
						player.toggle();
					}}
					style={{
						width: PLAY,
						height: PLAY,
						borderRadius: PLAY / 2,
						backgroundColor: ink.text,
						alignItems: "center",
						justifyContent: "center",
					}}
				>
					<PlayPauseGlyph size={34} color={ink.onText} />
				</PressableScale>
			</View>
			<JumpButton direction="forward" color={ink.text} size={34} box={60} />
			{hasChapters ? (
				<TransportButton
					icon={icons.nextChapter}
					label={t("audiobook.player_next_chapter")}
					color={ink.text}
					size={26}
					box={52}
					disabled={!hasNext}
					onPress={player.nextChapter}
				/>
			) : null}
		</View>
	);
}

/** Up Next near the end of a series book, or the finished-book card. */
function UpNext() {
	const player = usePlayer();
	const upNext = usePlayerState((s) => s.upNext);
	const endCard = usePlayerState((s) => s.endCard);
	if (endCard) {
		return (
			<Animated.View
				entering={FadeIn.duration(motion.fast).easing(EASE_OUT)}
				accessibilityRole="summary"
				style={{
					flexDirection: "row",
					alignItems: "center",
					gap: space.sm,
					padding: space.md,
					paddingRight: space.xs,
					borderRadius: radius.card,
					backgroundColor: ink.chip,
				}}
			>
				<Icon
					name={{ ios: "checkmark.circle.fill", android: "check_circle" }}
					size={22}
					color={ink.text}
				/>
				<View style={{ flex: 1 }}>
					<Text variant="label" style={{ color: ink.text }}>
						{t("audiobook.player_book_finished")}
					</Text>
					{upNext?.title ? (
						<Text
							variant="caption"
							numberOfLines={1}
							style={{ color: ink.soft }}
						>
							{t("audiobook.player_up_next")}: {upNext.title}
						</Text>
					) : null}
				</View>
				{upNext ? (
					<SmallButton
						filled
						label={t("audiobook.player_play_next")}
						onPress={() => void player.playNextInSeries()}
					/>
				) : null}
				<SmallButton
					label={t("audiobook.player_replay_book")}
					onPress={player.replay}
				/>
				<TransportButton
					icon={icons.dismiss}
					label={t("common.close")}
					color={ink.soft}
					size={16}
					box={36}
					silent
					onPress={player.dismissEndCard}
				/>
			</Animated.View>
		);
	}
	if (!upNext) return null;
	return (
		<Animated.View
			entering={FadeIn.duration(motion.fast).easing(EASE_OUT)}
			style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}
		>
			<Text
				variant="caption"
				numberOfLines={1}
				style={{ flex: 1, color: ink.muted }}
			>
				{t("audiobook.player_up_next")}: {upNext.title ?? upNext.uuid}
			</Text>
			<SmallButton
				label={t("audiobook.player_play_next")}
				onPress={() => void player.playNextInSeries()}
			/>
		</Animated.View>
	);
}

function SmallButton({
	label,
	filled,
	onPress,
}: {
	label: string;
	filled?: boolean;
	onPress: () => void;
}) {
	return (
		<Pressable
			onPress={() => {
				haptics.tap();
				onPress();
			}}
			accessibilityRole="button"
			hitSlop={6}
			style={({ pressed }) => ({
				height: 32,
				paddingHorizontal: space.md,
				borderRadius: radius.pill,
				alignItems: "center",
				justifyContent: "center",
				backgroundColor: filled ? ink.text : ink.chip,
				opacity: pressed ? 0.7 : 1,
			})}
		>
			<Text
				variant="caption"
				numberOfLines={1}
				style={{ color: filled ? ink.onText : ink.text, fontWeight: "600" }}
			>
				{label}
			</Text>
		</Pressable>
	);
}

/** A bottom-row action: glyph over a short label, like Audible's toolbar,
 * so each one says what it does. */
function Action({
	glyph,
	label,
	active,
	onPress,
	a11y,
}: {
	glyph: ReactNode;
	label: string;
	active?: boolean;
	onPress: () => void;
	a11y?: string;
}) {
	return (
		<Pressable
			onPress={onPress}
			accessibilityRole="button"
			accessibilityLabel={a11y ?? label}
			android_ripple={{ color: ink.press, borderless: true, radius: 40 }}
			style={({ pressed }) => ({
				flex: 1,
				minHeight: 56,
				alignItems: "center",
				justifyContent: "center",
				gap: 4,
				opacity: pressed && !IS_ANDROID ? 0.6 : 1,
			})}
		>
			<View
				style={{ height: 26, alignItems: "center", justifyContent: "center" }}
			>
				{glyph}
			</View>
			<Text
				variant="caption"
				numberOfLines={1}
				style={{
					color: active ? ink.text : ink.muted,
					fontSize: 11,
					fontVariant: ["tabular-nums"],
				}}
			>
				{label}
			</Text>
		</Pressable>
	);
}

function BottomRow({
	book,
	onList,
	onSheet,
}: {
	book: PlayerBook;
	onList: (tab: ListTab) => void;
	onSheet: (sheet: Sheet) => void;
}) {
	const rate = usePlayerState((s) => s.rate);
	const sleep = usePlayerState((s) =>
		s.sleep ? Math.ceil(s.sleep.remaining) : null,
	);
	const hasChapters = book.chapters.length > 0;
	return (
		<View
			style={{
				flexDirection: "row",
				alignItems: "center",
				marginHorizontal: -space.md,
			}}
		>
			<Action
				glyph={
					<Text
						variant="label"
						style={{
							color: ink.text,
							fontSize: 17,
							fontWeight: "600",
							fontVariant: ["tabular-nums"],
						}}
					>
						{formatSpeed(rate)}
					</Text>
				}
				label={t("audiobook.player_speed")}
				active={rate !== 1}
				onPress={() => onSheet("speed")}
			/>
			<Action
				glyph={<SleepGlyph active={sleep !== null} />}
				label={sleep !== null ? clock(sleep) : t("audiobook.player_sleep")}
				active={sleep !== null}
				onPress={() => onSheet("sleep")}
				a11y={
					sleep !== null
						? t("audiobook.player_sleep_active", { time: clock(sleep) })
						: t("audiobook.player_sleep")
				}
			/>
			<BookmarkAction uuid={book.uuid} onPress={() => onList("bookmarks")} />
			{hasChapters ? (
				<Action
					glyph={<Icon name={icons.chapters} size={22} color={ink.text} />}
					label={t("audiobook.player_chapters")}
					onPress={() => onList("chapters")}
				/>
			) : null}
		</View>
	);
}

/**
 * Opens the bookmarks, the web's pill: the list starts with "add a bookmark
 * here", so saving and finding them live behind the same button.
 */
function BookmarkAction({
	uuid,
	onPress,
}: {
	uuid: string;
	onPress: () => void;
}) {
	const count = useBookmarks(uuid).list.length;
	const label = t("audiobook.player_bookmarks");
	return (
		<Action
			glyph={<Icon name={icons.bookmark} size={22} color={ink.text} />}
			label={label}
			onPress={onPress}
			a11y={count > 0 ? `${label}, ${count}` : label}
		/>
	);
}
