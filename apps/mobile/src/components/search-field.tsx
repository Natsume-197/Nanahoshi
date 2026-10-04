import { useRef, useState } from "react";
import { Pressable, TextInput, View } from "react-native";
import { t } from "@/lib/i18n";
import { fonts, radius, sizes, space, type, usePalette } from "@/theme";
import { Icon, icons } from "./icon";

/** The web's mobile search input (InputGroup h-11 rounded-2xl bg-control):
 * magnifier in the text color, 16pt text, a clear button once there's
 * something to clear. Uncontrolled; reports debounced text so a query is
 * sent when typing pauses, not per keystroke. */
export function SearchField({
	placeholder,
	onQuery,
	onSubmit,
	defaultValue,
	autoFocus,
	delay = 250,
}: {
	placeholder: string;
	onQuery: (query: string) => void;
	/** The search key: the query is final, worth remembering. */
	onSubmit?: (query: string) => void;
	/** Starting text; remount (key) to replace it. */
	defaultValue?: string;
	autoFocus?: boolean;
	delay?: number;
}) {
	const palette = usePalette();
	const inputRef = useRef<TextInput>(null);
	const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
	// Only flips on empty ↔ non-empty, so typing doesn't re-render per key.
	const [hasText, setHasText] = useState(!!defaultValue);

	const schedule = (text: string) => {
		if (text.length > 0 !== hasText) setHasText(text.length > 0);
		if (timer.current) clearTimeout(timer.current);
		timer.current = setTimeout(() => onQuery(text.trim()), text ? delay : 0);
	};

	return (
		<View
			style={{
				flexDirection: "row",
				alignItems: "center",
				gap: space.sm,
				height: sizes.control,
				paddingLeft: 14,
				paddingRight: space.md,
				borderRadius: radius.card,
				borderCurve: "continuous",
				backgroundColor: palette.input,
			}}
		>
			<Icon name={icons.search} size={20} color={palette.text} />
			<TextInput
				ref={inputRef}
				placeholder={placeholder}
				placeholderTextColor={palette.textSecondary}
				selectionColor={palette.accent}
				cursorColor={palette.text}
				defaultValue={defaultValue}
				onChangeText={schedule}
				onSubmitEditing={(event) => onSubmit?.(event.nativeEvent.text.trim())}
				returnKeyType="search"
				autoCapitalize="none"
				autoCorrect={false}
				spellCheck={false}
				autoComplete="off"
				autoFocus={autoFocus}
				clearButtonMode="never"
				underlineColorAndroid="transparent"
				style={{
					...type.lead,
					lineHeight: undefined,
					fontFamily: fonts["400"],
					flex: 1,
					height: "100%",
					color: palette.text,
					paddingVertical: 0,
					includeFontPadding: false,
				}}
			/>
			{hasText ? (
				<Pressable
					accessibilityRole="button"
					accessibilityLabel={t("common.clear_search")}
					hitSlop={10}
					onPress={() => {
						inputRef.current?.clear();
						schedule("");
					}}
				>
					<Icon name={icons.close} size={18} color={palette.textTertiary} />
				</Pressable>
			) : null}
		</View>
	);
}
