import { View } from "react-native";
import { radius, usePalette } from "@/theme";
import { Text } from "./text";

/** Initial on a tinted circle — authors and narrators have no artwork. */
export function Monogram({ name, size = 56 }: { name: string; size?: number }) {
	const palette = usePalette();
	return (
		<View
			style={{
				width: size,
				height: size,
				borderRadius: radius.pill,
				backgroundColor: palette.accentSoft,
				alignItems: "center",
				justifyContent: "center",
			}}
		>
			<Text
				variant="headline"
				style={{
					color: palette.accent,
					fontSize: size * 0.38,
					lineHeight: size * 0.46,
				}}
			>
				{name.trim().slice(0, 1).toUpperCase()}
			</Text>
		</View>
	);
}
