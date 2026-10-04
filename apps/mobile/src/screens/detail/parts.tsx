import { type Href, router } from "expo-router";
import { useState } from "react";
import { Pressable, type PressableProps, View } from "react-native";
import { Text } from "@/components/text";
import { t } from "@/lib/i18n";
import { radius, space, usePalette } from "@/theme";

export function Description({
	text,
	lines = 5,
}: {
	text: string;
	lines?: number;
}) {
	const [expanded, setExpanded] = useState(false);
	const [clamped, setClamped] = useState(false);
	if (!text) return null;
	return (
		<View style={{ gap: space.sm }}>
			<Text
				variant="body"
				selectable
				numberOfLines={expanded ? undefined : lines}
				style={{ fontSize: 16, lineHeight: 25 }}
				onTextLayout={(event) => {
					if (!expanded && event.nativeEvent.lines.length >= lines)
						setClamped(true);
				}}
			>
				{text}
			</Text>
			{clamped ? (
				<Pressable
					onPress={() => setExpanded(!expanded)}
					accessibilityRole="button"
					hitSlop={8}
					style={({ pressed }) => ({
						alignSelf: "flex-start",
						opacity: pressed ? 0.6 : 1,
					})}
				>
					<Text variant="subhead" style={{ fontWeight: "600" }}>
						{expanded ? t("book.show_less") : t("book.read_more")}
					</Text>
				</Pressable>
			) : null}
		</View>
	);
}

export function TagChips({
	tags,
}: {
	tags: { key: string; label: string; href?: Href }[];
}) {
	if (tags.length === 0) return null;
	return (
		<View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
			{tags.map((tag) =>
				tag.href ? (
					<TagChip
						key={tag.key}
						label={tag.label}
						onPress={() => tag.href && router.push(tag.href)}
					/>
				) : (
					<TagChip key={tag.key} label={tag.label} />
				),
			)}
		</View>
	);
}

function TagChip({ label, ...props }: { label: string } & PressableProps) {
	const palette = usePalette();
	return (
		<Pressable
			{...props}
			disabled={!props.onPress}
			style={({ pressed }) => ({
				height: 34,
				paddingHorizontal: space.md,
				borderRadius: radius.field,
				borderCurve: "continuous",
				backgroundColor: palette.surface,
				justifyContent: "center",
				opacity: pressed ? 0.6 : 1,
			})}
		>
			<Text variant="subhead" style={{ fontWeight: "500" }}>
				{label}
			</Text>
		</Pressable>
	);
}
