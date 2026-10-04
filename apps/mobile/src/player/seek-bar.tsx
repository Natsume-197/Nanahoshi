import { useRef, useState, useSyncExternalStore } from "react";
import { type LayoutChangeEvent, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
	type SharedValue,
	useAnimatedReaction,
	useAnimatedStyle,
	useSharedValue,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { Icon } from "@/components/icon";
import { Text } from "@/components/text";
import { haptics } from "@/lib/haptics";
import { t } from "@/lib/i18n";
import { palettes, shadows, space } from "@/theme";
import { clock, formatSpeed, realTimeAt } from "./timing";

const TRACK = 4;
const THUMB = 14;
const BUBBLE_MAX = 288;
const BOOKMARK_GLYPH = { ios: "bookmark.fill", android: "bookmark" } as const;
/** Playback this close to a released seek has caught up with it. */
const CAUGHT_UP_SECONDS = 2;
/** A seek that never lands (an error) lets go of the bar after this. */
const HOLD_MS = 2500;

/** What the bubble says over the finger while scrubbing. */
export type ScrubLabel = {
	/** "2 · note" for a bookmark with a note under the finger. */
	bookmark: string | null;
	/** "3. Title", shown when there's no bookmark line. */
	chapter: string | null;
	/** Any bookmark in reach, noted or not: the finger feels a tick. */
	bookmarkId: string | null;
};

type Store = {
	get: () => number | null;
	set: (value: number | null) => void;
	subscribe: (listener: () => void) => () => void;
};

/** Scrubbed seconds, outside React state: only the labels re-render. */
function createStore(): Store {
	let value: number | null = null;
	const listeners = new Set<() => void>();
	return {
		get: () => value,
		set: (next) => {
			if (next === value) return;
			value = next;
			for (const listener of listeners) listener();
		},
		subscribe: (listener) => {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
	};
}

const useScrubbed = (store: Store) =>
	useSyncExternalStore(store.subscribe, store.get);

/**
 * The web's PlayerSeekBar (size lg): a track you can tap or drag, elapsed on
 * the left, and on the right the time left at the current speed, over the
 * chapter or the whole book (the player's ⋮ menu picks). Chapter starts cut
 * the track and bookmarks stand out of it. The drag lives on the UI thread;
 * only the labels hear about it, once per whole second. While dragging, a
 * bubble over the finger names the chapter or the bookmark under it, like
 * the web's tooltip. On release the bar holds the new spot until playback
 * gets there, so the thumb never flicks back to where it was.
 */
export function SeekBar({
	start,
	end,
	time,
	onSeek,
	rate = 1,
	markers,
	ticks,
	gap,
	color,
	track,
	muted,
	describe,
}: {
	start: number;
	end: number;
	time: number;
	onSeek: (time: number) => void;
	/** The countdown is wall-clock time: what's left takes less at 1.5×. */
	rate?: number;
	/** Chapter starts, as fractions of the track. */
	markers?: number[];
	/** Bookmarks, as fractions of the track. */
	ticks?: number[];
	/** Colour of the chapter cuts: the surface behind the bar. */
	gap?: string;
	color: string;
	track: string;
	muted: string;
	/** Names the moment at an absolute time for the scrub bubble. */
	describe?: (time: number) => ScrubLabel;
}) {
	const [width, setWidth] = useState(0);
	const [store] = useState(createStore);
	const drag = useSharedValue<number | null>(null);
	// The released spot, shown until playback reaches it.
	const held = useSharedValue<number | null>(null);
	const widthValue = useSharedValue(0);
	const lastBookmark = useRef<string | null>(null);
	const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
	const span = Math.max(1, end - start);
	const fraction = Math.min(1, Math.max(0, (time - start) / span));

	const commit = (value: number) => {
		onSeek(start + value * span);
		if (holdTimer.current) clearTimeout(holdTimer.current);
		holdTimer.current = setTimeout(() => held.set(null), HOLD_MS);
	};
	const scrubbed = (seconds: number) => {
		store.set(seconds < 0 ? null : seconds);
		const bookmarkId =
			seconds < 0 ? null : (describe?.(start + seconds).bookmarkId ?? null);
		// A tick under the finger as it crosses a bookmark.
		if (bookmarkId && bookmarkId !== lastBookmark.current) haptics.select();
		lastBookmark.current = bookmarkId;
	};

	// Plain JS functions for the worklets to hand back to the RN thread.
	const { grab, release } = haptics;
	const pan = Gesture.Pan()
		.minDistance(0)
		.hitSlop({ vertical: 16 })
		.onBegin((event) => {
			scheduleOnRN(grab);
			const w = widthValue.get();
			if (w > 0) drag.set(Math.min(1, Math.max(0, event.x / w)));
		})
		.onUpdate((event) => {
			const w = widthValue.get();
			if (w > 0) drag.set(Math.min(1, Math.max(0, event.x / w)));
		})
		.onEnd(() => {
			const value = drag.get();
			if (value !== null) {
				held.set(value);
				scheduleOnRN(release);
				scheduleOnRN(commit, value);
			}
		})
		.onFinalize(() => {
			drag.set(null);
		});

	// Whole seconds only, so the labels re-render ~1×/s of scrubbed time.
	useAnimatedReaction(
		() => {
			const value = drag.get() ?? held.get();
			return value === null ? -1 : Math.floor(value * span);
		},
		(seconds, previous) => {
			if (seconds !== previous) scheduleOnRN(scrubbed, seconds);
		},
		[span],
	);
	// Playback reached the released spot: the bar follows it again.
	useAnimatedReaction(
		() => fraction,
		(now) => {
			const target = held.get();
			if (
				target !== null &&
				drag.get() === null &&
				Math.abs(now - target) * span < CAUGHT_UP_SECONDS
			)
				held.set(null);
		},
		[fraction, span],
	);

	const fill = useAnimatedStyle(() => ({
		width: `${(drag.get() ?? held.get() ?? fraction) * 100}%`,
	}));
	const thumb = useAnimatedStyle(() => ({
		transform: [
			{
				translateX:
					(drag.get() ?? held.get() ?? fraction) * widthValue.get() - THUMB / 2,
			},
			{ scale: drag.get() === null ? 1 : 1.25 },
		],
	}));

	const onLayout = (event: LayoutChangeEvent) => {
		const w = event.nativeEvent.layout.width;
		setWidth(w);
		widthValue.set(w);
	};

	return (
		<View style={{ gap: space.sm, zIndex: 1 }}>
			<GestureDetector gesture={pan}>
				<View
					accessible
					accessibilityRole="adjustable"
					accessibilityLabel={t("audiobook.player_seek")}
					accessibilityValue={{
						text: t("audiobook.player_seek_position", {
							elapsed: clock(Math.max(0, time - start)),
							total: clock(span),
						}),
					}}
					onLayout={onLayout}
					style={{ height: 28, justifyContent: "center" }}
				>
					<View
						style={{
							height: TRACK,
							borderRadius: TRACK / 2,
							backgroundColor: track,
							overflow: "hidden",
						}}
					>
						<Animated.View
							style={[
								{
									position: "absolute",
									left: 0,
									top: 0,
									bottom: 0,
									backgroundColor: color,
								},
								fill,
							]}
						/>
						{gap
							? markers?.map((at) => (
									<View
										key={at}
										style={{
											position: "absolute",
											top: 0,
											bottom: 0,
											left: `${at * 100}%`,
											width: 2,
											marginLeft: -1,
											backgroundColor: gap,
										}}
									/>
								))
							: null}
					</View>
					{ticks?.map((at, index) => (
						<View
							// Two bookmarks can share a second.
							// biome-ignore lint/suspicious/noArrayIndexKey: positions only
							key={`${at}-${index}`}
							pointerEvents="none"
							style={{
								position: "absolute",
								left: `${at * 100}%`,
								width: 2,
								height: 12,
								marginLeft: -1,
								borderRadius: 1,
								backgroundColor: color,
							}}
						/>
					))}
					<Animated.View
						pointerEvents="none"
						style={[
							{
								position: "absolute",
								left: 0,
								width: THUMB,
								height: THUMB,
								borderRadius: THUMB / 2,
								backgroundColor: color,
							},
							thumb,
						]}
					/>
					{describe ? (
						<Bubble
							store={store}
							start={start}
							describe={describe}
							drag={drag}
							barWidth={widthValue}
							maxWidth={Math.min(BUBBLE_MAX, width)}
							color={color}
							muted={muted}
						/>
					) : null}
				</View>
			</GestureDetector>
			<Readout
				store={store}
				span={span}
				elapsed={time - start}
				rate={rate}
				muted={muted}
			/>
		</View>
	);
}

/** Elapsed on the left, the countdown on the right; follows the finger. */
function Readout({
	store,
	span,
	elapsed,
	rate,
	muted,
}: {
	store: Store;
	span: number;
	elapsed: number;
	rate: number;
	muted: string;
}) {
	const scrubbed = useScrubbed(store);
	const shown = Math.max(0, Math.min(span, scrubbed ?? elapsed));
	const left = realTimeAt(span - shown, rate);
	return (
		<View
			style={{
				flexDirection: "row",
				alignItems: "center",
				justifyContent: "space-between",
				marginTop: -space.xs,
			}}
		>
			<Text
				variant="subhead"
				style={{ minWidth: 72, color: muted, fontVariant: ["tabular-nums"] }}
			>
				{clock(shown)}
			</Text>
			<Text
				variant="subhead"
				style={{
					minWidth: 72,
					textAlign: "right",
					color: muted,
					fontVariant: ["tabular-nums"],
				}}
			>
				-{clock(left)}
				{rate !== 1 ? ` · ${formatSpeed(rate)}` : ""}
			</Text>
		</View>
	);
}

/** The web's scrub tooltip: the chapter ("3. Title") under the finger, or
 * the noted bookmark there, riding above it. The time is already in the
 * readout below, so the bubble only names the place. */
function Bubble({
	store,
	start,
	describe,
	drag,
	barWidth,
	maxWidth,
	color,
	muted,
}: {
	store: Store;
	start: number;
	describe: (time: number) => ScrubLabel;
	drag: SharedValue<number | null>;
	barWidth: SharedValue<number>;
	maxWidth: number;
	color: string;
	muted: string;
}) {
	const scrubbed = useScrubbed(store);
	const size = useSharedValue(0);
	const style = useAnimatedStyle(() => {
		const value = drag.get();
		const w = barWidth.get();
		const own = size.get();
		const x = (value ?? 0) * w - own / 2;
		return {
			opacity: value === null || own === 0 ? 0 : 1,
			transform: [
				{ translateX: Math.min(Math.max(0, x), Math.max(0, w - own)) },
			],
		};
	});
	const label = scrubbed === null ? null : describe(start + scrubbed);
	if (!label || (!label.bookmark && !label.chapter)) return null;
	return (
		<Animated.View
			pointerEvents="none"
			onLayout={(event) => size.set(event.nativeEvent.layout.width)}
			style={[
				{
					position: "absolute",
					left: 0,
					bottom: "100%",
					marginBottom: space.sm,
					maxWidth,
					paddingHorizontal: space.sm,
					paddingVertical: space.xs,
					borderRadius: 6,
					borderWidth: 1,
					borderColor: palettes.dark.separator,
					backgroundColor: palettes.dark.card,
					boxShadow: shadows.raised,
				},
				style,
			]}
		>
			{label.bookmark ? (
				<View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
					<Icon name={BOOKMARK_GLYPH} size={12} color={color} />
					<Text
						variant="caption"
						numberOfLines={2}
						style={{
							color,
							flexShrink: 1,
							textAlign: "center",
							fontVariant: ["tabular-nums"],
						}}
					>
						{label.bookmark}
					</Text>
				</View>
			) : (
				<Text
					variant="caption"
					numberOfLines={2}
					style={{ color: muted, textAlign: "center" }}
				>
					{label.chapter}
				</Text>
			)}
		</Animated.View>
	);
}
