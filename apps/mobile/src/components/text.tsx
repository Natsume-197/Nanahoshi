import {
	Text as RNText,
	StyleSheet,
	type TextProps,
	type TextStyle,
} from "react-native";
import { fonts, type Palette, type, usePalette } from "@/theme";

type Variant = keyof typeof type;
const iosType: Partial<Record<Variant, TextStyle>> = {
	largeTitle: { fontSize: 34, lineHeight: 41 },
	pageTitle: { fontSize: 28, lineHeight: 34 },
	headline: { fontSize: 17, lineHeight: 22, fontWeight: "600" },
	body: { fontSize: 17, lineHeight: 22 },
	subhead: { fontSize: 15, lineHeight: 20 },
	label: { fontSize: 17, lineHeight: 22, fontWeight: "600" },
	heroLabel: { fontSize: 17, lineHeight: 22, fontWeight: "600" },
};
type Tone = "primary" | "secondary" | "tertiary" | "accent" | "danger";

const toneColor = (palette: Palette, tone: Tone) =>
	({
		primary: palette.text,
		secondary: palette.textSecondary,
		tertiary: palette.textTertiary,
		accent: palette.accent,
		danger: palette.danger,
	})[tone];

function family(weight: TextStyle["fontWeight"]) {
	const numeric =
		weight === "bold"
			? "700"
			: weight === "normal" || weight == null
				? "400"
				: String(weight);
	if (numeric >= "700") return fonts["700"];
	if (numeric >= "600") return fonts["600"];
	if (numeric >= "500") return fonts["500"];
	return fonts["400"];
}

export function Text({
	variant = "body",
	tone = "primary",
	style,
	...props
}: TextProps & { variant?: Variant; tone?: Tone }) {
	const palette = usePalette();
	const flat = StyleSheet.flatten([
		type[variant],
		process.env.EXPO_OS === "ios" ? iosType[variant] : undefined,
		{ color: toneColor(palette, tone) },
		style,
	]);
	// The weight lives in the family; leaving fontWeight set too makes Android
	// fake-bold an already bold face.
	const { fontWeight, ...rest } = flat;
	return (
		<RNText
			{...props}
			style={
				process.env.EXPO_OS === "ios"
					? flat
					: [rest, { fontFamily: family(fontWeight) }]
			}
		/>
	);
}
