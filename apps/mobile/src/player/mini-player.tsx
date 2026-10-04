import { router } from "expo-router";
import { NativeTabs } from "expo-router/unstable-native-tabs";
import { Pressable, StyleSheet, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
	useAnimatedStyle,
	useSharedValue,
	withSpring,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { Cover } from "@/components/cover";
import { Icon, icons } from "@/components/icon";
import { Text } from "@/components/text";
import { t } from "@/lib/i18n";
import { HAS_TAB_ACCESSORY, IS_ANDROID } from "@/lib/platform";
import { SNAP_SPRING, shadows, space, usePalette } from "@/theme";
import {
	JumpButton,
	PlayPauseGlyph,
	TransportButton,
	usePlayLabel,
} from "./controls";
import type { PlayerBook } from "./engine";
import { usePlayer, usePlayerState } from "./provider";
import { activeChapterIndex } from "./timing";

/** The floating card (Spotify's mini player): its height, and the air
 * around it so the page shows on every side. */
export const MINI_PLAYER_HEIGHT = 60;
const CARD_INSET = 8;
/** Gap between the card and the tab bar, so it reads as floating above it. */
const CARD_LIFT = 12;

/** Room a scrolling page leaves at its end so the floating card never
 * covers its last row. */
export function useMiniPlayerInset() {
	const shown = usePlayerState((s) => s.book !== null);
	return shown && !HAS_TAB_ACCESSORY
		? MINI_PLAYER_HEIGHT + CARD_INSET + CARD_LIFT
		: 0;
}

const openPlayer = () => router.push("/player");

/** The card is a neutral surface of the app's theme: a cover-tinted one
 * clashed with the pages around it. */
function useCardInk() {
	const palette = usePalette();
	return {
		surface: palette.surfaceCard,
		edge: palette.separator,
		text: palette.text,
		secondary: palette.textSecondary,
		track: palette.separator,
		ripple: palette.ripple,
	};
}

/**
 * The mini player as a floating card over the tab bar (Spotify's layout): cover + title / author or chapter, then jump back and play. Tap
 * it or swipe it up for the full player, swipe it down to stop. A thin
 * progress line runs along its bottom edge. iOS 26 hosts the same controls in
 * the tab bar's own accessory instead.
 */
export function MiniPlayer() {
	const book = usePlayerState((s) => s.book);
	if (!book) return null;
	return <Card book={book} />;
}

function Card({ book }: { book: PlayerBook }) {
	const player = usePlayer();
	const playLabel = usePlayLabel();
	const cardInk = useCardInk();
	const offset = useSharedValue(0);
	const style = useAnimatedStyle(() => ({
		transform: [{ translateY: offset.get() }],
		opacity: 1 - Math.max(0, offset.get()) / MINI_PLAYER_HEIGHT,
	}));
	const stop = () => void player.stop();
	// The card follows the finger: up opens the player (YouTube Music,
	// Spotify), down puts it away and stops playback.
	const swipe = Gesture.Pan()
		.activeOffsetY([-12, 12])
		.failOffsetX([-24, 24])
		.onUpdate((event) => {
			const y = event.translationY;
			offset.set(y < 0 ? y / 3 : y);
		})
		.onEnd((event) => {
			const y = event.translationY;
			const velocity = event.velocityY;
			if (y < -32 || velocity < -400) {
				scheduleOnRN(openPlayer);
				offset.set(withSpring(0, SNAP_SPRING));
			} else if (y > MINI_PLAYER_HEIGHT / 2 || velocity > 800) {
				// Carries the flick's speed; clamped so it never bounces back up.
				offset.set(
					withSpring(
						MINI_PLAYER_HEIGHT,
						{ ...SNAP_SPRING, velocity, overshootClamping: true },
						(finished) => {
							"worklet";
							if (finished) scheduleOnRN(stop);
						},
					),
				);
			} else {
				offset.set(withSpring(0, { ...SNAP_SPRING, velocity }));
			}
		});

	return (
		<View
			style={{
				paddingHorizontal: CARD_INSET,
				paddingBottom: CARD_LIFT,
			}}
		>
			<GestureDetector gesture={swipe}>
				<Animated.View
					style={[
						{
							height: MINI_PLAYER_HEIGHT,
							borderRadius: 8,
							borderCurve: "continuous",
							overflow: "hidden",
							backgroundColor: cardInk.surface,
							borderWidth: StyleSheet.hairlineWidth,
							borderColor: cardInk.edge,
							boxShadow: shadows.floating,
						},
						style,
					]}
				>
					<Pressable
						accessibilityRole="button"
						accessibilityLabel={t("audiobook.player_expand")}
						accessibilityHint={book.title}
						accessibilityActions={[
							{ name: "dismiss", label: t("audiobook.player_stop") },
						]}
						onAccessibilityAction={(event) => {
							if (event.nativeEvent.actionName === "dismiss") stop();
						}}
						onPress={openPlayer}
						android_ripple={{ color: cardInk.ripple }}
						style={({ pressed }) => ({
							flex: 1,
							flexDirection: "row",
							alignItems: "center",
							gap: space.sm,
							paddingLeft: space.sm,
							paddingRight: space.xs,
							backgroundColor:
								pressed && !IS_ANDROID ? cardInk.ripple : "transparent",
						})}
					>
						<Cover
							cover={book.cover}
							color={book.color}
							width={44}
							shape="audio"
							rounded={4}
						/>
						<TrackMeta book={book} />
						<JumpButton direction="back" color={cardInk.text} size={22} />
						<TransportButton
							icon={icons.play}
							label={playLabel}
							color={cardInk.text}
							onPress={player.toggle}
						>
							<PlayPauseGlyph size={26} color={cardInk.text} />
						</TransportButton>
					</Pressable>
					<ProgressLine book={book} />
				</Animated.View>
			</GestureDetector>
		</View>
	);
}

/** Title, then the current chapter (or the author before chapters load). */
function TrackMeta({ book }: { book: PlayerBook }) {
	const palette = usePalette();
	const cardInk = useCardInk();
	const chapterIndex = usePlayerState((s) =>
		activeChapterIndex(book.chapters, s.time),
	);
	const error = usePlayerState((s) => s.error);
	const line =
		chapterLabel(book, chapterIndex) ??
		(book.authors.join(", ") || book.narrators.join(", "));
	return (
		<View style={{ flex: 1, marginLeft: 2 }}>
			<Text
				variant="label"
				numberOfLines={1}
				style={{ color: cardInk.text, fontWeight: "600" }}
			>
				{book.title}
			</Text>
			{error ? (
				<View
					accessibilityRole="alert"
					style={{ flexDirection: "row", alignItems: "center", gap: 4 }}
				>
					<Icon name={icons.warning} size={12} color={palette.danger} />
					<Text
						variant="caption"
						numberOfLines={1}
						style={{ color: cardInk.secondary, flexShrink: 1 }}
					>
						{t("audiobook.playback_error")}
					</Text>
				</View>
			) : line ? (
				<Text
					variant="caption"
					numberOfLines={1}
					style={{ color: cardInk.secondary }}
				>
					{line}
				</Text>
			) : null}
		</View>
	);
}

function chapterLabel(book: PlayerBook, index: number) {
	const chapter = book.chapters[index];
	if (!chapter) return null;
	return (
		chapter.title ?? t("audiobook.chapter_fallback", { number: index + 1 })
	);
}

/** Whole-book progress as one unbroken line inside the card's bottom edge.
 * The fill scales instead of resizing, so the 4×/s updates only composite. */
function ProgressLine({ book }: { book: PlayerBook }) {
	const cardInk = useCardInk();
	const fraction = usePlayerState((s) =>
		book.duration > 0
			? Math.min(1, Math.round((s.time / book.duration) * 1000) / 1000)
			: 0,
	);
	return (
		<View
			style={{
				position: "absolute",
				left: space.sm,
				right: space.sm,
				bottom: 0,
				height: 2,
				borderRadius: 1,
				backgroundColor: cardInk.track,
				overflow: "hidden",
			}}
		>
			<View
				style={{
					position: "absolute",
					inset: 0,
					transformOrigin: "left",
					transform: [{ scaleX: fraction }],
					backgroundColor: cardInk.text,
				}}
			/>
		</View>
	);
}

/**
 * iOS 26's tab bar accessory (the Apple Music / Podcasts mini player). The
 * system draws the glass capsule and renders this twice — expanded above the
 * tab bar and inline beside it when the bar minimizes — so state stays in the
 * player engine, never in here.
 */
export function PlayerAccessory() {
	const book = usePlayerState((s) => s.book);
	const placement = NativeTabs.BottomAccessory.usePlacement();
	const palette = usePalette();
	const player = usePlayer();
	const playLabel = usePlayLabel();
	if (!book) return null;
	const inline = placement === "inline";
	return (
		<Pressable
			accessibilityRole="button"
			accessibilityLabel={t("audiobook.player_expand")}
			accessibilityHint={book.title}
			onPress={openPlayer}
			style={{
				flex: 1,
				flexDirection: "row",
				alignItems: "center",
				gap: 10,
				paddingLeft: inline ? 6 : 8,
				paddingRight: 4,
			}}
		>
			<Cover
				cover={book.cover}
				color={book.color}
				width={inline ? 28 : 34}
				shape="audio"
				rounded={inline ? 14 : 8}
			/>
			<View style={{ flex: 1 }}>
				<Text variant="label" numberOfLines={1}>
					{book.title}
				</Text>
				{inline ? null : <AccessorySubtitle book={book} />}
			</View>
			{inline ? null : (
				<JumpButton direction="back" color={palette.text} size={20} box={40} />
			)}
			<TransportButton
				icon={icons.play}
				label={playLabel}
				color={palette.text}
				box={40}
				onPress={player.toggle}
			>
				<PlayPauseGlyph size={22} color={palette.text} />
			</TransportButton>
		</Pressable>
	);
}

function AccessorySubtitle({ book }: { book: PlayerBook }) {
	const chapterIndex = usePlayerState((s) =>
		activeChapterIndex(book.chapters, s.time),
	);
	const chapter = chapterLabel(book, chapterIndex);
	const line = chapter ?? book.authors.join(", ");
	if (!line) return null;
	return (
		<Text variant="caption" tone="secondary" numberOfLines={1}>
			{line}
		</Text>
	);
}
