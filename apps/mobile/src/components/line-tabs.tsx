import { ScrollView, View } from "react-native";
import { Pressable } from "@/components/pressable";
import { haptics } from "@/lib/haptics";
import { sizes, space, usePalette } from "@/theme";
import { Text } from "./text";

/** The web's TabsList variant="line": equal columns on phones, muted labels,
 * a 2pt underline under the active one. */
export function LineTabs<T extends string>({
	options,
	value,
	onChange,
	scrollable = false,
}: {
	scrollable?: boolean;
	options: readonly { value: T; label: string }[];
	value: T;
	onChange: (value: T) => void;
}) {
	const palette = usePalette();
	const tabs = (
		<View
			accessibilityRole="tablist"
			style={{
				flexDirection: "row",
				gap: scrollable ? space.xl : 0,
				borderBottomWidth: scrollable ? 0 : 1,
				borderColor: palette.separator,
			}}
		>
			{options.map((option) => {
				const active = option.value === value;
				return (
					<Pressable
						key={option.value}
						accessibilityRole="tab"
						accessibilityState={{ selected: active }}
						onPress={() => {
							if (!active) haptics.select();
							onChange(option.value);
						}}
						style={{
							flex: scrollable ? undefined : 1,
							minHeight: scrollable ? 56 : sizes.control,
							justifyContent: "center",
							paddingHorizontal: scrollable ? 0 : space.md,
						}}
					>
						<Text
							variant="label"
							numberOfLines={scrollable ? 1 : 2}
							style={{
								textAlign: "center",
								fontSize: scrollable ? 15 : undefined,
								fontWeight: "600",
								color: active ? palette.text : palette.textSecondary,
							}}
						>
							{option.label}
						</Text>
						<View
							style={{
								position: "absolute",
								left: 0,
								right: 0,
								bottom: 0,
								height: 2,
								borderRadius: 1,
								backgroundColor: active ? palette.text : "transparent",
							}}
						/>
					</Pressable>
				);
			})}
		</View>
	);
	return scrollable ? (
		<View style={{ borderBottomWidth: 1, borderColor: palette.separator }}>
			<ScrollView horizontal showsHorizontalScrollIndicator={false}>
				{tabs}
			</ScrollView>
		</View>
	) : (
		tabs
	);
}
