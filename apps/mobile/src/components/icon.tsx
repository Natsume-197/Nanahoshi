import { SymbolView, type SymbolViewProps } from "expo-symbols";
import { type ColorValue, Text } from "react-native";
import { FILLED_SYMBOLS } from "./filled-symbols";
import type { IconName } from "./icon-names";

export { type IconName, icons } from "./icon-names";

export function Icon({
	name,
	size = 20,
	color,
	weight,
	filled,
}: {
	name: IconName;
	size?: number;
	color: ColorValue;
	weight?: SymbolViewProps["weight"];
	/** Android: Material Symbols at FILL 1 (SymbolsFilled.ttf); iOS names its
	 * own .fill symbols. */
	filled?: boolean;
}) {
	const codepoint = filled ? FILLED_SYMBOLS[name.android] : undefined;
	if (process.env.EXPO_OS === "android" && codepoint !== undefined) {
		return (
			<Text
				allowFontScaling={false}
				style={{
					fontFamily: "SymbolsFilled",
					fontSize: size,
					lineHeight: size,
					width: size,
					height: size,
					color,
					includeFontPadding: false,
					textAlign: "center",
				}}
			>
				{String.fromCodePoint(codepoint)}
			</Text>
		);
	}
	return (
		<SymbolView
			name={{ ios: name.ios, android: name.android } as SymbolViewProps["name"]}
			size={size}
			tintColor={color as string}
			weight={weight}
			resizeMode="scaleAspectFit"
			style={{ width: size, height: size }}
		/>
	);
}
