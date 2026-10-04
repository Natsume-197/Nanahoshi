import { ScrollView } from "react-native";
import { haptics } from "@/lib/haptics";
import { radius, sizes, space, usePalette } from "@/theme";
import { PressableScale } from "./pressable-scale";
import { Text } from "./text";

/**
 * The web's CategorySelector toggle (variant "category"): rounded-xl, 40pt
 * tall, 14pt semibold on --muted; the selected one inverts to foreground on
 * background.
 */
export function Chip({
	label,
	selected,
	onPress,
}: {
	label: string;
	selected: boolean;
	onPress: () => void;
}) {
	const palette = usePalette();
	return (
		<PressableScale
			onPress={() => {
				haptics.select();
				onPress();
			}}
			accessibilityRole="button"
			accessibilityState={{ selected }}
			style={{
				minHeight: sizes.chip,
				paddingHorizontal: space.lg,
				borderRadius: radius.field,
				borderCurve: "continuous",
				justifyContent: "center",
				backgroundColor: selected ? palette.text : palette.surface,
			}}
		>
			<Text
				variant="label"
				style={{
					fontWeight: "600",
					color: selected ? palette.background : palette.text,
				}}
			>
				{label}
			</Text>
		</PressableScale>
	);
}

export function ChipRow<T extends string>({
	options,
	value,
	onChange,
}: {
	options: readonly { value: T; label: string }[];
	value: T;
	onChange: (value: T) => void;
}) {
	return (
		<ScrollView
			horizontal
			showsHorizontalScrollIndicator={false}
			contentContainerStyle={{ gap: space.md, paddingHorizontal: space.lg }}
		>
			{options.map((option) => (
				<Chip
					key={option.value}
					label={option.label}
					selected={option.value === value}
					onPress={() => onChange(option.value)}
				/>
			))}
		</ScrollView>
	);
}
