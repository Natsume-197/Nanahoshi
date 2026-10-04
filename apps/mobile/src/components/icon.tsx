import { SymbolView, type SymbolViewProps } from "expo-symbols";
import type { ColorValue } from "react-native";
import type { IconName } from "./icon-names";

export { type IconName, icons } from "./icon-names";

export function Icon({
	name,
	size = 20,
	color,
	weight,
}: {
	name: IconName;
	size?: number;
	color: ColorValue;
	weight?: SymbolViewProps["weight"];
}) {
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
