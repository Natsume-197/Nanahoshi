import { useState } from "react";
import { type LayoutChangeEvent, Pressable, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
	useAnimatedReaction,
	useAnimatedStyle,
	useSharedValue,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { Text } from "@/components/text";
import { t } from "@/lib/i18n";
import { space } from "@/theme";
import { clock } from "./timing";

const TRACK = 4;
const THUMB = 14;

/**
 * The web's PlayerSeekBar (size lg): a track you can tap or drag, elapsed on
 * the left, time remaining on the right. The drag lives in a shared value on
 * the UI thread; React only hears about it once per whole second (the preview
 * label) and once on release (the seek).
 */
export function SeekBar({
	start,
	end,
	time,
	onSeek,
	scopeLabel,
	onToggleScope,
	color,
	track,
	muted,
}: {
	start: number;
	end: number;
	time: number;
	onSeek: (time: number) => void;
	/** "Chapter" / "Book" under the times when both scopes exist. */
	scopeLabel?: string;
	onToggleScope?: () => void;
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

	const pan = Gesture.Pan()
		.minDistance(0)
		.hitSlop({ vertical: 16 })
		.onBegin((event) => {
			const w = widthValue.get();
			if (w > 0) drag.set(Math.min(1, Math.max(0, event.x / w)));
		})
		.onUpdate((event) => {
			const w = widthValue.get();
			if (w > 0) drag.set(Math.min(1, Math.max(0, event.x / w)));
		})
		.onEnd(() => {
			const value = drag.get();
			if (value !== null) scheduleOnRN(commit, value);
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

	const shown = preview ?? time - start;
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
					</View>
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
			<Pressable
				disabled={!onToggleScope}
				onPress={onToggleScope}
				accessibilityRole="button"
				accessibilityLabel={t("audiobook.player_progress_toggle")}
				style={{
					flexDirection: "row",
					alignItems: "center",
					justifyContent: "space-between",
				}}
			>
				<Text
					variant="caption"
					style={{ color: muted, fontVariant: ["tabular-nums"] }}
				>
					{clock(shown)}
				</Text>
				{scopeLabel ? (
					<Text variant="caption" style={{ color: muted }}>
						{scopeLabel}
					</Text>
				) : null}
				<Text
					variant="caption"
					style={{ color: muted, fontVariant: ["tabular-nums"] }}
				>
					-{clock(span - shown)}
				</Text>
			</Pressable>
		</View>
	);
}
