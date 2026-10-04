import { Host } from "@expo/ui";
import { Button, Image, Menu, Section } from "@expo/ui/swift-ui";
import {
	accessibilityLabel,
	background as backgroundFill,
	clipShape,
	frame,
} from "@expo/ui/swift-ui/modifiers";
import {
	type ActionMenuButtonProps,
	isMenuGroup,
	type MenuItem,
} from "./types";

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
						{section.map((entry) =>
							isMenuGroup(entry) ? (
								<Menu
									key={entry.id}
									label={entry.label}
									systemImage={entry.icon.ios}
								>
									{entry.sections.map((inner) => (
										<Section key={inner[0].id}>
											{inner.map((item) => (
												<ItemButton key={item.id} item={item} />
											))}
										</Section>
									))}
								</Menu>
							) : (
								<ItemButton key={entry.id} item={entry} />
							),
						)}
					</Section>
				))}
			</Menu>
		</Host>
	);
}

function ItemButton({ item }: { item: MenuItem }) {
	return (
		<Button
			label={item.label}
			systemImage={item.icon.ios}
			role={item.destructive ? "destructive" : undefined}
			onPress={item.onPress}
		/>
	);
}
