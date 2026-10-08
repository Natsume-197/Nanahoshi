import type { ReactNode } from "react";
import { ActivityIndicator, type PressableProps, View } from "react-native";
import Animated, {
	Easing,
	useAnimatedStyle,
	useSharedValue,
	withRepeat,
	withTiming,
} from "react-native-reanimated";
import { Icon, type IconName, icons } from "@/components/icon";
import { Pressable } from "@/components/pressable";
import { Text } from "@/components/text";
import { useMountEffect } from "@/hooks/use-mount-effect";
import { haptics } from "@/lib/haptics";
import { t } from "@/lib/i18n";
import { IS_ANDROID } from "@/lib/platform";
import { neutralRipple } from "@/theme";
import { ink } from "./ink";
import { usePlayer, usePlayerState } from "./provider";

/** A round, glyph-only transport button with a 44pt+ target. `children`
 * replaces the icon when the glyph is live (play/pause with its spinner). */
export function TransportButton({
	icon,
	label,
	size = 24,
	color,
	box = 44,
	children,
	silent = false,
	onPress,
	...props
}: Omit<PressableProps, "children"> & {
	icon: IconName;
	label: string;
	size?: number;
	color: string;
	box?: number;
	children?: ReactNode;
	/** No haptic: for buttons that only navigate (collapse). */
	silent?: boolean;
}) {
	return (
		<Pressable
			accessibilityRole="button"
			accessibilityLabel={label}
			hitSlop={6}
			{...props}
			onPress={(event) => {
				if (!silent) haptics.tap();
				onPress?.(event);
			}}
			// Android: the platform's borderless ripple; iOS: a dim on press.
			android_ripple={{
				color: neutralRipple,
				borderless: true,
				radius: box / 2,
			}}
			style={({ pressed }) => ({
				width: box,
				height: box,
				borderRadius: box / 2,
				alignItems: "center",
				justifyContent: "center",
				opacity: props.disabled ? 0.35 : pressed && !IS_ANDROID ? 0.5 : 1,
			})}
		>
			{children ?? <Icon name={icon} size={size} color={color} />}
		</Pressable>
	);
}

/** Play / pause, a spinner while the book loads, retry after an error.
 * A stalled stream keeps the glyph: the ring around the button says so. */
export function PlayPauseGlyph({
	size,
	color,
}: {
	size: number;
	color: string;
}) {
	const playing = usePlayerState((s) => s.playing);
	const loading = usePlayerState((s) => s.loadingUuid !== null);
	const error = usePlayerState((s) => s.error);
	// The glyph stays mounted under the spinner, already showing the pause a
	// load ends in: a glyph mounted only then draws a frame late and blinks.
	const name = error
		? icons.retry
		: playing || loading
			? icons.pause
			: icons.play;
	return (
		<View
			style={{
				width: size,
				height: size,
				alignItems: "center",
				justifyContent: "center",
			}}
		>
			<View style={{ opacity: loading ? 0 : 1 }}>
				<Icon name={name} size={size} color={color} />
			</View>
			{loading ? (
				<ActivityIndicator color={color} style={{ position: "absolute" }} />
			) : null}
		</View>
	);
}

export function usePlayLabel() {
	const playing = usePlayerState((s) => s.playing);
	const error = usePlayerState((s) => s.error);
	if (error) return t("audiobook.retry_playback");
	return playing ? t("audiobook.player_pause") : t("audiobook.player_play");
}

/** A turning arc around the play button while the stream rebuffers — a ring
 * rather than an icon swap, which would flicker on every short stall. */
export function BufferingRing({
	size,
	color,
}: {
	size: number;
	color: string;
}) {
	const buffering = usePlayerState((s) => s.buffering && !s.loadingUuid);
	if (!buffering) return null;
	return <Ring size={size} color={color} />;
}

function Ring({ size, color }: { size: number; color: string }) {
	const turn = useSharedValue(0);
	useMountEffect(() => {
		turn.set(
			withRepeat(withTiming(1, { duration: 900, easing: Easing.linear }), -1),
		);
	});
	const style = useAnimatedStyle(() => ({
		transform: [{ rotate: `${turn.get() * 360}deg` }],
	}));
	return (
		<Animated.View
			pointerEvents="none"
			style={[
				{
					position: "absolute",
					width: size,
					height: size,
					borderRadius: size / 2,
					borderWidth: 2,
					borderColor: ink.track,
					borderTopColor: color,
				},
				style,
			]}
		/>
	);
}

// SF Symbols draw every amount; Material only 5, 10 and 30, so 15 and 60 get
// the plain arrow with the number set inside it.
const MATERIAL_JUMPS = new Set([5, 10, 30]);

function JumpGlyph({
	direction,
	seconds,
	size,
	color,
}: {
	direction: "back" | "forward";
	seconds: number;
	size: number;
	color: string;
}) {
	const back = direction === "back";
	if (process.env.EXPO_OS === "ios" || MATERIAL_JUMPS.has(seconds)) {
		const name = back
			? { ios: `gobackward.${seconds}`, android: `replay_${seconds}` }
			: { ios: `goforward.${seconds}`, android: `forward_${seconds}` };
		return <Icon name={name as IconName} size={size} color={color} />;
	}
	return (
		<View style={{ alignItems: "center", justifyContent: "center" }}>
			<View style={{ transform: [{ scaleX: back ? 1 : -1 }] }}>
				<Icon
					name={{ ios: "gobackward", android: "replay" }}
					size={size}
					color={color}
				/>
			</View>
			<Text
				style={{
					position: "absolute",
					top: size * 0.36,
					color,
					fontSize: Math.round(size * 0.3),
					lineHeight: Math.round(size * 0.36),
					fontWeight: "600",
				}}
			>
				{seconds}
			</Text>
		</View>
	);
}

/** Jump back or forward by the listener's chosen amount. */
export function JumpButton({
	direction,
	color,
	size = 24,
	box,
}: {
	direction: "back" | "forward";
	color: string;
	size?: number;
	box?: number;
}) {
	const player = usePlayer();
	const seconds = usePlayerState((s) =>
		direction === "back" ? s.jumpBack : s.jumpForward,
	);
	return (
		<TransportButton
			icon={icons.jumpBack}
			label={t(
				direction === "back"
					? "audiobook.player_back_seconds"
					: "audiobook.player_forward_seconds",
				{ seconds },
			)}
			color={color}
			box={box}
			onPress={direction === "back" ? player.back : player.forward}
		>
			<JumpGlyph
				direction={direction}
				seconds={seconds}
				size={size}
				color={color}
			/>
		</TransportButton>
	);
}
