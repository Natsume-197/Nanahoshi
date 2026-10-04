import { View } from "react-native";
import { useMiniPlayerInset } from "@/player/mini-player";
import { radius, shadows, sizes, space, usePalette } from "@/theme";
import { Icon, icons } from "./icon";
import { PressableScale } from "./pressable-scale";

/** The page's one create action, floating bottom-right above the mini
 * player (Collections, Library). */
export function Fab({
	label,
	onPress,
}: {
	label: string;
	onPress: () => void;
}) {
	const palette = usePalette();
	const miniPlayerInset = useMiniPlayerInset();
	return (
		<View
			style={{
				position: "absolute",
				right: space.lg,
				// Above the floating mini player, never under it.
				bottom: space.xl + miniPlayerInset,
			}}
		>
			<PressableScale
				accessibilityRole="button"
				accessibilityLabel={label}
				onPress={onPress}
				style={{
					width: sizes.fab,
					height: sizes.fab,
					borderRadius: radius.field,
					borderCurve: "continuous",
					alignItems: "center",
					justifyContent: "center",
					backgroundColor: palette.primary,
					boxShadow: shadows.raised,
				}}
			>
				<Icon name={icons.plus} size={22} color={palette.onPrimary} />
			</PressableScale>
		</View>
	);
}
