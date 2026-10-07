import type { ReactNode } from "react";
import { ActivityIndicator, View } from "react-native";
import { Pressable } from "@/components/pressable";
import { radius, space, usePalette } from "@/theme";
import { Text } from "./text";

/**
 * The tall pill of the welcome and sign-in screens (Fable, Storytel,
 * Matter): `primary` is the theme's ink, `quiet` a muted fill, `plain` just
 * the label, for the second, smaller choice under the main one.
 */
export function PillButton({
	label,
	icon,
	variant = "primary",
	loading,
	disabled,
	onPress,
}: {
	label: string;
	/** A provider mark, drawn left of the label. */
	icon?: ReactNode;
	variant?: "primary" | "quiet" | "plain";
	loading?: boolean;
	disabled?: boolean;
	onPress: () => void;
}) {
	const palette = usePalette();
	const inactive = disabled || loading;
	const ink = variant === "primary" ? palette.onPrimary : palette.text;
	return (
		<Pressable
			onPress={onPress}
			disabled={inactive}
			accessibilityRole="button"
			accessibilityLabel={label}
			accessibilityState={{ disabled: !!inactive, busy: !!loading }}
			android_ripple={variant === "plain" ? null : { color: palette.ripple }}
			style={({ pressed }) => ({
				height: variant === "plain" ? 48 : 56,
				paddingHorizontal: space.xl,
				borderRadius: radius.pill,
				overflow: "hidden",
				alignItems: "center",
				justifyContent: "center",
				backgroundColor:
					variant === "primary"
						? palette.primary
						: variant === "quiet"
							? palette.surface
							: "transparent",
				opacity: disabled
					? 0.4
					: pressed && (process.env.EXPO_OS === "ios" || variant === "plain")
						? 0.7
						: 1,
			})}
		>
			{loading ? (
				<ActivityIndicator color={ink} />
			) : (
				<View
					style={{ flexDirection: "row", alignItems: "center", gap: space.md }}
				>
					{icon}
					<Text variant="headline" style={{ color: ink }}>
						{label}
					</Text>
				</View>
			)}
		</Pressable>
	);
}
