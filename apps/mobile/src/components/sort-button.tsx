import { Host } from "@expo/ui";
import {
	Box,
	DropdownMenu,
	DropdownMenuItem,
	Text,
} from "@expo/ui/jetpack-compose";
import { fillMaxSize } from "@expo/ui/jetpack-compose/modifiers";
import { useState } from "react";
import { type LayoutChangeEvent, View } from "react-native";
import { Pressable } from "@/components/pressable";
import { space, usePalette } from "@/theme";
import { MaterialIcon } from "./action-menu/material-icon";
import { Icon, icons } from "./icon";
import { Text as Label } from "./text";

/** Sort order as a quiet text button that drops a Material menu, the
 * current order ticked. Android's Picker "menu" is an exposed-dropdown text
 * field instead, which read as a form input among the chips. */
export function SortButton<T extends string>({
	value,
	options,
	onChange,
}: {
	value: T;
	options: readonly { value: T; label: string }[];
	onChange: (value: T) => void;
}) {
	const palette = usePalette();
	const [open, setOpen] = useState(false);
	// The menu anchors to a Compose box the button's size; a host with no
	// measured size never showed it.
	const [box, setBox] = useState({ width: 0, height: 0 });
	const onLayout = (event: LayoutChangeEvent) => {
		const { width, height } = event.nativeEvent.layout;
		if (width !== box.width || height !== box.height) setBox({ width, height });
	};
	const current = options.find((option) => option.value === value);
	return (
		<View style={{ alignSelf: "flex-start" }} onLayout={onLayout}>
			{/* Under the button: a Compose host takes touches even with
			    pointerEvents none. */}
			<Host
				style={{ position: "absolute", left: 0, top: 0, ...box }}
				pointerEvents="none"
			>
				<DropdownMenu
					expanded={open}
					onDismissRequest={() => setOpen(false)}
					color={palette.card}
				>
					<DropdownMenu.Trigger>
						<Box modifiers={[fillMaxSize()]} />
					</DropdownMenu.Trigger>
					<DropdownMenu.Items>
						{options.map((option) => (
							<DropdownMenuItem
								key={option.value}
								onClick={() => {
									setOpen(false);
									if (option.value !== value) onChange(option.value);
								}}
								elementColors={{ textColor: palette.text }}
							>
								<DropdownMenuItem.Text>
									<Text>{option.label}</Text>
								</DropdownMenuItem.Text>
								{option.value === value ? (
									<DropdownMenuItem.TrailingIcon>
										<MaterialIcon name={icons.check} tint={palette.text} />
									</DropdownMenuItem.TrailingIcon>
								) : null}
							</DropdownMenuItem>
						))}
					</DropdownMenu.Items>
				</DropdownMenu>
			</Host>
			<Pressable
				accessibilityRole="button"
				accessibilityState={{ expanded: open }}
				onPress={() => setOpen(true)}
				android_ripple={{ color: palette.ripple }}
				style={{
					flexDirection: "row",
					alignItems: "center",
					gap: space.xs,
					minHeight: 40,
					paddingHorizontal: space.xs,
				}}
			>
				<Icon name={icons.sort} size={16} color={palette.textSecondary} />
				<Label variant="subhead" style={{ color: palette.text }}>
					{current?.label ?? ""}
				</Label>
				<Icon name={icons.expand} size={18} color={palette.textSecondary} />
			</Pressable>
		</View>
	);
}
