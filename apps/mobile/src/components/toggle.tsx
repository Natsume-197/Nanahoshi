import { Host } from "@expo/ui";
import { Switch } from "@expo/ui/jetpack-compose";
import { useColorScheme } from "react-native";
import { usePalette } from "@/theme";

/** Material 3's switch in the app's neutral colours; its stock purple
 * clashed with every other control. */
export function Toggle({
	value,
	onValueChange,
	disabled,
}: {
	value: boolean;
	onValueChange: (value: boolean) => void;
	disabled?: boolean;
}) {
	const palette = usePalette();
	const scheme = useColorScheme();
	return (
		<Host matchContents colorScheme={scheme === "dark" ? "dark" : "light"}>
			<Switch
				value={value}
				enabled={!disabled}
				onCheckedChange={onValueChange}
				colors={{
					checkedTrackColor: palette.text,
					checkedThumbColor: palette.background,
					checkedBorderColor: palette.text,
					uncheckedTrackColor: palette.input,
					uncheckedThumbColor: palette.textTertiary,
					uncheckedBorderColor: palette.textTertiary,
				}}
			/>
		</Host>
	);
}
