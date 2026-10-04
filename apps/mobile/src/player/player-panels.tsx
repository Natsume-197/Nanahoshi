import { useRef, useState } from "react";
import { FlatList, Pressable, TextInput, View } from "react-native";
import Animated, {
	cancelAnimation,
	useAnimatedStyle,
	useSharedValue,
	withDelay,
	withRepeat,
	withSequence,
	withTiming,
} from "react-native-reanimated";
import { Icon, icons } from "@/components/icon";
import { Text } from "@/components/text";
import { useMountEffect } from "@/hooks/use-mount-effect";
import { haptics } from "@/lib/haptics";
import { t } from "@/lib/i18n";
import { IS_ANDROID } from "@/lib/platform";
import { radius, space } from "@/theme";
import { type AudioBookmark, useBookmarks } from "./bookmarks";
import { bookmarkLines } from "./bookmarks-model";
import { chapterName, chapterNameAt } from "./chapter-name";
import type { PlayerBook } from "./engine";
import { useSheetInk } from "./ink";
import { usePlayer, usePlayerState } from "./provider";
import { useTimeScope } from "./time-scope";
import { activeChapterIndex, type Chapter, clock, clockIn } from "./timing";

export type Panel = "chapters" | "bookmarks";

const ROW = 52;

function PanelTitle({ title, count }: { title: string; count?: number }) {
	const tone = useSheetInk();
	return (
		<View
			style={{
				flexDirection: "row",
				alignItems: "baseline",
				gap: space.sm,
				paddingBottom: space.sm,
			}}
		>
			<Text variant="headline" style={{ color: tone.text, fontWeight: "600" }}>
				{title}
			</Text>
			{count !== undefined ? (
				<Text
					variant="subhead"
					style={{ color: tone.muted, fontVariant: ["tabular-nums"] }}
				>
					{count}
				</Text>
			) : null}
		</View>
	);
}

/**
 * The chapter list in the artwork's place (the web's phone layout), so the
 * transport stays in reach: played chapters recede, the playing one carries
 * an equalizer, and every row shows its length.
 */
export function ChaptersPanel({ book }: { book: PlayerBook }) {
	const player = usePlayer();
	const current = usePlayerState((s) =>
		activeChapterIndex(book.chapters, s.time),
	);
	const scrolled = useRef(false);
	return (
		<View style={{ flex: 1, width: "100%" }}>
			<PanelTitle
				title={t("audiobook.player_chapters")}
				count={book.chapters.length}
			/>
			<FlatList
				data={book.chapters}
				keyExtractor={(chapter) => String(chapter.index)}
				// Open on the chapter being played, not on chapter 1. An offset, not
				// initialScrollIndex: the native scroll clamps it when the list is
				// short, where an index past the end left a blank gap above.
				ref={(list) => {
					if (!list || scrolled.current) return;
					scrolled.current = true;
					requestAnimationFrame(() =>
						list.scrollToOffset({
							offset: Math.max(0, (current - 2) * ROW),
							animated: false,
						}),
					);
				}}
				getItemLayout={(_, index) => ({
					length: ROW,
					offset: ROW * index,
					index,
				})}
				showsVerticalScrollIndicator={false}
				renderItem={({ item, index }) => (
					<ChapterRow
						chapter={item}
						position={index}
						state={
							index === current
								? "active"
								: index < current
									? "played"
									: "ahead"
						}
						onPress={() => {
							haptics.select();
							void player.seek(item.startTime, true);
						}}
					/>
				)}
			/>
		</View>
	);
}

function ChapterRow({
	chapter,
	position,
	state,
	onPress,
}: {
	chapter: Chapter;
	position: number;
	state: "active" | "played" | "ahead";
	onPress: () => void;
}) {
	const tone = useSheetInk();
	const active = state === "active";
	return (
		<Pressable
			onPress={onPress}
			android_ripple={{ color: tone.press }}
			accessibilityRole="button"
			accessibilityState={{ selected: active }}
			style={({ pressed }) => ({
				height: ROW - 2,
				marginBottom: 2,
				flexDirection: "row",
				alignItems: "center",
				gap: space.md,
				paddingHorizontal: space.md,
				borderRadius: radius.field,
				overflow: "hidden",
				backgroundColor: active
					? tone.chip
					: pressed && !IS_ANDROID
						? tone.press
						: "transparent",
			})}
		>
			<View style={{ width: 20, alignItems: "center" }}>
				{active ? (
					<Equalizer />
				) : (
					<Text
						variant="caption"
						style={{ color: tone.faint, fontVariant: ["tabular-nums"] }}
					>
						{position + 1}
					</Text>
				)}
			</View>
			<Text
				variant="subhead"
				numberOfLines={1}
				style={{
					flex: 1,
					color: active
						? tone.text
						: state === "played"
							? tone.muted
							: tone.soft,
					fontWeight: active ? "500" : "400",
				}}
			>
				{chapterName(chapter, position)}
			</Text>
			<Text
				variant="caption"
				style={{ color: tone.muted, fontVariant: ["tabular-nums"] }}
			>
				{clock(chapter.endTime - chapter.startTime)}
			</Text>
		</Pressable>
	);
}

const BAR_DELAYS = [0, 300, 600];

/** Three bars that dance while the book plays and rest when it's paused. */
function Equalizer() {
	const playing = usePlayerState((s) => s.playing);
	return (
		<View
			accessibilityElementsHidden
			importantForAccessibility="no-hide-descendants"
			style={{
				flexDirection: "row",
				alignItems: "flex-end",
				gap: 2,
				height: 12,
			}}
		>
			{BAR_DELAYS.map((delay) => (
				// Keyed on playback: a pause remounts the bar at rest.
				<Bar key={`${delay}-${playing}`} delay={delay} playing={playing} />
			))}
		</View>
	);
}

function Bar({ delay, playing }: { delay: number; playing: boolean }) {
	const tone = useSheetInk();
	const level = useSharedValue(0.4);
	useMountEffect(() => {
		if (!playing) return;
		level.set(
			withDelay(
				delay,
				withRepeat(
					withSequence(
						withTiming(1, { duration: 420 }),
						withTiming(0.3, { duration: 420 }),
					),
					-1,
				),
			),
		);
		return () => cancelAnimation(level);
	});
	const style = useAnimatedStyle(() => ({
		transform: [{ scaleY: level.get() }],
	}));
	return (
		<Animated.View
			style={[
				{
					width: 3,
					height: 12,
					borderRadius: 1.5,
					backgroundColor: tone.text,
					transformOrigin: "bottom",
				},
				style,
			]}
		/>
	);
}

/**
 * Local-first bookmarks (the web's panel): saving is one tap, since the
 * moment is what matters mid-listen, and a note can be added afterwards.
 */
export function BookmarksPanel({ book }: { book: PlayerBook }) {
	const tone = useSheetInk();
	const player = usePlayer();
	const time = usePlayerState((s) => Math.floor(s.time));
	const bookmarks = useBookmarks(book.uuid);
	const scope = useTimeScope();
	const at = (seconds: number) => clockIn(book.chapters, seconds, scope);
	return (
		<View style={{ flex: 1, width: "100%" }}>
			<PanelTitle title={t("audiobook.player_bookmarks")} />
			<Pressable
				onPress={() => {
					haptics.release();
					bookmarks.add(time);
				}}
				accessibilityRole="button"
				style={({ pressed }) => ({
					height: 44,
					borderRadius: radius.pill,
					backgroundColor: tone.text,
					flexDirection: "row",
					alignItems: "center",
					justifyContent: "center",
					gap: space.sm,
					marginBottom: space.sm,
					opacity: pressed ? 0.8 : 1,
				})}
			>
				<Icon
					name={{ ios: "bookmark.fill", android: "bookmark_add" }}
					size={18}
					color={tone.onText}
				/>
				<Text variant="label" style={{ color: tone.onText }}>
					{t("audiobook.player_bookmark_add")}
				</Text>
				<Text
					variant="caption"
					style={{
						color: tone.onText,
						opacity: 0.7,
						fontVariant: ["tabular-nums"],
					}}
				>
					{at(time)}
				</Text>
			</Pressable>
			<FlatList
				data={bookmarks.list}
				keyExtractor={(bookmark) => bookmark.id}
				showsVerticalScrollIndicator={false}
				keyboardShouldPersistTaps="handled"
				ListEmptyComponent={
					<Text
						variant="subhead"
						style={{
							color: tone.muted,
							textAlign: "center",
							paddingVertical: space.xl,
							paddingHorizontal: space.lg,
						}}
					>
						{t("audiobook.player_bookmarks_empty")}
					</Text>
				}
				renderItem={({ item, index }) => (
					<BookmarkRow
						bookmark={item}
						position={index}
						time={at(item.time)}
						chapter={chapterNameAt(book.chapters, item.time)}
						onSeek={() => {
							haptics.select();
							void player.seek(item.time, true);
						}}
						onRename={(label) => bookmarks.rename(item.id, label)}
						onRemove={() => {
							haptics.tap();
							bookmarks.remove(item.id);
						}}
					/>
				)}
			/>
		</View>
	);
}

function BookmarkRow({
	bookmark,
	position,
	time: timeLabel,
	chapter,
	onSeek,
	onRename,
	onRemove,
}: {
	bookmark: AudioBookmark;
	position: number;
	time: string;
	chapter: string | null;
	onSeek: () => void;
	onRename: (label: string) => void;
	onRemove: () => void;
}) {
	const tone = useSheetInk();
	const [draft, setDraft] = useState<string | null>(null);
	const { title, chapter: subtitle } = bookmarkLines(
		bookmark,
		chapter,
		timeLabel,
	);
	const time = (
		<Text
			variant="caption"
			style={{
				color: tone.text,
				fontWeight: "600",
				fontVariant: ["tabular-nums"],
				minWidth: 44,
			}}
		>
			{timeLabel}
		</Text>
	);

	if (draft !== null) {
		const save = () => {
			onRename(draft);
			setDraft(null);
		};
		return (
			<View
				style={{
					minHeight: ROW,
					flexDirection: "row",
					alignItems: "center",
					gap: space.sm,
					paddingLeft: space.md,
				}}
			>
				{time}
				<TextInput
					autoFocus
					value={draft}
					onChangeText={setDraft}
					onSubmitEditing={save}
					onBlur={save}
					returnKeyType="done"
					maxLength={140}
					placeholder={
						chapter ?? t("audiobook.player_bookmark_label_placeholder")
					}
					placeholderTextColor={tone.faint}
					selectionColor={tone.text}
					accessibilityLabel={t("audiobook.player_bookmark_edit")}
					style={{
						flex: 1,
						height: 40,
						paddingHorizontal: space.md,
						borderRadius: radius.field,
						backgroundColor: tone.chip,
						color: tone.text,
						fontSize: 15,
					}}
				/>
				<RowIcon
					icon={icons.check}
					label={t("audiobook.player_bookmark_label_save")}
					onPress={save}
					color={tone.text}
				/>
			</View>
		);
	}

	return (
		<View
			style={{
				minHeight: ROW,
				flexDirection: "row",
				alignItems: "center",
			}}
		>
			<Pressable
				onPress={onSeek}
				android_ripple={{ color: tone.press }}
				accessibilityRole="button"
				style={({ pressed }) => ({
					flex: 1,
					minHeight: ROW,
					flexDirection: "row",
					alignItems: "center",
					gap: space.sm,
					paddingHorizontal: space.md,
					borderRadius: radius.field,
					overflow: "hidden",
					backgroundColor: pressed && !IS_ANDROID ? tone.press : "transparent",
				})}
			>
				<Text
					variant="caption"
					style={{
						color: tone.faint,
						width: 16,
						textAlign: "right",
						fontVariant: ["tabular-nums"],
					}}
				>
					{position + 1}
				</Text>
				{time}
				<View style={{ flex: 1 }}>
					<Text
						variant="subhead"
						numberOfLines={1}
						style={{ color: tone.text }}
					>
						{title}
					</Text>
					{subtitle ? (
						<Text
							variant="caption"
							numberOfLines={1}
							style={{ color: tone.muted }}
						>
							{subtitle}
						</Text>
					) : null}
				</View>
			</Pressable>
			<RowIcon
				icon={icons.edit}
				label={t("audiobook.player_bookmark_edit")}
				onPress={() => setDraft(bookmark.label)}
				color={tone.muted}
			/>
			<RowIcon
				icon={icons.trash}
				label={t("audiobook.player_bookmark_delete")}
				onPress={onRemove}
				color={tone.muted}
			/>
		</View>
	);
}

function RowIcon({
	icon,
	label,
	onPress,
	color,
}: {
	icon: (typeof icons)[keyof typeof icons];
	label: string;
	onPress: () => void;
	color: string;
}) {
	const tone = useSheetInk();
	return (
		<Pressable
			onPress={onPress}
			accessibilityRole="button"
			accessibilityLabel={label}
			hitSlop={4}
			android_ripple={{ color: tone.press, borderless: true, radius: 20 }}
			style={({ pressed }) => ({
				width: 40,
				height: 40,
				alignItems: "center",
				justifyContent: "center",
				opacity: pressed && !IS_ANDROID ? 0.5 : 1,
			})}
		>
			<Icon name={icon} size={18} color={color} />
		</Pressable>
	);
}
