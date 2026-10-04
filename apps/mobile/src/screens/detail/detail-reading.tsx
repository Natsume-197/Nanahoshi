import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { View } from "react-native";
import { Button } from "@/components/button";
import { DetailPanel } from "@/components/detail-panel";
import { ProgressBar } from "@/components/progress-bar";
import { Bone, PanelSkeleton, SkeletonPulse } from "@/components/skeleton";
import { ErrorState } from "@/components/states";
import { Text } from "@/components/text";
import { formatDuration } from "@/lib/format";
import { locale, t } from "@/lib/i18n";
import { useApi } from "@/providers/app-provider";
import { space, usePalette } from "@/theme";

/** Read-only counterpart of the web detail's reading overview. */
export function DetailReading({
	uuid,
	audio = false,
}: {
	uuid: string;
	audio?: boolean;
}) {
	const { orpc } = useApi();
	const palette = usePalette();
	const history = useQuery(
		orpc.readingSessions.history.queryOptions({
			input: {
				bookUuid: uuid,
				timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
			},
		}),
	);
	if (history.isPending)
		return (
			<View style={{ gap: space.xxl }}>
				<SkeletonPulse>
					<View style={{ gap: space.lg }}>
						<Bone width={96} height={32} />
						<Bone width="100%" height={6} radius={3} />
					</View>
				</SkeletonPulse>
				<PanelSkeleton rows={4} />
			</View>
		);
	if (history.isError) return <ErrorState onRetry={() => history.refetch()} />;
	const data = history.data;
	const current = data.runs.find((run) => run.id === data.runId);
	// The goal, its calendar and the pace live on the full history page.
	const openHistory = (
		<Button
			variant="secondary"
			label={
				current?.state === "finished"
					? t("reading_view_history")
					: current?.goalDate
						? t("reading_goal_summary", {
								date: new Date(
									`${current.goalDate}T12:00:00Z`,
								).toLocaleDateString(locale, {
									timeZone: "UTC",
									day: "numeric",
									month: "short",
								}),
							})
						: t("reading_goal_set")
			}
			onPress={() =>
				router.push({
					pathname: "/history/[uuid]",
					params: { uuid, kind: audio ? "audiobook" : "book" },
				})
			}
		/>
	);
	if (!data.sessions.length)
		return (
			<View style={{ gap: space.md, paddingVertical: space.xxl }}>
				<Text variant="headline" style={{ fontWeight: "600" }}>
					{t(audio ? "listening_empty_title" : "reading_empty_title")}
				</Text>
				<Text tone="secondary" style={{ lineHeight: 26 }}>
					{t(audio ? "listening_empty_hint" : "reading_empty_hint")}
				</Text>
				<View style={{ marginTop: space.md }}>{openHistory}</View>
			</View>
		);
	return (
		<View style={{ gap: space.xxl }}>
			<View style={{ gap: space.lg }}>
				<Text variant="display">
					{data.position == null ? "—" : `${Math.round(data.position * 100)}%`}
				</Text>
				<ProgressBar value={(data.position ?? 0) * 100} height={6} />
				{openHistory}
				<DetailPanel
					title={t("reading_time")}
					rows={[
						{
							label: t("reading_recorded"),
							value: formatDuration(data.totalSeconds) ?? "0m",
						},
						{
							label: t("reading_remaining"),
							value:
								formatDuration(data.remainingSeconds) ??
								t("reading_insufficient"),
						},
						{
							label: t(audio ? "listening_days" : "reading_days"),
							value: String(data.days.length),
						},
					]}
				/>
			</View>
			<View style={{ gap: space.lg }}>
				<Text variant="subhead" tone="secondary" accessibilityRole="header">
					{t(audio ? "listening_evolution" : "reading_evolution")}
				</Text>
				{data.days.map((day) => (
					<View
						key={day.day}
						style={{
							gap: space.sm,
							borderBottomWidth: 1,
							borderColor: palette.separator,
							paddingBottom: space.md,
						}}
					>
						<View
							style={{
								flexDirection: "row",
								justifyContent: "space-between",
								gap: space.md,
							}}
						>
							<Text variant="headline" style={{ fontWeight: "400" }}>
								{new Date(`${day.day}T12:00:00Z`).toLocaleDateString(locale, {
									timeZone: "UTC",
								})}
							</Text>
							<Text tone="secondary">
								{formatDuration(day.seconds) ?? "0m"}
							</Text>
						</View>
					</View>
				))}
			</View>
		</View>
	);
}
