import { Host } from "@expo/ui";
import {
	Column,
	HorizontalDivider,
	ListItem,
	ModalBottomSheet,
	type ModalBottomSheetRef,
	Text,
} from "@expo/ui/jetpack-compose";
import {
	clickable,
	fillMaxWidth,
	padding,
} from "@expo/ui/jetpack-compose/modifiers";
import { type ReactNode, useRef } from "react";
import { usePalette } from "@/theme";
import { type IconName, icons } from "../icon-names";
import { MaterialIcon } from "./material-icon";
import type { MenuItem } from "./types";

export type SheetTone = {
	card: string;
	text: string;
	textSecondary: string;
	separator: string;
	danger: string;
};

/** A sheet row; the icon is optional (a plain list of choices has none). */
export type SheetItem = Omit<MenuItem, "icon"> & {
	icon?: IconName;
	/** The current value of a pick-one list: trailing check. */
	selected?: boolean;
};

/**
 * A Material bottom sheet of actions (the Play Books / YT Music pattern).
 * Mount it where it's open, outside native header views: a Compose host
 * there never gets a window to attach the sheet to.
 */
export function ActionSheet({
	sections,
	header,
	tone,
	onClose,
}: {
	sections: SheetItem[][];
	/** Compose content above the actions (what the sheet acts on). */
	header?: ReactNode;
	/** Colours for a sheet over a surface that ignores the app theme. */
	tone?: SheetTone;
	onClose: () => void;
}) {
	const theme = usePalette();
	const palette = tone ?? theme;
	const sheet = useRef<ModalBottomSheetRef>(null);
	const choose = async (item: SheetItem) => {
		// Let the sheet slide away before the action navigates.
		await sheet.current?.hide();
		item.onPress();
		onClose();
	};
	return (
		<Host style={{ position: "absolute", width: 1, height: 1 }}>
			<ModalBottomSheet
				ref={sheet}
				onDismissRequest={onClose}
				skipPartiallyExpanded
				containerColor={palette.card}
				contentColor={palette.text}
			>
				<Column modifiers={[fillMaxWidth(), padding(0, 0, 0, 12)]}>
					{header}
					{sections.map((section, index) => (
						<Column key={section[0].id} modifiers={[fillMaxWidth()]}>
							{header || index > 0 ? (
								<HorizontalDivider color={palette.separator} />
							) : null}
							{section.map((item) => (
								<ListItem
									key={item.id}
									colors={{ containerColor: palette.card }}
									modifiers={[clickable(() => void choose(item))]}
								>
									{item.icon ? (
										<ListItem.LeadingContent>
											<MaterialIcon
												name={item.icon}
												tint={
													item.destructive
														? palette.danger
														: palette.textSecondary
												}
											/>
										</ListItem.LeadingContent>
									) : null}
									<ListItem.HeadlineContent>
										<Text
											color={item.destructive ? palette.danger : palette.text}
											style={{ typography: "bodyLarge" }}
										>
											{item.label}
										</Text>
									</ListItem.HeadlineContent>
									{item.selected ? (
										<ListItem.TrailingContent>
											<MaterialIcon name={icons.check} tint={palette.text} />
										</ListItem.TrailingContent>
									) : null}
								</ListItem>
							))}
						</Column>
					))}
				</Column>
			</ModalBottomSheet>
		</Host>
	);
}
