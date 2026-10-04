import type { ReactNode } from "react";
import { ActivityIndicator, Pressable, View } from "react-native";
import { radius, sizes, space, usePalette } from "@/theme";
import { Text } from "./text";

type Variant = "primary" | "outline" | "secondary";
type Size = "md" | "hero";

/** hero: the detail page's 40pt action row with a 15pt label (web h-10). */
const SIZES = {
	md: { height: sizes.control, text: "label" },
	hero: {
		height: process.env.EXPO_OS === "ios" ? 44 : sizes.chip,
		text: "heroLabel",
	},
} as const;

/** The web's Button: 44pt, rounded-xl, 14pt medium label. `primary` is the
 * theme primary (lavender in dark, near-black in light), `outline` is the
 * bordered ghost ("Sign in with Discord"), `secondary` a quiet muted fill. */
export function Button({
	label,
	icon,
	onPress,
	loading,
	disabled,
	variant = "primary",
	size = "md",
}: {
	size?: Size;
	label: string;
	icon?: ReactNode;
	onPress?: () => void;
	loading?: boolean;
	disabled?: boolean;
	variant?: Variant;
}) {
	const palette = usePalette();
	const inactive = disabled || loading;
	const fill =
		variant === "primary"
			? palette.primary
			: variant === "secondary"
				? palette.surface
				: "transparent";
	const ink = variant === "primary" ? palette.onPrimary : palette.text;
	return (
		<Pressable
			onPress={onPress}
			disabled={inactive}
			accessibilityRole="button"
			accessibilityLabel={label}
			accessibilityState={{ disabled: !!inactive, busy: !!loading }}
			style={({ pressed }) => ({
				height:
					process.env.EXPO_OS === "ios"
						? Math.max(44, SIZES[size].height)
						: SIZES[size].height,
				paddingHorizontal: space.lg,
				borderRadius: radius.field,
				borderCurve: "continuous",
				borderWidth: variant === "outline" ? 1 : 0,
				borderColor: palette.separator,
				backgroundColor: fill,
				opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
				alignItems: "center",
				justifyContent: "center",
			})}
		>
			{loading ? (
				<ActivityIndicator color={ink} />
			) : (
				<View
					style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}
				>
					{icon}
					<Text
						variant={SIZES[size].text}
						style={{ color: ink }}
						numberOfLines={1}
					>
						{label}
					</Text>
				</View>
			)}
		</Pressable>
	);
}

/** Kept for existing call sites: the primary Button. */
export function PrimaryButton(
	props: Omit<Parameters<typeof Button>[0], "variant">,
) {
	return <Button {...props} variant="primary" />;
}

export function RoundIconButton({
	children,
	label,
	onPress,
}: {
	children: ReactNode;
	label: string;
	onPress?: () => void;
}) {
	const palette = usePalette();
	return (
		<Pressable
			onPress={onPress}
			accessibilityRole="button"
			accessibilityLabel={label}
			style={({ pressed }) => ({
				width: sizes.control,
				height: sizes.control,
				borderRadius: radius.field,
				borderCurve: "continuous",
				borderWidth: 1,
				borderColor: palette.separator,
				alignItems: "center",
				justifyContent: "center",
				opacity: pressed ? 0.7 : 1,
			})}
		>
			{children}
		</Pressable>
	);
}

/** Square secondary button beside a hero action (like, share). */
export function IconButton({
	children,
	label,
	selected,
	disabled,
	onPress,
}: {
	children: ReactNode;
	label: string;
	selected?: boolean;
	disabled?: boolean;
	onPress?: () => void;
}) {
	const palette = usePalette();
	return (
		<Pressable
			onPress={onPress}
			disabled={disabled}
			accessibilityRole="button"
			accessibilityLabel={label}
			accessibilityState={{ selected: !!selected, disabled: !!disabled }}
			style={({ pressed }) => ({
				width: process.env.EXPO_OS === "ios" ? 44 : sizes.chip,
				height: process.env.EXPO_OS === "ios" ? 44 : sizes.chip,
				borderRadius: radius.field,
				borderCurve: "continuous",
				overflow: "hidden",
				backgroundColor: selected ? palette.accentSoft : palette.surface,
				alignItems: "center",
				justifyContent: "center",
				opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
			})}
		>
			{children}
		</Pressable>
	);
}
