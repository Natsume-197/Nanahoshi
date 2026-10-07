import { ActivityIndicator } from "react-native";
import { Pressable } from "@/components/pressable";
import { space, usePalette } from "@/theme";
import { Text } from "./text";

/** Cancel / Save in a modal's header; `strong` is the confirming one. */
export function HeaderButton({
	label,
	strong,
	busy,
	onPress,
}: {
	label: string;
	strong?: boolean;
	busy?: boolean;
	onPress: () => void;
}) {
	const palette = usePalette();
	if (busy) return <ActivityIndicator color={palette.text} />;
	return (
		<Pressable
			onPress={onPress}
			hitSlop={10}
			accessibilityRole="button"
			style={{ paddingHorizontal: space.xs }}
		>
			<Text
				variant="body"
				style={{
					color: strong ? palette.accent : palette.text,
					fontWeight: strong ? "600" : "400",
				}}
			>
				{label}
			</Text>
		</Pressable>
	);
}
