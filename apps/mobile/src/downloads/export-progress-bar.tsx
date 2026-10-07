import { View } from "react-native";
import { Icon, type IconName, icons } from "@/components/icon";
import { Pressable } from "@/components/pressable";
import { ProgressBar } from "@/components/progress-bar";
import { Text } from "@/components/text";
import { t } from "@/lib/i18n";
import { radius, space, usePalette } from "@/theme";
import type { ExportJob } from "./export";
import { useExportJob, useExports } from "./provider";

/** "Export file…" from start to end, as one strip over the tab bar: the
 * download, then Share / Save, the save itself, and where the file went. */
export function ExportProgressBar() {
	const palette = usePalette();
	const exports = useExports();
	const job = useExportJob();
	if (!job) return null;

	const { status, icon, tone } = describe(job);
	const progress =
		job.phase === "downloading" || job.phase === "saving"
			? Math.round(job.progress * 100)
			: null;
	const retryable = job.phase === "failed" && job.reason !== "forbidden";

	return (
		<View
			style={{
				marginHorizontal: space.sm,
				marginBottom: space.sm,
				paddingLeft: space.lg,
				paddingRight: space.xs,
				paddingVertical: space.sm,
				gap: space.sm,
				borderRadius: radius.card,
				borderCurve: "continuous",
				backgroundColor: palette.surfaceCard,
			}}
		>
			<View
				style={{ flexDirection: "row", alignItems: "center", gap: space.md }}
			>
				<Icon
					name={icon}
					size={18}
					color={tone === "danger" ? palette.danger : palette.textSecondary}
				/>
				<View style={{ flex: 1 }}>
					<Text
						variant="subhead"
						numberOfLines={1}
						style={{ fontWeight: "600" }}
					>
						{job.title}
					</Text>
					<Text
						variant="caption"
						tone={tone}
						numberOfLines={2}
						accessibilityLiveRegion="polite"
					>
						{status}
					</Text>
				</View>
				<Pressable
					accessibilityRole="button"
					accessibilityLabel={
						job.phase === "downloading" || job.phase === "saving"
							? t("common.cancel")
							: t("common.close")
					}
					onPress={exports.dismiss}
					hitSlop={8}
					android_ripple={{
						color: palette.ripple,
						borderless: true,
						radius: 20,
					}}
					style={{
						width: 40,
						height: 40,
						alignItems: "center",
						justifyContent: "center",
					}}
				>
					<Icon name={icons.remove} size={20} color={palette.textSecondary} />
				</Pressable>
			</View>
			{progress !== null ? (
				<View style={{ paddingRight: space.md }}>
					<ProgressBar value={progress} height={4} />
				</View>
			) : null}
			{job.phase === "ready" ? (
				<Actions>
					<StripButton
						label={t("mobile.export.share")}
						onPress={() => void exports.share()}
					/>
					<StripButton
						label={t("mobile.export.save")}
						primary
						onPress={() => void exports.save()}
					/>
				</Actions>
			) : retryable ? (
				<Actions>
					<StripButton
						label={t("common.retry")}
						primary
						onPress={exports.retry}
					/>
				</Actions>
			) : null}
		</View>
	);
}

function describe(job: ExportJob): {
	status: string;
	icon: IconName;
	tone: "secondary" | "danger";
} {
	switch (job.phase) {
		case "downloading":
			return {
				status: t("mobile.export.progress", {
					percent: Math.round(job.progress * 100),
				}),
				icon: icons.share,
				tone: "secondary",
			};
		case "ready":
			return {
				status: t("mobile.export.ready"),
				icon: icons.downloaded,
				tone: "secondary",
			};
		case "saving":
			return {
				status: t("mobile.export.saving", {
					percent: Math.round(job.progress * 100),
				}),
				icon: icons.download,
				tone: "secondary",
			};
		case "saved":
			return {
				status: job.location
					? t("mobile.export.saved", { location: job.location })
					: t("mobile.export.saved_here"),
				icon: icons.check,
				tone: "secondary",
			};
		case "failed":
			return {
				status: t(
					{
						forbidden: "mobile.export.forbidden",
						download: "mobile.export.failed",
						save: "mobile.export.save_failed",
					}[job.reason],
				),
				icon: icons.warning,
				tone: "danger",
			};
	}
}

function Actions({ children }: { children: React.ReactNode }) {
	return (
		<View
			style={{
				flexDirection: "row",
				justifyContent: "flex-end",
				gap: space.sm,
				paddingRight: space.sm,
			}}
		>
			{children}
		</View>
	);
}

function StripButton({
	label,
	primary,
	onPress,
}: {
	label: string;
	primary?: boolean;
	onPress: () => void;
}) {
	const palette = usePalette();
	return (
		<Pressable
			accessibilityRole="button"
			onPress={onPress}
			android_ripple={{ color: palette.ripple }}
			style={({ pressed }) => ({
				height: 36,
				paddingHorizontal: space.lg,
				borderRadius: radius.pill,
				overflow: "hidden",
				justifyContent: "center",
				backgroundColor: primary ? palette.primary : palette.surface,
				opacity: pressed && process.env.EXPO_OS === "ios" ? 0.8 : 1,
			})}
		>
			<Text
				variant="subhead"
				style={{
					fontWeight: "600",
					color: primary ? palette.onPrimary : palette.text,
				}}
			>
				{label}
			</Text>
		</Pressable>
	);
}
