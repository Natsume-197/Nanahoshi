import { useState } from "react";
import { type LayoutChangeEvent, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
	useAnimatedReaction,
	useAnimatedStyle,
	useSharedValue,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { Text } from "@/components/text";
import { haptics } from "@/lib/haptics";
import { t } from "@/lib/i18n";
import { space } from "@/theme";
import { clock, formatSpeed, realTimeAt } from "./timing";

const TRACK = 4;
const THUMB = 14;

/**
 * The web's PlayerSeekBar (size lg): a track you can tap or drag, elapsed on
 * the left, and on the right the time left at the current speed, over the
 * chapter or the whole book (the player's ⋮ menu picks). Chapter starts cut the track and bookmarks stand
 * out of it in book scope. The drag lives in a shared value on
 * the UI thread; React only hears about it once per whole second (the preview
 * label) and once on release (the seek).
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
}) {
	const [width, setWidth] = useState(0);
	const [preview, setPreview] = useState<number | null>(null);
	const drag = useSharedValue<number | null>(null);
	const widthValue = useSharedValue(0);
	const span = Math.max(1, end - start);
	const fraction = Math.min(1, Math.max(0, (time - start) / span));

	const commit = (value: number) => {
		onSeek(start + value * span);
		setPreview(null);
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
				scheduleOnRN(release);
				scheduleOnRN(commit, value);
			}
		})
		.onFinalize(() => {
			drag.set(null);
		});

	// Whole seconds only, so a drag re-renders the label ~1×/s of scrubbed time.
	useAnimatedReaction(
		() => {
			const value = drag.get();
			return value === null ? -1 : Math.floor(value * span);
		},
		(seconds, previous) => {
			if (seconds !== previous)
				scheduleOnRN(setPreview, seconds < 0 ? null : seconds);
		},
		[span],
	);

	// Two layers: the playback fill (hidden while dragging) and the drag fill.
	const idle = useAnimatedStyle(() => ({
		opacity: drag.get() === null ? 1 : 0,
	}));
	const dragFill = useAnimatedStyle(() => {
		const value = drag.get();
		return { opacity: value === null ? 0 : 1, width: `${(value ?? 0) * 100}%` };
	});
	const dragThumb = useAnimatedStyle(() => {
		const value = drag.get();
		return {
			opacity: value === null ? 0 : 1,
			transform: [
				{ translateX: (value ?? 0) * widthValue.get() - THUMB / 2 },
				{ scale: 1.25 },
			],
		};
	});

	const shown = Math.max(0, Math.min(span, preview ?? time - start));
	const left = realTimeAt(span - shown, rate);
	const onLayout = (event: LayoutChangeEvent) => {
		const w = event.nativeEvent.layout.width;
		setWidth(w);
		widthValue.set(w);
	};

	return (
		<View style={{ gap: space.sm }}>
			<GestureDetector gesture={pan}>
				<View
					accessible
					accessibilityRole="adjustable"
					accessibilityLabel={t("audiobook.player_seek")}
					accessibilityValue={{
						text: t("audiobook.player_seek_position", {
							elapsed: clock(shown),
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
									width: `${fraction * 100}%`,
									backgroundColor: color,
								},
								idle,
							]}
						/>
						<Animated.View
							style={[
								{
									position: "absolute",
									left: 0,
									top: 0,
									bottom: 0,
									backgroundColor: color,
								},
								dragFill,
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
								transform: [{ translateX: fraction * width - THUMB / 2 }],
							},
							idle,
						]}
					/>
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
							dragThumb,
						]}
					/>
				</View>
			</GestureDetector>
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
		</View>
	);
}
