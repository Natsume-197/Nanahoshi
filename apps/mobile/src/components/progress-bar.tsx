import { View } from "react-native";
import { radius, usePalette } from "@/theme";

export function ProgressBar({
	value,
	height = 3,
}: {
	value: number;
	height?: number;
}) {
	const palette = usePalette();
	const clamped = Math.min(100, Math.max(0, value));
	return (
		<View
			accessibilityRole="progressbar"
			accessibilityValue={{ min: 0, max: 100, now: clamped }}
			style={{
				height,
				borderRadius: radius.pill,
				backgroundColor: palette.separator,
				overflow: "hidden",
			}}
		>
			<View
				style={{
					width: `${clamped}%`,
					height: "100%",
					backgroundColor: palette.accent,
				}}
			/>
		</View>
	);
}
