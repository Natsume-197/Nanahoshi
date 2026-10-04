import { Host, Picker } from "@expo/ui";
import { useColorScheme, View } from "react-native";
import { radius, sizes, space, usePalette } from "@/theme";

/** A pick-one field as the platform's own dropdown menu (expo-ui Picker):
 * SwiftUI's menu on iOS, Material's exposed dropdown on Android. */
export function MenuSelect<T extends string>({
	value,
	options,
	onChange,
	flex,
}: {
	value: T;
	options: readonly { value: T; label: string }[];
	onChange: (value: T) => void;
	flex?: number;
}) {
	const palette = usePalette();
	const scheme = useColorScheme();
	return (
		<View
			style={{
				flex,
				minHeight: sizes.control,
				justifyContent: "center",
				paddingHorizontal: space.xs,
				borderRadius: radius.field,
				borderCurve: "continuous",
				borderWidth: 1,
				borderColor: palette.separator,
			}}
		>
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
