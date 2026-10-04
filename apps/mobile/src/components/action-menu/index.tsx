import { Host } from "@expo/ui";
import {
	Box,
	DropdownMenu,
	DropdownMenuItem,
	HorizontalDivider,
	Text,
} from "@expo/ui/jetpack-compose";
import { fillMaxSize } from "@expo/ui/jetpack-compose/modifiers";
import { useState } from "react";
import { Pressable, View } from "react-native";
import { usePalette } from "@/theme";
import { Icon } from "../icon";
import { MaterialIcon } from "./material-icon";
import type { ActionMenuButtonProps, MenuItem } from "./types";

export type { ActionMenuButtonProps, MenuItem } from "./types";

/** A button that drops a Material 3 menu from itself on tap. */
export function ActionMenuButton({
	sections,
	label,
	icon,
	color,
	size = 20,
	box = 44,
	background,
	radius = 0,
}: ActionMenuButtonProps) {
	const palette = usePalette();
	const [open, setOpen] = useState(false);
	return (
		<View style={{ width: box, height: box }}>
			<Pressable
				accessibilityRole="button"
				accessibilityLabel={label}
				accessibilityState={{ expanded: open }}
				onPress={() => setOpen(true)}
				android_ripple={{
					color: palette.ripple,
					borderless: !background,
					radius: box / 2,
				}}
				style={{
					width: box,
					height: box,
					borderRadius: background ? radius : box / 2,
					overflow: "hidden",
					backgroundColor: background,
					alignItems: "center",
					justifyContent: "center",
				}}
			>
				<Icon name={icon} size={size} color={color} />
			</Pressable>
			<Host style={{ position: "absolute", inset: 0 }} pointerEvents="none">
				<DropdownMenu
					expanded={open}
					onDismissRequest={() => setOpen(false)}
					color={palette.card}
				>
					<DropdownMenu.Trigger>
						<Box modifiers={[fillMaxSize()]} />
					</DropdownMenu.Trigger>
					<DropdownMenu.Items>
						<ComposeMenuItems
							sections={sections}
							onChoose={(item) => {
								setOpen(false);
								item.onPress();
							}}
						/>
					</DropdownMenu.Items>
				</DropdownMenu>
			</Host>
		</View>
	);
}

/** Dropdown rows with a divider between sections. */
export function ComposeMenuItems({
	sections,
	onChoose,
}: {
	sections: MenuItem[][];
	onChoose: (item: MenuItem) => void;
}) {
	const palette = usePalette();
	return sections.flatMap((section, index) => [
		index > 0 ? (
			<HorizontalDivider
				key={`divider-${section[0].id}`}
				color={palette.separator}
			/>
		) : null,
		...section.map((item) => (
			<DropdownMenuItem
				key={item.id}
				onClick={() => onChoose(item)}
				elementColors={{
					textColor: item.destructive ? palette.danger : palette.text,
				}}
			>
				<DropdownMenuItem.LeadingIcon>
					<MaterialIcon
						name={item.icon}
						tint={item.destructive ? palette.danger : palette.textSecondary}
					/>
				</DropdownMenuItem.LeadingIcon>
				<DropdownMenuItem.Text>
					<Text>{item.label}</Text>
				</DropdownMenuItem.Text>
			</DropdownMenuItem>
		)),
	]);
}
