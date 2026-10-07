import { forwardRef, type ReactNode, useState } from "react";
import { TextInput, type TextInputProps, View } from "react-native";
import { fonts, radius, sizes, type, usePalette } from "@/theme";
import { Text } from "./text";

/** A form field: 16pt text on a single underline that turns ink while
 * focused, under a 14pt medium label; no box, as the rest of the app draws
 * no surfaces. Uncontrolled by design: callers keep the value in a ref so
 * typing never re-renders the form. `large` is the sign-in field (Matter's):
 * a 56pt filled box, 17pt text, the label only for screen readers since the
 * placeholder already says what goes in. */
export const TextField = forwardRef<
	TextInput,
	TextInputProps & { label: string; large?: boolean; accessory?: ReactNode }
>(function TextField(
	{ label, large, accessory, style, onFocus, onBlur, ...props },
	ref,
) {
	const palette = usePalette();
	const [focused, setFocused] = useState(false);
	return (
		<View style={{ gap: large ? 8 : 2 }}>
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
				onFocus={(event) => {
					setFocused(true);
					onFocus?.(event);
				}}
				onBlur={(event) => {
					setFocused(false);
					onBlur?.(event);
				}}
				style={[
					{
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
								borderCurve: "continuous",
								borderWidth: 1,
								borderColor: palette.separator,
								backgroundColor: palette.input,
								fontSize: 17,
							}
						: {
								height: sizes.control,
								paddingHorizontal: 0,
								// Two points while focused; the extra point comes out of the
								// bottom padding so the text doesn't jump.
								borderBottomWidth: focused ? 2 : 1,
								paddingBottom: focused ? 0 : 1,
								borderColor: focused ? palette.text : palette.separator,
							},
					style,
				]}
			/>
		</View>
	);
});
