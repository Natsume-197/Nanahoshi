import { type Href, router } from "expo-router";
import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { Pressable } from "@/components/pressable";
import { IS_ANDROID } from "@/lib/platform";
import { space, usePalette } from "@/theme";
import { Icon, type IconName, icons } from "./icon";
import { Text } from "./text";

const ICON_SIZE = IS_ANDROID ? 24 : 20;

/**
 * Settings sections, as Fable lays them out: no surfaces, rows straight on
 * the page, each section opened by an edge-to-edge hairline. Screens give it
 * no side padding; rows, title and footer carry their own.
 */
export function GroupedList({
	title,
	footer,
	children,
}: {
	title?: string;
	footer?: string;
	children: ReactNode;
}) {
	const palette = usePalette();
	return (
		<View
			style={{
				borderTopWidth: StyleSheet.hairlineWidth,
				borderColor: palette.separator,
				paddingVertical: space.sm,
			}}
		>
			{title ? (
				<Text
					variant={IS_ANDROID ? "label" : "metaLabel"}
					tone="secondary"
					accessibilityRole="header"
					style={{
						paddingHorizontal: space.lg,
						paddingTop: space.md,
						paddingBottom: space.xs,
					}}
				>
					{title}
				</Text>
			) : null}
			{children}
			{footer ? (
				<Text
					variant="caption"
					tone="secondary"
					style={{
						paddingHorizontal: space.lg,
						paddingTop: space.xs,
						paddingBottom: space.sm,
					}}
				>
					{footer}
				</Text>
			) : null}
		</View>
	);
}

export function GroupedRow({
	icon,
	inset,
	leading,
	label,
	subtitle,
	value,
	href,
	onPress,
	trailing,
	checked,
	destructive,
	disabled,
}: {
	icon?: IconName;
	/** No icon, but text lined up with the rows that have one. */
	inset?: boolean;
	/** Art in the icon's place (an avatar). */
	leading?: ReactNode;
	label: string;
	subtitle?: string;
	value?: string;
	href?: Href;
	onPress?: () => void;
	/** A control at the end of the row (a switch, a button). */
	trailing?: ReactNode;
	/** Rows of a pick-one list: `true` shows the checkmark. */
	checked?: boolean;
	/** Callers still mark the first row; sections draw the only hairline now. */
	first?: boolean;
	destructive?: boolean;
	disabled?: boolean;
}) {
	const palette = usePalette();
	const ink = destructive ? palette.danger : palette.text;
	const pressable = !!(href || onPress) && !disabled;
	const content = (
		<>
			{leading}
			{inset && !icon ? <View style={{ width: ICON_SIZE }} /> : null}
			{icon ? (
				// Outlined, one stroke weight for every row; filled glyphs are kept
				// for "selected" (the tab bar).
				<Icon
					name={icon}
					size={ICON_SIZE}
					color={
						destructive
							? palette.danger
							: IS_ANDROID
								? palette.text
								: palette.textSecondary
					}
				/>
			) : null}
			<View
				style={{
					flex: 1,
					// One height for every single-line row, values included, so a
					// list reads at an even pace; only descriptions add a line.
					minHeight: IS_ANDROID ? (subtitle ? 64 : 52) : subtitle ? 60 : 48,
					flexDirection: "row",
					alignItems: "center",
					gap: space.md,
					paddingRight: space.lg,
					paddingVertical: subtitle ? space.sm : 0,
				}}
			>
				<View style={{ flex: 1, gap: 2 }}>
					<Text
						variant={IS_ANDROID ? "body" : "subhead"}
						style={{ color: ink, fontWeight: IS_ANDROID ? "500" : undefined }}
					>
						{label}
					</Text>
					{subtitle ? (
						<Text variant={IS_ANDROID ? "subhead" : "caption"} tone="secondary">
							{subtitle}
						</Text>
					) : null}
				</View>
				{value ? (
					<Text
						variant="subhead"
						tone="secondary"
						numberOfLines={1}
						style={{ maxWidth: "55%" }}
						selectable
					>
						{value}
					</Text>
				) : null}
				{trailing}
				{checked ? (
					<Icon name={icons.check} size={18} color={palette.accent} />
				) : null}
				{href ? (
					<Icon
						name={icons.chevronRight}
						size={IS_ANDROID ? 20 : 16}
						color={palette.textSecondary}
					/>
				) : null}
			</View>
		</>
	);
	const rowStyle = {
		flexDirection: "row" as const,
		alignItems: "center" as const,
		gap: IS_ANDROID ? space.lg : space.md,
		paddingLeft: space.lg,
		opacity: disabled ? 0.5 : 1,
	};
	if (!pressable) {
		return <View style={rowStyle}>{content}</View>;
	}
	return (
		<Pressable
			android_ripple={{ color: palette.ripple }}
			onPress={() => {
				onPress?.();
				if (href) router.push(href);
			}}
			accessibilityRole="button"
			accessibilityState={checked === undefined ? undefined : { checked }}
			style={({ pressed }) => ({
				...rowStyle,
				backgroundColor: pressed ? palette.surfaceCardHover : "transparent",
			})}
		>
			{content}
		</Pressable>
	);
}
