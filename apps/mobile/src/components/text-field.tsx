import { forwardRef, type ReactNode } from "react";
import { TextInput, type TextInputProps, View } from "react-native";
import { fonts, radius, sizes, type, usePalette } from "@/theme";
import { Text } from "./text";

/** The web's Input: 44pt, rounded-xl, --input fill with a --border hairline,
 * 16pt text under a 14pt medium label. Uncontrolled by design: callers keep
 * the value in a ref so typing never re-renders the form. `large` is the
 * sign-in field (Matter's): 56pt, 17pt text, the label only for screen
 * readers since the placeholder already says what goes in. */
export const TextField = forwardRef<
	TextInput,
	TextInputProps & { label: string; large?: boolean; accessory?: ReactNode }
>(function TextField({ label, large, accessory, style, ...props }, ref) {
	const palette = usePalette();
	return (
		<View style={{ gap: 8 }}>
			{large ? null : accessory ? (
				<View
					style={{
						flexDirection: "row",
						alignItems: "center",
						justifyContent: "space-between",
						gap: 8,
					}}
				>
					<Text variant="label">{label}</Text>
					{accessory}
				</View>
			) : (
				<Text variant="label">{label}</Text>
			)}
			<TextInput
				ref={ref}
				accessibilityLabel={large ? label : undefined}
				placeholderTextColor={palette.textSecondary}
				selectionColor={palette.accent}
				cursorColor={palette.text}
				{...props}
				style={[
					{
						height: sizes.control,
						paddingHorizontal: 12,
						borderRadius: radius.field,
						borderCurve: "continuous",
						borderWidth: 1,
						borderColor: palette.separator,
						backgroundColor: palette.input,
						color: palette.text,
						...type.lead,
						lineHeight: undefined,
						fontFamily: fonts["400"],
					},
					large
						? {
								height: 56,
								paddingHorizontal: 18,
								borderRadius: radius.card,
								fontSize: 17,
							}
						: null,
					style,
				]}
			/>
		</View>
	);
});
