import { type Href, router } from "expo-router";
import type { ReactNode } from "react";
import { Pressable, View } from "react-native";
import { IS_ANDROID } from "@/lib/platform";
import { radius, space, usePalette } from "@/theme";
import { Icon, type IconName, icons } from "./icon";
import { Text } from "./text";

/** Settings sections: one inset surface with hairlines between rows. */
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
		<View style={{ gap: IS_ANDROID ? space.md : space.sm }}>
			{title ? (
				<Text
					variant={IS_ANDROID ? "label" : "metaLabel"}
					tone="secondary"
					accessibilityRole="header"
					style={{
						paddingHorizontal: IS_ANDROID ? space.xs : space.lg,
						letterSpacing: IS_ANDROID ? 1 : 0,
					}}
				>
					{IS_ANDROID ? title.toLocaleUpperCase() : title}
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
	leading,
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
			{icon ? (
				<Icon
					name={icon}
					size={IS_ANDROID ? 22 : 20}
					color={destructive ? palette.danger : palette.textSecondary}
				/>
			) : null}
			<View
				style={{
					flex: 1,
					minHeight: IS_ANDROID
						? subtitle || value
							? 68
							: 56
						: subtitle
							? 60
							: 48,
					flexDirection: "row",
					alignItems: "center",
					gap: space.md,
					paddingRight: space.lg,
					paddingVertical: subtitle || (IS_ANDROID && value) ? space.sm : 0,
					borderTopWidth: first ? 0 : 1,
					borderColor: palette.separator,
				}}
			>
				<View style={{ flex: 1, gap: 2 }}>
					<Text
						variant={IS_ANDROID ? "body" : "subhead"}
						style={{ color: ink }}
					>
						{label}
					</Text>
					{subtitle ? (
						<Text variant={IS_ANDROID ? "subhead" : "caption"} tone="secondary">
							{subtitle}
						</Text>
					) : null}
					{value && IS_ANDROID ? (
						<Text variant="subhead" tone="secondary" numberOfLines={1}>
							{value}
						</Text>
					) : null}
				</View>
				{value && !IS_ANDROID ? (
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
						color={IS_ANDROID ? palette.textTertiary : palette.textSecondary}
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
				backgroundColor: pressed ? palette.surfaceCardHover : "transparent",
			})}
		>
			{content}
		</Pressable>
	);
}
