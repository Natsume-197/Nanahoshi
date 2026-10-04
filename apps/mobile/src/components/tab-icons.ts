import { useQueries } from "@tanstack/react-query";
import Constants, { ExecutionEnvironment } from "expo-constants";
import { loadAsync, renderToImageAsync } from "expo-font";
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

// Material Symbols instanced at FILL 1, subset to the tab glyphs; search, which
// has no filled form, is its wght 700 cut instead.
const FILLED_FONT = "NavSymbolsFilled";
const FILLED_CODEPOINTS: Record<string, number> = {
	home: 0xe88a,
	search: 0xe8b6,
	collections_bookmark: 0xe431,
	library_books: 0xe02f,
	account_circle: 0xe853,
};

async function renderFilledSymbol(name: string, size: number, color: string) {
	const codepoint = FILLED_CODEPOINTS[name];
	if (codepoint === undefined) return null;
	await loadAsync({
		[FILLED_FONT]: require("../../assets/fonts/NavSymbolsFilled.ttf"),
	});
	return renderToImageAsync(String.fromCharCode(codepoint), {
		fontFamily: FILLED_FONT,
		size,
		color,
		lineHeight: size,
	});
}

export type TabIconSource = {
	default: ImageSourcePropType;
	selected: ImageSourcePropType;
};

/**
 * Android tab icons drawn in their final colors. The tab bar is told not to
 * tint (a transparent icon color, see patches/react-native-screens), so the
 * profile photo keeps its colors; every other glyph brings its own inactive
 * and selected color instead; the selected one is filled, so the current tab
 * reads by shape and not only by contrast. Undefined until the glyphs are rasterized.
 */
export function useAndroidTabIcons<Name extends string>(names: Name[]) {
	const palette = usePalette();
	const variants = [
		{ color: palette.navInactive, filled: false },
		{ color: palette.text, filled: true },
	];
	const results = useQueries({
		queries: names.flatMap((name) =>
			variants.map(({ color, filled }) => ({
				queryKey: ["tab-icon", name, color, filled],
				queryFn: async () =>
					(filled ? await renderFilledSymbol(name, 24, color) : null) ??
					unstable_getMaterialSymbolSourceAsync(
						name as AndroidSymbol,
						24,
						color,
					),
				staleTime: Number.POSITIVE_INFINITY,
				gcTime: Number.POSITIVE_INFINITY,
				// Drawn on the device: offline must not park them (no tab icons).
				networkMode: "always",
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
