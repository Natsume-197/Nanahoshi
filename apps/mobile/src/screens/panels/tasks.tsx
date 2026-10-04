import type { Task } from "@nanahoshi/api/modules/taskManager";
import { getTaskJobProgress } from "@nanahoshi/api/modules/tasks/task-progress";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { FlatList, Pressable, View } from "react-native";
import { Icon, type IconName, icons } from "@/components/icon";
import { ProgressBar } from "@/components/progress-bar";
import { askChoice, showNotice } from "@/components/prompt";
import { RefreshControl } from "@/components/refresh-control";
import { RowSkeleton } from "@/components/skeleton";
import {
	EmptyState,
	ErrorState,
	OfflineState,
	waitingOffline,
} from "@/components/states";
import { Text } from "@/components/text";
import { formatDuration, formatRelativeTime } from "@/lib/format";
import { locale, t } from "@/lib/i18n";
import { IS_ANDROID } from "@/lib/platform";
import { useMiniPlayerInset } from "@/player/mini-player";
import { useApi } from "@/providers/app-provider";
import { space, usePalette } from "@/theme";

const STATUS: Record<
	Task["status"],
	{
		label: () => string;
		icon: IconName;
		tone: "primary" | "danger" | "secondary";
	}
> = {
	running: {
		label: () => t("settings.tasks.running"),
		icon: icons.retry,
		tone: "primary",
	},
	completed: {
		label: () => t("settings.tasks.completed"),
		icon: icons.checkCircle,
		tone: "secondary",
	},
	cancelled: {
		label: () => t("settings.tasks.cancelled"),
		icon: icons.remove,
		tone: "secondary",
	},
	failed: {
		label: () => t("settings.tasks.failed_count", { count: 1 }),
		icon: icons.warning,
		tone: "danger",
	},
};

/** The web's Settings → Tasks: background jobs (scans, uploads, metadata)
 * with their progress; tap one to cancel it, or to clear it once done.
 * Members see the ones they started; admins the whole server's. */
export function TasksScreen() {
	const { orpc, client } = useApi();
	const queryClient = useQueryClient();
	const palette = usePalette();
	const miniPlayerInset = useMiniPlayerInset();
	const tasks = useQuery({
		...orpc.tasks.getAllTasks.queryOptions(),
		// Tasks start elsewhere (a scan, an upload): never trust the cache.
		staleTime: 0,
		refetchOnMount: "always",
		// Progress moves while something runs; otherwise nothing changes.
		refetchInterval: (query) =>
			query.state.data?.some((task) => task.status === "running")
				? 2000
				: false,
	});
	const refresh = () =>
		queryClient.invalidateQueries({ queryKey: orpc.tasks.key() });
	const cancel = useMutation({
		mutationFn: (taskId: string) => client.tasks.cancelTask({ taskId }),
		onSuccess: refresh,
		onError: () => showNotice(t("toast.task_cancel_failed")),
	});
	const remove = useMutation({
		mutationFn: (taskId: string) => client.tasks.deleteTask({ taskId }),
		onSuccess: refresh,
		onError: () => showNotice(t("toast.task_delete_failed")),
	});
	const clearFinished = useMutation({
		mutationFn: () => client.tasks.clearFinished(),
		onSuccess: refresh,
		onError: () => showNotice(t("toast.tasks_clear_failed")),
	});
	const rows = tasks.data ?? [];
	const hasFinished = rows.some((task) => task.status !== "running");

	const openTask = async (task: Task) => {
		const running = task.status === "running";
		const answer = await askChoice({
			title: task.label,
			options: [
				running
					? {
							id: "cancel",
							label: t("settings.tasks.cancel"),
							icon: icons.stop,
							destructive: true,
						}
					: {
							id: "delete",
							label: t("settings.tasks.delete_task"),
							icon: icons.trash,
							destructive: true,
						},
			],
		});
		if (answer === "cancel") cancel.mutate(task.id);
		if (answer === "delete") remove.mutate(task.id);
	};

	return (
		<>
			<Stack.Screen
				options={{
					// Explicit undefined: leaving the keys out keeps the old button.
					...(hasFinished
						? process.env.EXPO_OS === "ios"
							? {
									unstable_headerRightItems: () => [
										{
											type: "button",
											label: t("settings.tasks.clear_finished"),
											icon: { type: "sfSymbol", name: "trash" },
											onPress: () => clearFinished.mutate(),
										},
									],
								}
							: {
									headerRight: () => (
										<Pressable
											accessibilityRole="button"
											accessibilityLabel={t("settings.tasks.clear_finished")}
											onPress={() => clearFinished.mutate()}
											android_ripple={{
												color: palette.ripple,
												borderless: true,
												radius: 20,
											}}
											style={{
												width: 48,
												height: 48,
												alignItems: "center",
												justifyContent: "center",
											}}
										>
											<Icon name={icons.trash} size={24} color={palette.text} />
										</Pressable>
									),
								}
						: { headerRight: undefined, unstable_headerRightItems: undefined }),
				}}
			/>
			{waitingOffline(tasks) ? (
				<OfflineState />
			) : tasks.isPending ? (
				<RowSkeleton count={6} />
			) : tasks.isError ? (
				<ErrorState onRetry={() => tasks.refetch()} />
			) : (
				<FlatList
					showsVerticalScrollIndicator={false}
					data={rows}
					keyExtractor={(task) => task.id}
					contentInsetAdjustmentBehavior="automatic"
					refreshControl={<RefreshControl onRefresh={() => tasks.refetch()} />}
					ListEmptyComponent={
						<EmptyState
							icon={icons.checkCircle}
							title={t("settings.tasks.none")}
							message={t("settings.tasks.none_desc")}
						/>
					}
					contentContainerStyle={{
						paddingVertical: space.sm,
						paddingBottom: space.sm + miniPlayerInset,
					}}
					renderItem={({ item }) => (
						<TaskRow task={item} onPress={() => void openTask(item)} />
					)}
				/>
			)}
		</>
	);
}

function TaskRow({ task, onPress }: { task: Task; onPress: () => void }) {
	const palette = usePalette();
	const status = STATUS[task.status];
	const progress = getTaskJobProgress(task);
	const running = task.status === "running";
	const number = new Intl.NumberFormat(locale);
	const counts =
		running && progress.total === 0
			? t("settings.tasks.preparing")
			: t("settings.tasks.progress", {
					done: number.format(progress.done),
					total: number.format(progress.total),
					remaining: number.format(progress.remaining),
				});
	const end = running ? Date.now() : task.finishedAt;
	const elapsed =
		end === null
			? null
			: formatDuration(Math.max(0, (end - task.createdAt) / 1000));
	const meta = [
		status.label(),
		formatRelativeTime(new Date(task.createdAt)),
		elapsed,
	]
		.filter(Boolean)
		.join(" · ");
	const problems = [
		task.failedJobs > 0
			? t("settings.tasks.failed_count", { count: task.failedJobs })
			: null,
		(task.deferredJobs ?? 0) > 0
			? t("settings.tasks.deferred_count", { count: task.deferredJobs ?? 0 })
			: null,
	].filter(Boolean);

	return (
		<Pressable
			accessibilityRole="button"
			accessibilityLabel={`${task.label}, ${meta}`}
			onPress={onPress}
			android_ripple={{ color: palette.ripple }}
			style={({ pressed }) => ({
				flexDirection: "row",
				alignItems: "flex-start",
				gap: space.lg,
				paddingHorizontal: space.lg,
				paddingVertical: space.md,
				backgroundColor:
					pressed && !IS_ANDROID ? palette.surface : "transparent",
			})}
		>
			<View
				style={{
					width: 40,
					height: 40,
					borderRadius: 20,
					alignItems: "center",
					justifyContent: "center",
					backgroundColor: palette.surface,
				}}
			>
				<Icon
					name={status.icon}
					size={20}
					color={
						status.tone === "danger"
							? palette.danger
							: status.tone === "primary"
								? palette.text
								: palette.textSecondary
					}
				/>
			</View>
			<View style={{ flex: 1, gap: 4 }}>
				<Text variant="body" numberOfLines={2} style={{ fontWeight: "600" }}>
					{task.label}
				</Text>
				<Text
					variant="caption"
					tone="secondary"
					style={{ fontVariant: ["tabular-nums"] }}
				>
					{running && task.operationProgress
						? `${counts} · ${progress.percent}%`
						: counts}
				</Text>
				{running ? <ProgressBar value={progress.percent} height={4} /> : null}
				<Text variant="caption" tone="secondary">
					{meta}
				</Text>
				{problems.length > 0 ? (
					<Text variant="caption" tone="danger">
						{problems.join(" · ")}
					</Text>
				) : null}
				{task.reason ? (
					<Text variant="caption" tone="danger" numberOfLines={3} selectable>
						{task.reason}
					</Text>
				) : null}
			</View>
		</Pressable>
	);
}
