import { useQueries } from "@tanstack/react-query";
import Constants, { ExecutionEnvironment } from "expo-constants";
import {
	type AndroidSymbol,
	unstable_getMaterialSymbolSourceAsync,
} from "expo-symbols";
import type { ImageSourcePropType } from "react-native";
import { usePalette } from "@/theme";

/** Our react-native-screens patch only exists in a build of this app; Expo Go
 * ships stock screens, where the bar keeps tinting every icon itself. */
export const TAB_ICONS_UNTINTED =
	process.env.EXPO_OS === "android" &&
	Constants.executionEnvironment !== ExecutionEnvironment.StoreClient;

export type TabIconSource = {
	default: ImageSourcePropType;
	selected: ImageSourcePropType;
};

/**
 * Android tab icons drawn in their final colors. The tab bar is told not to
 * tint (a transparent icon color, see patches/react-native-screens), so the
 * profile photo keeps its colors; every other glyph brings its own inactive
 * and selected color instead. Undefined until the glyphs are rasterized.
 */
export function useAndroidTabIcons<Name extends string>(names: Name[]) {
	const palette = usePalette();
	const colors = [palette.navInactive, palette.text];
	const results = useQueries({
		queries: names.flatMap((name) =>
			colors.map((color) => ({
				queryKey: ["tab-icon", name, color],
				queryFn: () =>
					unstable_getMaterialSymbolSourceAsync(
						name as AndroidSymbol,
						24,
						color,
					),
				staleTime: Number.POSITIVE_INFINITY,
				gcTime: Number.POSITIVE_INFINITY,
				enabled: TAB_ICONS_UNTINTED,
			})),
		),
	});
	const icons: Partial<Record<Name, TabIconSource>> = {};
	names.forEach((name, index) => {
		const inactive = results[index * 2]?.data;
		const selected = results[index * 2 + 1]?.data;
		if (inactive && selected) icons[name] = { default: inactive, selected };
	});
	return icons;
}

/** The tab bar's untinted marker (react-native-screens patch): alpha 0 but a
 * non-zero value, so it can't be mistaken for an unset color. CSS hex is
 * #RRGGBBAA — this is white at zero alpha. */
export const UNTINTED_TAB_ICONS = "#FFFFFF00";
