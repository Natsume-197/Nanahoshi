import { Host, Switch } from "@expo/ui";
import { useColorScheme } from "react-native";

export function Toggle({
	value,
	onValueChange,
	disabled,
}: {
	value: boolean;
	onValueChange: (value: boolean) => void;
	disabled?: boolean;
}) {
	const scheme = useColorScheme();
	return (
		<Host matchContents colorScheme={scheme === "dark" ? "dark" : "light"}>
			<Switch value={value} onValueChange={onValueChange} disabled={disabled} />
		</Host>
	);
}
