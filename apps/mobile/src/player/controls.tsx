import type { ReactNode } from "react";
import {
	ActivityIndicator,
	Pressable,
	type PressableProps,
} from "react-native";
import { Icon, type IconName, icons } from "@/components/icon";
import { t } from "@/lib/i18n";
import { IS_ANDROID } from "@/lib/platform";
import { usePlayerState } from "./provider";

/** A round, glyph-only transport button with a 44pt+ target. `children`
 * replaces the icon when the glyph is live (play/pause with its spinner). */
export function TransportButton({
	icon,
	label,
	size = 24,
	color,
	box = 44,
	children,
	...props
}: Omit<PressableProps, "children"> & {
	icon: IconName;
	label: string;
	size?: number;
	color: string;
	box?: number;
	children?: ReactNode;
}) {
	return (
		<Pressable
			accessibilityRole="button"
			accessibilityLabel={label}
			hitSlop={6}
			{...props}
			// Android: the platform's borderless ripple; iOS: a dim on press.
			android_ripple={{
				color: "rgba(128,128,128,0.25)",
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

/** Play / pause, or a spinner while the book or the stream is loading. */
export function PlayPauseGlyph({
	size,
	color,
}: {
	size: number;
	color: string;
}) {
	const playing = usePlayerState((s) => s.playing);
	const waiting = usePlayerState((s) => s.loadingUuid !== null || s.buffering);
	if (waiting) return <ActivityIndicator color={color} />;
	return (
		<Icon name={playing ? icons.pause : icons.play} size={size} color={color} />
	);
}

export function usePlayLabel() {
	const playing = usePlayerState((s) => s.playing);
	return playing ? t("audiobook.player_pause") : t("audiobook.player_play");
}
