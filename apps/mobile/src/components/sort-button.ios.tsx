import { Host, Picker } from "@expo/ui";
import { useColorScheme, View } from "react-native";
import { space, usePalette } from "@/theme";
import { Icon, type IconName, icons } from "./icon";

/** Sort order as a native menu (expo-ui's Picker, appearance "menu"): a
 * compact button that opens the platform's own dropdown. */
export function SortButton<T extends string>({
	value,
	options,
	onChange,
	icon = icons.sort,
}: {
	/** Leading glyph; null for a plain "All ▾" filter. */
	icon?: IconName | null;
	value: T;
	options: readonly { value: T; label: string }[];
	onChange: (value: T) => void;
}) {
	const palette = usePalette();
	const scheme = useColorScheme();
	return (
		<View
			style={{
				flexDirection: "row",
				alignItems: "center",
				gap: space.xs,
				alignSelf: "flex-start",
			}}
		>
			{icon ? (
				<Icon name={icon} size={14} color={palette.textSecondary} />
			) : null}
			<Host matchContents colorScheme={scheme === "dark" ? "dark" : "light"}>
				<Picker
					selectedValue={value}
					onValueChange={(next) => onChange(next as T)}
					appearance="menu"
				>
					{options.map((option) => (
						<Picker.Item
							key={option.value}
							label={option.label}
							value={option.value}
						/>
					))}
				</Picker>
			</Host>
		</View>
	);
}
