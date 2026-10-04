import { router } from "expo-router";
import { NativeTabs } from "expo-router/unstable-native-tabs";
import { Pressable, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
	useAnimatedStyle,
	useSharedValue,
	withSpring,
	withTiming,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { Cover } from "@/components/cover";
import { Icon, icons } from "@/components/icon";
import { Text } from "@/components/text";
import { t } from "@/lib/i18n";
import { IS_ANDROID } from "@/lib/platform";
import { space, usePalette } from "@/theme";
import { PlayPauseGlyph, TransportButton, usePlayLabel } from "./controls";
import type { PlayerBook } from "./engine";
import { usePlayer, usePlayerState } from "./provider";
import { activeChapterIndex } from "./timing";

/** Fixed strip height (the web's --mobile-player-height, 4.25rem). */
export const MINI_PLAYER_HEIGHT = 68;

const openPlayer = () => router.push("/player");
const SPRING = { damping: 24, stiffness: 260 };

/**
 * The web's mobile player strip: on the chrome surface right above the tab
 * bar, cover + title / author / chapter, then only two controls (jump back,
 * play) — the strip is a handle first: tap it or swipe it up for the full
 * player, swipe it down to stop. A 2pt progress line with chapter ticks runs along its bottom.
 * iOS 26 hosts the same controls in the tab bar's own accessory instead.
 */
export function MiniPlayer() {
	const book = usePlayerState((s) => s.book);
	if (!book) return null;
	return <Strip book={book} />;
}

function Strip({ book }: { book: PlayerBook }) {
	const palette = usePalette();
	const player = usePlayer();
	const playLabel = usePlayLabel();
	const offset = useSharedValue(0);
	const style = useAnimatedStyle(() => ({
		transform: [{ translateY: offset.get() }],
		opacity: 1 - Math.max(0, offset.get()) / MINI_PLAYER_HEIGHT,
	}));
	const stop = () => void player.stop();
	// The strip follows the finger: up opens the player (YouTube Music,
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
			if (y < -32 || event.velocityY < -400) {
				scheduleOnRN(openPlayer);
				offset.set(withSpring(0, SPRING));
			} else if (y > MINI_PLAYER_HEIGHT / 2 || event.velocityY > 800) {
				offset.set(
					withTiming(MINI_PLAYER_HEIGHT, { duration: 160 }, (finished) => {
						if (finished) scheduleOnRN(stop);
					}),
				);
			} else {
				offset.set(withSpring(0, SPRING));
			}
		});

	return (
		<GestureDetector gesture={swipe}>
			<Animated.View
				style={[
					{
						height: MINI_PLAYER_HEIGHT,
						backgroundColor: palette.chrome,
						borderTopWidth: 1,
						borderColor: palette.separator,
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
					android_ripple={{ color: palette.ripple }}
					style={({ pressed }) => ({
						flex: 1,
						flexDirection: "row",
						alignItems: "center",
						gap: space.sm,
						paddingHorizontal: space.sm,
						backgroundColor:
							pressed && !IS_ANDROID ? palette.surface : "transparent",
					})}
				>
					<View
						style={{
							flex: 1,
							flexDirection: "row",
							alignItems: "center",
							gap: 10,
						}}
					>
						<Cover
							cover={book.cover}
							color={book.color}
							width={44}
							shape="audio"
							rounded={4}
						/>
						<TrackMeta book={book} />
					</View>
					<TransportButton
						icon={icons.jumpBack}
						label={t("audiobook.player_back_seconds", { seconds: 10 })}
						color={palette.text}
						size={22}
						onPress={player.back}
					/>
					<TransportButton
						icon={icons.play}
						label={playLabel}
						color={palette.text}
						onPress={player.toggle}
					>
						<PlayPauseGlyph size={26} color={palette.text} />
					</TransportButton>
				</Pressable>
				<ProgressLine book={book} />
			</Animated.View>
		</GestureDetector>
	);
}

/** Title, then author and the current chapter — the web strip's three lines. */
function TrackMeta({ book }: { book: PlayerBook }) {
	const palette = usePalette();
	const chapterIndex = usePlayerState((s) =>
		activeChapterIndex(book.chapters, s.time),
	);
	const error = usePlayerState((s) => s.error);
	const chapter = chapterLabel(book, chapterIndex);
	const authors = book.authors.join(", ");
	return (
		<View style={{ flex: 1 }}>
			<Text variant="label" numberOfLines={1}>
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
						style={{ color: palette.danger, flexShrink: 1 }}
					>
						{t("audiobook.playback_error")}
					</Text>
				</View>
			) : (
				<>
					{authors ? (
						<Text variant="caption" tone="secondary" numberOfLines={1}>
							{authors}
						</Text>
					) : null}
					{chapter ? (
						<Text
							variant="caption"
							tone="tertiary"
							numberOfLines={1}
							style={{ fontSize: 11, lineHeight: 14 }}
						>
							{chapter}
						</Text>
					) : null}
				</>
			)}
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

/** Book progress with a tick at each chapter start. The fill scales instead of
 * resizing, so the 4×/s updates composite without relaying out the ticks. */
function ProgressLine({ book }: { book: PlayerBook }) {
	const palette = usePalette();
	const fraction = usePlayerState((s) =>
		book.duration > 0
			? Math.min(1, Math.round((s.time / book.duration) * 1000) / 1000)
			: 0,
	);
	return (
		<View
			style={{
				height: 2,
				backgroundColor: palette.separator,
				overflow: "hidden",
			}}
		>
			<View
				style={{
					position: "absolute",
					inset: 0,
					transformOrigin: "left",
					transform: [{ scaleX: fraction }],
					backgroundColor: palette.text,
				}}
			/>
			{book.duration > 0 && book.chapters.length <= 60
				? book.chapters.slice(1).map((chapter) => (
						<View
							key={chapter.index}
							style={{
								position: "absolute",
								top: 0,
								bottom: 0,
								width: 2,
								left: `${(chapter.startTime / book.duration) * 100}%`,
								backgroundColor: palette.chrome,
							}}
						/>
					))
				: null}
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
				<TransportButton
					icon={icons.jumpBack}
					label={t("audiobook.player_back_seconds", { seconds: 10 })}
					color={palette.text}
					size={20}
					box={40}
					onPress={player.back}
				/>
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
