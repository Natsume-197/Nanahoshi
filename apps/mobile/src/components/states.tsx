import { ActivityIndicator, Pressable, View } from "react-native";
import { t } from "@/lib/i18n";
import { radius, space, usePalette } from "@/theme";
import { Icon, type IconName, icons } from "./icon";
import { Text } from "./text";

export { RowSkeleton, ShelfSkeleton } from "./skeleton";

export function EmptyState({
	icon,
	title,
	message,
}: {
	icon: IconName;
	title: string;
	message?: string;
}) {
	const palette = usePalette();
	return (
		<View
			style={{
				alignItems: "center",
				gap: space.md,
				paddingHorizontal: space.xxl,
				paddingVertical: 64,
			}}
		>
			<Icon name={icon} size={36} color={palette.textTertiary} />
			<Text variant="headline" style={{ textAlign: "center" }}>
				{title}
			</Text>
			{message ? (
				<Text
					variant="subhead"
					tone="secondary"
					style={{ textAlign: "center" }}
				>
					{message}
				</Text>
			) : null}
		</View>
	);
}

export function ErrorState({
	onRetry,
	detail,
}: {
	onRetry: () => void;
	detail?: string;
}) {
	const palette = usePalette();
	return (
		<View
			style={{
				alignItems: "center",
				gap: space.md,
				paddingHorizontal: space.xxl,
				paddingVertical: 64,
			}}
		>
			<Icon name={icons.warning} size={32} color={palette.textTertiary} />
			<Text variant="headline" style={{ textAlign: "center" }}>
				{t("mobile.error.title")}
			</Text>
			<Text
				variant="subhead"
				tone="secondary"
				selectable
				style={{ textAlign: "center" }}
			>
				{detail ?? t("mobile.error.desc")}
			</Text>
			<Pressable
				onPress={onRetry}
				accessibilityRole="button"
				style={({ pressed }) => ({
					marginTop: space.sm,
					height: 40,
					paddingHorizontal: space.xl,
					borderRadius: radius.pill,
					justifyContent: "center",
					backgroundColor: palette.surface,
					opacity: pressed ? 0.7 : 1,
				})}
			>
				<Text variant="subhead" style={{ fontWeight: "600" }}>
					{t("common.retry")}
				</Text>
			</Pressable>
		</View>
	);
}

export function Spinner() {
	const palette = usePalette();
	return (
		<View style={{ paddingVertical: space.xl }}>
			<ActivityIndicator color={palette.textSecondary} />
		</View>
	);
}
