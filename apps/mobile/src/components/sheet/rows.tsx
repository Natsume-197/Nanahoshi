import { ListItem, Text } from "@expo/ui/jetpack-compose";
import { clickable, padding } from "@expo/ui/jetpack-compose/modifiers";
import type { ReactNode } from "react";
import { usePalette } from "@/theme";
import { MaterialIcon } from "../action-menu/material-icon";
import type { IconName } from "../icon-names";

// Compose only: the rows of the Material sheets (Android).

/** One row of a sheet's list: optional icon, a line or two, a trailing slot. */
export function SheetRow({
	icon,
	iconTint,
	leading,
	title,
	titleColor,
	bold,
	singleLine,
	subtitle,
	trailing,
	background,
	onPress,
}: {
	icon?: IconName;
	iconTint?: string;
	/** Compose content in the icon's place. */
	leading?: ReactNode;
	title: string;
	titleColor?: string;
	bold?: boolean;
	singleLine?: boolean;
	subtitle?: string;
	trailing?: ReactNode;
	background?: string;
	onPress?: () => void;
}) {
	const palette = usePalette();
	const lead =
		leading ??
		(icon ? (
			<MaterialIcon name={icon} tint={iconTint ?? palette.textSecondary} />
		) : null);
	return (
		<ListItem
			colors={{ containerColor: background ?? palette.sheet }}
			modifiers={onPress ? [clickable(onPress)] : undefined}
		>
			{lead ? <ListItem.LeadingContent>{lead}</ListItem.LeadingContent> : null}
			<ListItem.HeadlineContent>
				<Text
					color={titleColor ?? palette.text}
					maxLines={singleLine ? 1 : undefined}
					overflow={singleLine ? "ellipsis" : undefined}
					style={{
						typography: "bodyLarge",
						fontWeight: bold ? "600" : undefined,
					}}
				>
					{title}
				</Text>
			</ListItem.HeadlineContent>
			{subtitle ? (
				<ListItem.SupportingContent>
					<Text
						color={palette.textSecondary}
						maxLines={singleLine ? 1 : undefined}
						overflow={singleLine ? "ellipsis" : undefined}
						style={{ typography: "bodyMedium" }}
					>
						{subtitle}
					</Text>
				</ListItem.SupportingContent>
			) : null}
			{trailing ? (
				<ListItem.TrailingContent>{trailing}</ListItem.TrailingContent>
			) : null}
		</ListItem>
	);
}

/** A short label in a row's trailing slot (a length, a time). */
export function SheetMeta({ children }: { children: string }) {
	const palette = usePalette();
	return (
		<Text color={palette.textSecondary} style={{ typography: "labelMedium" }}>
			{children}
		</Text>
	);
}

/** What the sheet acts on, above its actions: a title, a line under it and
 * optional artwork. With `onPress` it's the back row of a sheet's page. */
export function SheetHeader({
	title,
	subtitle,
	leading,
	onPress,
}: {
	title: string;
	subtitle?: string;
	leading?: ReactNode;
	onPress?: () => void;
}) {
	const palette = usePalette();
	return (
		<ListItem
			colors={{ containerColor: palette.sheet }}
			modifiers={onPress ? [clickable(onPress)] : undefined}
		>
			{leading ? (
				<ListItem.LeadingContent>{leading}</ListItem.LeadingContent>
			) : null}
			<ListItem.HeadlineContent>
				<Text
					color={palette.text}
					maxLines={2}
					overflow="ellipsis"
					style={{ typography: "titleMedium" }}
				>
					{title}
				</Text>
			</ListItem.HeadlineContent>
			{subtitle ? (
				<ListItem.SupportingContent>
					<Text
						color={palette.textSecondary}
						maxLines={1}
						overflow="ellipsis"
						style={{ typography: "bodyMedium" }}
					>
						{subtitle}
					</Text>
				</ListItem.SupportingContent>
			) : null}
		</ListItem>
	);
}

/** A sheet's own title, when it isn't about one item ("Add to list"). */
export function SheetTitle({ children }: { children: string }) {
	const palette = usePalette();
	return (
		<Text
			color={palette.text}
			style={{ typography: "titleLarge" }}
			modifiers={[padding(24, 4, 24, 12)]}
		>
			{children}
		</Text>
	);
}
