import { router } from "expo-router";
import { NativeTabs } from "expo-router/unstable-native-tabs";
import type { ReactNode } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
	FadeIn,
	useAnimatedStyle,
	useSharedValue,
	withSpring,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { Cover } from "@/components/cover";
import { Icon, icons } from "@/components/icon";
import { Pressable } from "@/components/pressable";
import { Text } from "@/components/text";
import { t } from "@/lib/i18n";
import { HAS_TAB_ACCESSORY, IS_ANDROID } from "@/lib/platform";
import { useServerStatus } from "@/providers/app-provider";
import { SNAP_SPRING, shadows, space, usePalette } from "@/theme";
import {
	JumpButton,
	PlayPauseGlyph,
	TransportButton,
	usePlayLabel,
} from "./controls";
import type { PlayerBook } from "./engine";
import { type PendingBook, pendingChapter } from "./pending";
import { usePlayer, usePlayerState } from "./provider";
import { activeChapterIndex, type Chapter } from "./timing";

/** The floating card (Spotify's mini player): its height, and the air
 * around it so the page shows on every side. */
export const MINI_PLAYER_HEIGHT = 60;
const CARD_INSET = 8;
/** Gap between the card and the tab bar, so it reads as floating above it. */
const CARD_LIFT = 12;

/** Room a scrolling page leaves at its end so the floating card never
 * covers its last row. */
export function useMiniPlayerInset() {
	const shown = usePlayerState((s) => s.book !== null || s.pending !== null);
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
	const pending = usePlayerState((s) => s.pending);
	// A tapped book shows at once, loading or failed: never a silent tap.
	if (!book && !pending) return null;
	return <Card book={book} pending={pending} />;
}

/** The floating card itself: follows the finger, up opens, down puts away. */
function FloatingCard({
	onOpen,
	onDismiss,
	children,
}: {
	onOpen: () => void;
	onDismiss: () => void;
	children: ReactNode;
}) {
	const cardInk = useCardInk();
	const offset = useSharedValue(0);
	const style = useAnimatedStyle(() => ({
		transform: [{ translateY: offset.get() }],
		opacity: 1 - Math.max(0, offset.get()) / MINI_PLAYER_HEIGHT,
	}));
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
				scheduleOnRN(onOpen);
				offset.set(withSpring(0, SNAP_SPRING));
			} else if (y > MINI_PLAYER_HEIGHT / 2 || velocity > 800) {
				// Carries the flick's speed; clamped so it never bounces back up.
				offset.set(
					withSpring(
						MINI_PLAYER_HEIGHT,
						{ ...SNAP_SPRING, velocity, overshootClamping: true },
						(finished) => {
							"worklet";
							if (finished) scheduleOnRN(onDismiss);
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
					{children}
				</Animated.View>
			</GestureDetector>
		</View>
	);
}

/**
 * One card from the tap to playback: loading, failed and playing are the
 * same tree with a different status line and controls, so going from one to
 * the next changes text in place; the cover never remounts (its reveal
 * would blink).
 */
function Card({
	book,
	pending,
}: {
	book: PlayerBook | null;
	pending: PendingBook | null;
}) {
	const player = usePlayer();
	const playLabel = usePlayLabel();
	const cardInk = useCardInk();
	// The tapped book leads while it loads; the playing one otherwise.
	const shown = pending ?? book;
	if (!shown) return null;
	const stop = () => void player.stop();
	const open = pending
		? pending.failed
			? player.retryPending
			: () => {}
		: openPlayer;
	const dismiss = pending ? player.dismissPending : stop;
	const title = shown.title || t("mobile.player.untitled");
	return (
		<FloatingCard onOpen={open} onDismiss={dismiss}>
			<Pressable
				accessibilityRole="button"
				accessibilityLabel={pending ? title : t("audiobook.player_expand")}
				accessibilityHint={pending ? undefined : title}
				accessibilityState={{ busy: !!pending && !pending.failed }}
				accessibilityActions={[
					{ name: "dismiss", label: t("audiobook.player_stop") },
				]}
				onAccessibilityAction={(event) => {
					if (event.nativeEvent.actionName === "dismiss") dismiss();
				}}
				onPress={
					pending
						? pending.failed
							? player.retryPending
							: undefined
						: openPlayer
				}
				android_ripple={{ color: cardInk.ripple }}
				style={({ pressed }) => ({
					flex: 1,
					flexDirection: "row",
					alignItems: "center",
					gap: space.sm,
					paddingLeft: space.sm,
					paddingRight: space.sm,
					backgroundColor:
						pressed && !IS_ANDROID ? cardInk.ripple : "transparent",
				})}
			>
				<Cover
					cover={shown.cover}
					color={shown.color}
					width={44}
					shape="audio"
					rounded={4}
				/>
				<View style={{ flex: 1, marginLeft: 2 }}>
					<Text
						variant="label"
						numberOfLines={1}
						style={{ color: cardInk.text, fontWeight: "600" }}
					>
						{title}
					</Text>
					{pending ? (
						<PendingLine key={pending.uuid} pending={pending} />
					) : book ? (
						<TrackLine book={book} />
					) : null}
				</View>
				{/* Two 40pt cells side by side, held off the edge by the card's
				    padding. The same two while loading (the main one spins), so
				    the card only swaps a glyph when playback starts. */}
				<View
					pointerEvents={pending ? "box-none" : "auto"}
					style={{ flexDirection: "row", alignItems: "center" }}
				>
					<View pointerEvents={pending ? "none" : "auto"}>
						<JumpButton
							direction="back"
							color={cardInk.text}
							size={22}
							box={40}
						/>
					</View>
					{pending?.failed ? (
						<TransportButton
							icon={icons.retry}
							label={t("common.retry")}
							color={cardInk.text}
							box={40}
							onPress={player.retryPending}
						/>
					) : (
						<TransportButton
							icon={icons.play}
							label={playLabel}
							color={cardInk.text}
							box={40}
							onPress={pending ? undefined : player.toggle}
						>
							<PlayPauseGlyph size={26} color={cardInk.text} />
						</TransportButton>
					)}
				</View>
			</Pressable>
			{book && !pending ? <ProgressLine book={book} /> : null}
		</FloatingCard>
	);
}

/** Under the title while a tapped book loads: the chapter it will open on
 * when the phone already knows it (so nothing changes once it plays), else
 * the author. The spinner says it is loading; only a failure gets words. */
function PendingLine({ pending }: { pending: PendingBook }) {
	const palette = usePalette();
	const cardInk = useCardInk();
	const unreachable = useServerStatus().status === "unreachable";
	const chapter = pendingChapter(pending);
	const text = pending.failed
		? unreachable
			? t("mobile.player.unreachable")
			: t("mobile.player.failed")
		: chapter
			? chapterName(chapter)
			: pending.authors.join(", ");
	return (
		<StatusLine
			text={text}
			alert={pending.failed}
			warningColor={palette.danger}
			color={cardInk.secondary}
		/>
	);
}

/** Under the title while playing: the chapter, the author before chapters
 * load, or that playback failed. */
function TrackLine({ book }: { book: PlayerBook }) {
	const palette = usePalette();
	const cardInk = useCardInk();
	const chapterIndex = usePlayerState((s) =>
		activeChapterIndex(book.chapters, s.time),
	);
	const error = usePlayerState((s) => s.error);
	const line = error
		? t("audiobook.playback_error")
		: (chapterLabel(book, chapterIndex) ??
			(book.authors.join(", ") || book.narrators.join(", ")));
	if (!line) return null;
	return (
		<StatusLine
			text={line}
			alert={error}
			warningColor={palette.danger}
			color={cardInk.secondary}
		/>
	);
}

/** The card's second line; the same element in every state, so going from
 * the author to "Loading…" to the chapter only fades its text in place. */
function StatusLine({
	text,
	alert,
	warningColor,
	color,
}: {
	text: string;
	alert: boolean;
	warningColor: string;
	color: string;
}) {
	return (
		<Animated.View
			key={text}
			entering={FadeIn.duration(180)}
			accessibilityRole={alert ? "alert" : undefined}
			style={{ flexDirection: "row", alignItems: "center", gap: 4 }}
		>
			{alert ? (
				<Icon name={icons.warning} size={12} color={warningColor} />
			) : null}
			<Text
				variant="caption"
				numberOfLines={1}
				style={{ color, flexShrink: 1 }}
			>
				{/* A space keeps the line's height, so the title never shifts. */}
				{text || " "}
			</Text>
		</Animated.View>
	);
}

function chapterLabel(book: PlayerBook, index: number) {
	const chapter = book.chapters[index];
	return chapter ? chapterName(chapter, index) : null;
}

function chapterName(chapter: Chapter, index = chapter.index) {
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
	const pending = usePlayerState((s) => s.pending);
	const placement = NativeTabs.BottomAccessory.usePlacement();
	const palette = usePalette();
	const player = usePlayer();
	const playLabel = usePlayLabel();
	const inline = placement === "inline";
	if (pending) return <PendingAccessory pending={pending} inline={inline} />;
	if (!book) return null;
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

/** The accessory's take on a book that is loading or failed to. */
function PendingAccessory({
	pending,
	inline,
}: {
	pending: PendingBook;
	inline: boolean;
}) {
	const palette = usePalette();
	const player = usePlayer();
	const unreachable = useServerStatus().status === "unreachable";
	const chapter = pendingChapter(pending);
	// Same line as the card: the chapter it will open on, else the author.
	const status = pending.failed
		? unreachable
			? t("mobile.player.unreachable")
			: t("mobile.player.failed")
		: chapter
			? chapterName(chapter)
			: pending.authors.join(", ");
	return (
		<Pressable
			accessibilityRole="button"
			accessibilityLabel={[pending.title || t("mobile.player.untitled"), status]
				.filter(Boolean)
				.join(", ")}
			onPress={pending.failed ? player.retryPending : undefined}
			style={{
				flex: 1,
				flexDirection: "row",
				alignItems: "center",
				gap: 10,
				paddingLeft: inline ? 6 : 8,
				paddingRight: 12,
			}}
		>
			<Cover
				cover={pending.cover}
				color={pending.color}
				width={inline ? 28 : 34}
				shape="audio"
				rounded={inline ? 14 : 8}
			/>
			<View style={{ flex: 1 }}>
				<Text variant="label" numberOfLines={1}>
					{pending.title || t("mobile.player.untitled")}
				</Text>
				{inline ? null : (
					<Text variant="caption" tone="secondary" numberOfLines={1}>
						{status}
					</Text>
				)}
			</View>
			{pending.failed ? (
				<Icon name={icons.retry} size={20} color={palette.text} />
			) : (
				<ActivityIndicator color={palette.text} />
			)}
		</Pressable>
	);
}
