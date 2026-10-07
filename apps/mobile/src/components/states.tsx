import { router } from "expo-router";
import { ActivityIndicator, View } from "react-native";
import { Pressable } from "@/components/pressable";
import { t } from "@/lib/i18n";
import { serverHost } from "@/lib/server-reachability";
import { useMaybeConnection, useServerStatus } from "@/providers/app-provider";
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

/** A query React Query parked for lack of network, with nothing cached to
 * show: without this the page would sit on its skeleton forever. */
export function waitingOffline(query: {
	fetchStatus: string;
	data: unknown;
}): boolean {
	return query.fetchStatus === "paused" && query.data === undefined;
}

/** What a page that needs the server says offline, and where to go instead. */
export function OfflineState() {
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
			<Icon name={icons.offline} size={32} color={palette.textTertiary} />
			<Text variant="headline" style={{ textAlign: "center" }}>
				{t("mobile.downloads.offline_title")}
			</Text>
			<Text variant="subhead" tone="secondary" style={{ textAlign: "center" }}>
				{t("mobile.offline.page_desc")}
			</Text>
			<Pressable
				onPress={() => router.push("/downloads")}
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
					{t("mobile.offline.see_downloads")}
				</Text>
			</Pressable>
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
	const connection = useMaybeConnection();
	const unreachable = useServerStatus().status === "unreachable";
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
				{unreachable
					? t("mobile.server.unreachable_title")
					: t("mobile.error.title")}
			</Text>
			<Text
				variant="subhead"
				tone="secondary"
				selectable
				style={{ textAlign: "center" }}
			>
				{unreachable && connection
					? t("mobile.server.unreachable_desc", {
							host: serverHost(connection.serverUrl),
						})
					: (detail ?? t("mobile.error.desc"))}
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

type SpinnerTone = "primary" | "secondary" | "tertiary" | "accent";

/** Loading: padded on its own line, or `inline` in an icon's place. */
export function Spinner({
	inline,
	tone = "secondary",
}: {
	inline?: boolean;
	tone?: SpinnerTone;
}) {
	const palette = usePalette();
	const color = {
		primary: palette.text,
		secondary: palette.textSecondary,
		tertiary: palette.textTertiary,
		accent: palette.accent,
	}[tone];
	if (inline) return <ActivityIndicator size="small" color={color} />;
	return (
		<View style={{ paddingVertical: space.xl }}>
			<ActivityIndicator color={color} />
		</View>
	);
}
