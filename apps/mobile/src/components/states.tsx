import { ActivityIndicator, Pressable, View } from "react-native";
import { t } from "@/lib/i18n";
import { radius, space, usePalette } from "@/theme";
import { Icon, type IconName, icons } from "./icon";
import { Text } from "./text";

// Placeholders never reorder; stable ids just keep the linter honest.
const SKELETON_KEYS = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"];

export function ShelfSkeleton({
	width,
	audio,
}: {
	width: number;
	audio?: boolean;
}) {
	const palette = usePalette();
	const height = audio ? width : width * 1.5;
	return (
		<View
			style={{
				flexDirection: "row",
				gap: space.md,
				paddingHorizontal: space.lg,
			}}
		>
			{SKELETON_KEYS.slice(0, 4).map((key) => (
				<View key={key} style={{ width, gap: space.sm }}>
					<View
						style={{
							width,
							height,
							borderRadius: palette.coverRadius,
							borderCurve: "continuous",
							backgroundColor: palette.skeleton,
						}}
					/>
					<View
						style={{
							width: width * 0.8,
							height: 12,
							borderRadius: 4,
							backgroundColor: palette.skeleton,
						}}
					/>
					<View
						style={{
							width: width * 0.5,
							height: 10,
							borderRadius: 4,
							backgroundColor: palette.skeleton,
						}}
					/>
				</View>
			))}
		</View>
	);
}

export function RowSkeleton({
	count = 6,
	square,
}: {
	count?: number;
	square?: boolean;
}) {
	const palette = usePalette();
	return (
		<View style={{ gap: space.md, paddingHorizontal: space.lg }}>
			{SKELETON_KEYS.slice(0, count).map((key) => (
				<View
					key={key}
					style={{ flexDirection: "row", gap: space.md, alignItems: "center" }}
				>
					<View
						style={{
							width: 56,
							height: square ? 56 : 84,
							borderRadius: palette.coverRadius,
							backgroundColor: palette.skeleton,
						}}
					/>
					<View style={{ flex: 1, gap: space.sm }}>
						<View
							style={{
								width: "70%",
								height: 14,
								borderRadius: 4,
								backgroundColor: palette.skeleton,
							}}
						/>
						<View
							style={{
								width: "40%",
								height: 12,
								borderRadius: 4,
								backgroundColor: palette.skeleton,
							}}
						/>
					</View>
				</View>
			))}
		</View>
	);
}

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
