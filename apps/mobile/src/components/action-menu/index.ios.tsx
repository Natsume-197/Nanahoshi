import { Host } from "@expo/ui";
import { Button, Image, Menu, Section } from "@expo/ui/swift-ui";
import {
	accessibilityLabel,
	background as backgroundFill,
	clipShape,
	frame,
} from "@expo/ui/swift-ui/modifiers";
import type { ActionMenuButtonProps } from "./types";

export type { ActionMenuButtonProps, MenuItem } from "./types";

/** A button that opens a native UIMenu on tap (SwiftUI `Menu`). */
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
	return (
		<Host matchContents>
			<Menu
				label={
					<Image
						systemName={icon.ios}
						size={size}
						color={color}
						modifiers={[
							frame({ width: box, height: box }),
							...(background
								? [
										backgroundFill(background),
										clipShape("roundedRectangle", radius),
									]
								: []),
							accessibilityLabel(label),
						]}
					/>
				}
			>
				{sections.map((section) => (
					<Section key={section[0].id}>
						{section.map((item) => (
							<Button
								key={item.id}
								label={item.label}
								systemImage={item.icon.ios}
								role={item.destructive ? "destructive" : undefined}
								onPress={item.onPress}
							/>
						))}
					</Section>
				))}
			</Menu>
		</Host>
	);
}
