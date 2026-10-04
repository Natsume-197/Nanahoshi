import { BottomSheet, Host } from "@expo/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type Href, router } from "expo-router";
import { type ReactNode, useState } from "react";
import { Pressable, ScrollView, useWindowDimensions, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
	useAnimatedStyle,
	useSharedValue,
	withSpring,
	withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { scheduleOnRN } from "react-native-worklets";
import { ActionMenuButton, type MenuItem } from "@/components/action-menu";
import { Cover } from "@/components/cover";
import { Icon, icons } from "@/components/icon";
import { PressableScale } from "@/components/pressable-scale";
import { Text } from "@/components/text";
import { useMountEffect } from "@/hooks/use-mount-effect";
import { mutedAccentSurface } from "@/lib/color";
import { t } from "@/lib/i18n";
import { IS_ANDROID } from "@/lib/platform";
import { routes } from "@/lib/routes";
import { useApi } from "@/providers/app-provider";
import {
	openReadListenFromPlayer,
	useReadyPairing,
} from "@/reader/read-listen-entry";
import { motion, palettes, radius, shadows, space } from "@/theme";
import { PlayPauseGlyph, TransportButton, usePlayLabel } from "./controls";
import type { PlayerBook } from "./engine";
import { usePlayer, usePlayerState } from "./provider";
import { SeekBar } from "./seek-bar";
import {
	activeChapterIndex,
	clock,
	formatSpeed,
	SLEEP_MINUTES,
	type SleepMode,
	SPEED_PRESETS,
} from "./timing";

/** The player is always dark, like the web's (`.dark` on the sheet). */
const ink = {
	text: "#f4f3f5",
	soft: "rgba(244,243,245,0.72)",
	muted: "rgba(244,243,245,0.55)",
	track: "rgba(244,243,245,0.22)",
	chip: "rgba(244,243,245,0.12)",
	sheet: palettes.dark.card,
};

type Sheet = "speed" | "sleep" | "chapters" | null;

/**
 * The web's ExpandedPlayer on a phone: the cover's colors blurred into the
 * background, collapse + more at the top, the artwork, title, author and the
 * chapter (a button into the chapter list), the like heart, the seek bar,
 * the transport row, and speed / sleep / chapters along the bottom.
 */
export function ExpandedPlayer() {
	const book = usePlayerState((s) => s.book);
	if (!book) {
		// Closed from elsewhere (stop): nothing to show, go back down.
		return <Dismiss />;
	}
	return <Player book={book} />;
}

function Dismiss() {
	useMountEffect(() => {
		if (router.canGoBack()) router.back();
	});
	return (
		<View style={{ flex: 1, backgroundColor: palettes.dark.background }} />
	);
}

function Player({ book }: { book: PlayerBook }) {
	const insets = useSafeAreaInsets();
	const { width, height } = useWindowDimensions();
	const [sheet, setSheet] = useState<Sheet>(null);
	// The artwork takes what's left after the controls, never wider than the gutter.
	// iOS presents a page sheet that already starts below the status bar.
	const top = IS_ANDROID ? insets.top + space.xs : space.md;
	const sheetOffset = IS_ANDROID ? 0 : insets.top + 10;
	const coverSize = Math.min(
		width - space.xl * 2,
		height - sheetOffset - top - insets.bottom - 430,
	);

	return (
		<DragToDismiss>
			<Ambient color={book.color} />
			<View
				style={{
					flex: 1,
					paddingTop: top,
					paddingBottom: insets.bottom + space.md,
					paddingHorizontal: space.xl,
					gap: space.lg,
				}}
			>
				<Header book={book} />
				<View
					style={{ flex: 1, alignItems: "center", justifyContent: "center" }}
				>
					<View
						style={{
							boxShadow: shadows.art,
							borderRadius: 12,
						}}
					>
						<Cover
							cover={book.cover}
							color={book.color}
							width={Math.max(160, coverSize)}
							shape="audio"
							rounded={12}
						/>
					</View>
				</View>
				<TitleBlock book={book} onChapters={() => setSheet("chapters")} />
				<Progress book={book} />
				<Transport book={book} />
				<BottomRow book={book} onOpen={setSheet} />
			</View>
			<Sheets book={book} sheet={sheet} onClose={() => setSheet(null)} />
		</DragToDismiss>
	);
}

/**
 * Android's player follows the finger down and closes past a third of the
 * way (or on a fling), like YouTube Music, with the app visible beneath it
 * (the route is a transparent modal). iOS gets the same from its native page
 * sheet, so this is a plain container there.
 */
function DragToDismiss({ children }: { children: ReactNode }) {
	const { height } = useWindowDimensions();
	// Worklets copy what they capture; take the number, not the whole
	// `motion` object (its easing curve can't cross to the UI thread).
	const duration = motion.base;
	const offset = useSharedValue(0);
	const style = useAnimatedStyle(() => ({
		transform: [{ translateY: offset.get() }],
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
			if (event.translationY > height / 3 || event.velocityY > 1200) {
				// Pop only once it's off screen: popping mid-slide snapped the
				// sheet back to the top for the native exit animation (a flash).
				offset.set(
					withTiming(height, { duration }, (finished) => {
						if (finished) scheduleOnRN(router.back);
					}),
				);
			} else {
				offset.set(withSpring(0, { damping: 24, stiffness: 260 }));
			}
		});
	return (
		<GestureDetector gesture={pan}>
			<Animated.View
				style={[{ flex: 1, backgroundColor: palettes.dark.background }, style]}
			>
				{children}
			</Animated.View>
		</GestureDetector>
	);
}

/** The cover's own colour washing down into the dark, like Apple Music and
 * Spotify's now-playing screens: the web's muted accent surface at the top,
 * fading to the player's near-black by two thirds of the way down. */
function Ambient({ color }: { color: string | null }) {
	const tone = mutedAccentSurface(color) ?? "#2b2930";
	return (
		<View
			pointerEvents="none"
			style={{
				position: "absolute",
				inset: 0,
				experimental_backgroundImage: `linear-gradient(to bottom, ${tone} 0%, ${tone} 12%, #141416 72%, #101012 100%)`,
			}}
		/>
	);
}

function Header({ book }: { book: PlayerBook }) {
	const player = usePlayer();
	const leaveTo = (href: Href) => {
		router.back();
		router.push(href);
	};
	const more: MenuItem[][] = [
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
		],
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
	return (
		<View
			style={{
				flexDirection: "row",
				alignItems: "center",
				justifyContent: "space-between",
				marginHorizontal: -space.md,
			}}
		>
			<TransportButton
				icon={icons.collapse}
				label={t("audiobook.player_collapse")}
				color={ink.text}
				size={26}
				onPress={() => router.back()}
			/>
			<Text
				variant="metaLabel"
				style={{
					color: ink.muted,
					textTransform: "uppercase",
					letterSpacing: 1,
				}}
			>
				{t("audiobook.player_now_playing")}
			</Text>
			<ActionMenuButton
				sections={more}
				icon={icons.more}
				label={t("audiobook.player_more")}
				color={ink.text}
				size={22}
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
	const label = chapter
		? (chapter.title ??
			t("audiobook.chapter_fallback", { number: chapterIndex + 1 }))
		: null;
	return (
		<View
			style={{ flexDirection: "row", alignItems: "flex-start", gap: space.md }}
		>
			<View style={{ flex: 1, gap: space.xs }}>
				<Text variant="pageTitle" numberOfLines={2} style={{ color: ink.text }}>
					{book.title}
				</Text>
				{book.authors.length > 0 ? (
					<Text variant="lead" numberOfLines={1} style={{ color: ink.soft }}>
						{book.authors.join(", ")}
					</Text>
				) : null}
				{label ? (
					<Pressable
						onPress={onChapters}
						accessibilityRole="button"
						accessibilityLabel={`${t("audiobook.player_chapters")}: ${label}`}
						style={({ pressed }) => ({
							flexDirection: "row",
							alignItems: "center",
							gap: 4,
							opacity: pressed ? 0.6 : 1,
						})}
					>
						<Text
							variant="subhead"
							numberOfLines={1}
							style={{ color: ink.soft, flexShrink: 1 }}
						>
							{label}
						</Text>
						<Icon name={icons.chevronRight} size={14} color={ink.soft} />
					</Pressable>
				) : null}
			</View>
			<Like uuid={book.uuid} />
		</View>
	);
}

function Like({ uuid }: { uuid: string }) {
	const { orpc } = useApi();
	const queryClient = useQueryClient();
	const options = orpc.likedBooks.getLikeStatus.queryOptions({
		input: { bookUuid: uuid },
	});
	const status = useQuery(options);
	const liked = status.data?.liked ?? false;
	const toggle = useMutation({
		...orpc.likedBooks.toggleLike.mutationOptions(),
		onMutate: () => {
			const previous = queryClient.getQueryData(options.queryKey);
			queryClient.setQueryData(options.queryKey, { liked: !liked });
			return { previous };
		},
		onError: (_error, _input, context) =>
			queryClient.setQueryData(options.queryKey, context?.previous),
		onSettled: () =>
			queryClient.invalidateQueries({ queryKey: orpc.likedBooks.key() }),
	});
	return (
		<TransportButton
			icon={liked ? icons.heartFill : icons.heart}
			label={liked ? t("aria.remove_from_likes") : t("aria.add_to_likes")}
			color={ink.text}
			size={24}
			disabled={status.isPending}
			onPress={() => toggle.mutate({ bookUuid: uuid })}
		/>
	);
}

function Progress({ book }: { book: PlayerBook }) {
	const player = usePlayer();
	const time = usePlayerState((s) => Math.floor(s.time));
	const hasChapters = book.chapters.length > 0;
	const [scope, setScope] = useState<"chapter" | "book">(
		hasChapters ? "chapter" : "book",
	);
	const chapter = book.chapters[activeChapterIndex(book.chapters, time)];
	const chapterScope = scope === "chapter" && chapter;
	return (
		<SeekBar
			start={chapterScope ? chapter.startTime : 0}
			end={chapterScope ? chapter.endTime : book.duration}
			time={time}
			onSeek={(value) => void player.seek(value)}
			scopeLabel={
				hasChapters
					? t(
							chapterScope
								? "audiobook.player_progress_chapter"
								: "audiobook.player_progress_book",
						)
					: undefined
			}
			onToggleScope={
				hasChapters
					? () => setScope(scope === "chapter" ? "book" : "chapter")
					: undefined
			}
			color={ink.text}
			track={ink.track}
			muted={ink.muted}
		/>
	);
}

function Transport({ book }: { book: PlayerBook }) {
	const player = usePlayer();
	const playLabel = usePlayLabel();
	const hasChapters = book.chapters.length > 1;
	return (
		<View
			style={{
				flexDirection: "row",
				alignItems: "center",
				justifyContent: "space-between",
			}}
		>
			<TransportButton
				icon={icons.prevChapter}
				label={t("audiobook.player_prev_chapter")}
				color={ink.text}
				size={26}
				disabled={!hasChapters}
				onPress={player.prevChapter}
			/>
			<TransportButton
				icon={icons.jumpBack}
				label={t("audiobook.player_back_seconds", { seconds: 10 })}
				color={ink.text}
				size={32}
				box={56}
				onPress={player.back}
			/>
			<PressableScale
				accessibilityRole="button"
				accessibilityLabel={playLabel}
				onPress={player.toggle}
				style={{
					width: 76,
					height: 76,
					borderRadius: 38,
					backgroundColor: ink.text,
					alignItems: "center",
					justifyContent: "center",
				}}
			>
				<PlayPauseGlyph size={34} color="#141416" />
			</PressableScale>
			<TransportButton
				icon={icons.jumpForward}
				label={t("audiobook.player_forward_seconds", { seconds: 30 })}
				color={ink.text}
				size={32}
				box={56}
				onPress={player.forward}
			/>
			<TransportButton
				icon={icons.nextChapter}
				label={t("audiobook.player_next_chapter")}
				color={ink.text}
				size={26}
				disabled={!hasChapters}
				onPress={player.nextChapter}
			/>
		</View>
	);
}

function Pill({
	label,
	icon,
	active,
	onPress,
	a11y,
}: {
	label?: string;
	icon?: ReactNode;
	active?: boolean;
	onPress: () => void;
	a11y: string;
}) {
	return (
		<Pressable
			onPress={onPress}
			accessibilityRole="button"
			accessibilityLabel={a11y}
			style={({ pressed }) => ({
				minHeight: 40,
				minWidth: 44,
				paddingHorizontal: space.md,
				borderRadius: radius.pill,
				flexDirection: "row",
				alignItems: "center",
				justifyContent: "center",
				gap: 6,
				backgroundColor: active ? ink.chip : "transparent",
				opacity: pressed ? 0.6 : 1,
			})}
		>
			{icon}
			{label ? (
				<Text
					variant="label"
					style={{ color: ink.text, fontVariant: ["tabular-nums"] }}
				>
					{label}
				</Text>
			) : null}
		</Pressable>
	);
}

function BottomRow({
	book,
	onOpen,
}: {
	book: PlayerBook;
	onOpen: (sheet: Sheet) => void;
}) {
	const rate = usePlayerState((s) => s.rate);
	const sleep = usePlayerState((s) =>
		s.sleep ? Math.ceil(s.sleep.remaining) : null,
	);
	// The web's "open reader" in the player: read along with this audiobook.
	const pairing = useReadyPairing(book.uuid);
	return (
		<View
			style={{
				flexDirection: "row",
				alignItems: "center",
				justifyContent: "space-between",
				marginHorizontal: -space.sm,
			}}
		>
			<View style={{ flexDirection: "row", gap: space.xs }}>
				<Pill
					label={formatSpeed(rate)}
					active={rate !== 1}
					onPress={() => onOpen("speed")}
					a11y={t("audiobook.player_speed")}
				/>
				<Pill
					icon={<Icon name={icons.sleep} size={20} color={ink.text} />}
					label={sleep !== null ? clock(sleep) : undefined}
					active={sleep !== null}
					onPress={() => onOpen("sleep")}
					a11y={t("audiobook.player_sleep")}
				/>
				{pairing ? (
					<Pill
						icon={<Icon name={icons.readListen} size={20} color={ink.text} />}
						onPress={() =>
							openReadListenFromPlayer(pairing.ebook.uuid, pairing.id)
						}
						a11y={t("read_listen.open_reader")}
					/>
				) : null}
			</View>
			{book.chapters.length > 0 ? (
				<Pill
					icon={<Icon name={icons.chapters} size={20} color={ink.text} />}
					onPress={() => onOpen("chapters")}
					a11y={t("audiobook.player_chapters")}
				/>
			) : null}
		</View>
	);
}

// ── sheets ────────────────────────────────────────────────────────────────

function Sheets({
	book,
	sheet,
	onClose,
}: {
	book: PlayerBook;
	sheet: Sheet;
	onClose: () => void;
}) {
	const insets = useSafeAreaInsets();
	return (
		<Host style={{ position: "absolute" }}>
			<BottomSheet
				isPresented={sheet !== null}
				onDismiss={onClose}
				snapPoints={sheet === "chapters" ? ["half", "full"] : undefined}
				containerColor={ink.sheet}
			>
				<View
					style={{
						paddingHorizontal: space.lg,
						paddingBottom: insets.bottom + space.lg,
					}}
				>
					{sheet === "speed" ? <SpeedSheet /> : null}
					{sheet === "sleep" ? (
						<SleepSheet book={book} onDone={onClose} />
					) : null}
					{sheet === "chapters" ? (
						<ChapterSheet book={book} onDone={onClose} />
					) : null}
				</View>
			</BottomSheet>
		</Host>
	);
}

function SheetTitle({ children }: { children: string }) {
	return (
		<Text
			variant="section"
			style={{ color: ink.text, paddingVertical: space.md }}
		>
			{children}
		</Text>
	);
}

function OptionRow({
	label,
	selected,
	onPress,
	trailing,
}: {
	label: string;
	selected?: boolean;
	onPress: () => void;
	trailing?: string;
}) {
	return (
		<Pressable
			android_ripple={{ color: ink.chip }}
			onPress={onPress}
			accessibilityRole="button"
			accessibilityState={{ selected: !!selected }}
			style={({ pressed }) => ({
				minHeight: 48,
				flexDirection: "row",
				alignItems: "center",
				gap: space.md,
				paddingHorizontal: space.sm,
				marginHorizontal: -space.sm,
				borderRadius: radius.field,
				backgroundColor: pressed && !IS_ANDROID ? ink.chip : "transparent",
			})}
		>
			<Text
				variant="body"
				numberOfLines={2}
				style={{
					flex: 1,
					color: selected ? ink.text : ink.soft,
					fontWeight: selected ? "600" : "400",
				}}
			>
				{label}
			</Text>
			{trailing ? (
				<Text
					variant="caption"
					style={{ color: ink.muted, fontVariant: ["tabular-nums"] }}
				>
					{trailing}
				</Text>
			) : null}
			{selected ? <Icon name={icons.check} size={18} color={ink.text} /> : null}
		</Pressable>
	);
}

function SpeedSheet() {
	const player = usePlayer();
	const rate = usePlayerState((s) => s.rate);
	return (
		<View>
			<SheetTitle>{t("audiobook.player_speed_title")}</SheetTitle>
			<View
				style={{
					flexDirection: "row",
					alignItems: "center",
					justifyContent: "center",
					gap: space.xl,
					paddingVertical: space.md,
				}}
			>
				<TransportButton
					icon={{ ios: "minus", android: "remove" }}
					label={t("audiobook.player_speed_slower")}
					color={ink.text}
					onPress={() => player.setRate(Math.round((rate - 0.1) * 10) / 10)}
				/>
				<Text
					variant="display"
					style={{
						color: ink.text,
						minWidth: 110,
						textAlign: "center",
						fontVariant: ["tabular-nums"],
					}}
				>
					{formatSpeed(rate)}
				</Text>
				<TransportButton
					icon={{ ios: "plus", android: "add" }}
					label={t("audiobook.player_speed_faster")}
					color={ink.text}
					onPress={() => player.setRate(Math.round((rate + 0.1) * 10) / 10)}
				/>
			</View>
			<View
				style={{
					flexDirection: "row",
					flexWrap: "wrap",
					gap: space.sm,
					paddingTop: space.sm,
				}}
			>
				{SPEED_PRESETS.map((preset) => (
					<Pressable
						key={preset}
						onPress={() => player.setRate(preset)}
						accessibilityRole="button"
						accessibilityState={{ selected: rate === preset }}
						style={({ pressed }) => ({
							flexGrow: 1,
							minWidth: 72,
							height: 44,
							borderRadius: radius.field,
							alignItems: "center",
							justifyContent: "center",
							backgroundColor: rate === preset ? ink.text : ink.chip,
							opacity: pressed ? 0.7 : 1,
						})}
					>
						<Text
							variant="label"
							style={{ color: rate === preset ? "#141416" : ink.text }}
						>
							{formatSpeed(preset)}
						</Text>
					</Pressable>
				))}
			</View>
		</View>
	);
}

function SleepSheet({
	book,
	onDone,
}: {
	book: PlayerBook;
	onDone: () => void;
}) {
	const player = usePlayer();
	const mode = usePlayerState((s) => s.sleep?.mode ?? null);
	const choose = (next: SleepMode | null) => {
		player.setSleep(next);
		onDone();
	};
	const same = (candidate: SleepMode) =>
		!!mode &&
		mode.kind === candidate.kind &&
		(candidate.kind !== "duration" ||
			(mode.kind === "duration" && mode.minutes === candidate.minutes));
	return (
		<View>
			<SheetTitle>{t("audiobook.player_sleep")}</SheetTitle>
			{SLEEP_MINUTES.map((minutes) => (
				<OptionRow
					key={minutes}
					label={t("audiobook.player_sleep_minutes", { minutes })}
					selected={same({ kind: "duration", minutes })}
					onPress={() => choose({ kind: "duration", minutes })}
				/>
			))}
			{book.chapters.length > 0 ? (
				<OptionRow
					label={t("audiobook.player_sleep_end_of_chapter")}
					selected={same({ kind: "chapter" })}
					onPress={() => choose({ kind: "chapter" })}
				/>
			) : null}
			<OptionRow
				label={t("audiobook.player_sleep_end_of_book")}
				selected={same({ kind: "book-end" })}
				onPress={() => choose({ kind: "book-end" })}
			/>
			{mode ? (
				<OptionRow
					label={t("audiobook.player_sleep_cancel")}
					onPress={() => choose(null)}
				/>
			) : null}
		</View>
	);
}

function ChapterSheet({
	book,
	onDone,
}: {
	book: PlayerBook;
	onDone: () => void;
}) {
	const player = usePlayer();
	const { height } = useWindowDimensions();
	const current = usePlayerState((s) =>
		activeChapterIndex(book.chapters, s.time),
	);
	return (
		<View>
			<SheetTitle>{t("audiobook.player_chapters")}</SheetTitle>
			<ScrollView
				style={{ maxHeight: height * 0.75 }}
				contentContainerStyle={{ paddingBottom: space.lg }}
			>
				{book.chapters.map((chapter, index) => (
					<OptionRow
						key={chapter.index}
						label={
							chapter.title ??
							t("audiobook.chapter_fallback", { number: index + 1 })
						}
						selected={index === current}
						trailing={clock(chapter.endTime - chapter.startTime)}
						onPress={() => {
							void player.seek(chapter.startTime, true);
							onDone();
						}}
					/>
				))}
			</ScrollView>
		</View>
	);
}
