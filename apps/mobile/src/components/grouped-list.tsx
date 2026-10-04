import { type Href, router } from "expo-router";
import type { ReactNode } from "react";
import { Pressable, View } from "react-native";
import { IS_ANDROID } from "@/lib/platform";
import { radius, space, usePalette } from "@/theme";
import { Icon, type IconName, icons } from "./icon";
import { Text } from "./text";

/** The web's inset grouped list: one card surface, hairlines between rows
 * that start after the icon, a caret on navigable rows. `title` and `footer`
 * sit outside the card, as iOS Settings labels its sections. */
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
		<View style={{ gap: space.sm }}>
			{title ? (
				<Text
					variant="metaLabel"
					tone="secondary"
					accessibilityRole="header"
					style={{ paddingHorizontal: space.lg }}
				>
					{title}
				</Text>
			) : null}
			<View
				style={{
					borderRadius: radius.card,
					borderCurve: "continuous",
					overflow: "hidden",
					backgroundColor: palette.surfaceCard,
				}}
			>
				{children}
			</View>
			{footer ? (
				<Text
					variant="caption"
					tone="secondary"
					style={{ paddingHorizontal: space.lg }}
				>
					{footer}
				</Text>
			) : null}
		</View>
	);
}

export function GroupedRow({
	icon,
	label,
	subtitle,
	value,
	href,
	onPress,
	trailing,
	checked,
	first,
	destructive,
	disabled,
}: {
	icon?: IconName;
	label: string;
	subtitle?: string;
	value?: string;
	href?: Href;
	onPress?: () => void;
	/** A control at the end of the row (a switch, a button). */
	trailing?: ReactNode;
	/** Rows of a pick-one list: `true` shows the checkmark. */
	checked?: boolean;
	first?: boolean;
	destructive?: boolean;
	disabled?: boolean;
}) {
	const palette = usePalette();
	const ink = destructive ? palette.danger : palette.text;
	const pressable = !!(href || onPress) && !disabled;
	const content = (
		<>
			{icon ? (
				<Icon
					name={icon}
					size={20}
					color={destructive ? palette.danger : palette.textSecondary}
				/>
			) : null}
			<View
				style={{
					flex: 1,
					minHeight: subtitle ? 60 : 48,
					flexDirection: "row",
					alignItems: "center",
					gap: space.md,
					paddingRight: space.lg,
					paddingVertical: subtitle ? space.sm : 0,
					borderTopWidth: first ? 0 : 1,
					borderColor: palette.separator,
				}}
			>
				<View style={{ flex: 1, gap: 2 }}>
					<Text variant="subhead" style={{ color: ink }}>
						{label}
					</Text>
					{subtitle ? (
						<Text variant="caption" tone="secondary">
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
						size={16}
						color={palette.textSecondary}
					/>
				) : null}
			</View>
		</>
	);
	const rowStyle = {
		flexDirection: "row" as const,
		alignItems: "center" as const,
		gap: space.md,
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
				backgroundColor:
					pressed && !IS_ANDROID ? palette.surfaceCardHover : "transparent",
			})}
		>
			{content}
		</Pressable>
	);
}
