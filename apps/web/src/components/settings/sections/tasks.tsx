import {
	CheckCircle,
	CircleNotch,
	Clock,
	ListChecks,
	Trash,
	XCircle,
} from "@phosphor-icons/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { SettingRows } from "@/components/settings/setting-rows";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { authClient } from "@/lib/auth-client";
import { m } from "@/paraglide/messages";
import { formatDetailedDate, getErrorMessage } from "@/utils/format";
import { client, orpc, queryClient } from "@/utils/orpc";

const statusConfig = {
	running: {
		label: m["settings.tasks.running"],
		icon: CircleNotch,
		className: "bg-info/10 text-info",
		iconClassName: "animate-spin",
	},
	completed: {
		label: m["settings.tasks.completed"],
		icon: CheckCircle,
		className: "bg-success/10 text-success",
		iconClassName: "",
	},
	cancelled: {
		label: m["settings.tasks.cancelled"],
		icon: XCircle,
		className: "bg-warning/10 text-warning",
		iconClassName: "",
	},
} as const;

export function AdminTasks() {
	// Tasks are server-scoped, so this needs an active server (orgProcedure).
	const { data: activeOrg } = authClient.useActiveOrganization();
	const { data: tasks, isLoading } = useQuery({
		...orpc.tasks.getAllTasks.queryOptions(),
		enabled: !!activeOrg,
	});

	const invalidateTasks = () =>
		queryClient.invalidateQueries({
			queryKey: orpc.tasks.getAllTasks.queryOptions().queryKey,
		});

	const cancelMutation = useMutation({
		mutationFn: (taskId: string) => client.tasks.cancelTask({ taskId }),
		onSuccess: invalidateTasks,
		onError: (error) =>
			toast.error(getErrorMessage(error, m["toast.task_cancel_failed"]())),
	});

	const deleteMutation = useMutation({
		mutationFn: (taskId: string) => client.tasks.deleteTask({ taskId }),
		onSuccess: invalidateTasks,
		onError: (error) =>
			toast.error(getErrorMessage(error, m["toast.task_delete_failed"]())),
	});

	const clearFinishedMutation = useMutation({
		mutationFn: () => client.tasks.clearFinished(),
		onSuccess: invalidateTasks,
		onError: (error) =>
			toast.error(getErrorMessage(error, m["toast.tasks_clear_failed"]())),
	});

	const running = tasks?.filter((t) => t.status === "running") ?? [];
	const finished = tasks?.filter((t) => t.status !== "running") ?? [];

	return (
		<div className="flex flex-col gap-12">
			<section className="flex flex-col gap-6">
				<div className="flex flex-col gap-1">
					<h2 className="font-semibold text-foreground text-xl">
						{m["settings.nav.tasks"]()}
					</h2>
					<p className="text-muted-foreground text-sm">
						{m["settings.tasks.desc"]()}
					</p>
				</div>
				<SettingRows>
					{[
						{
							label: m["settings.tasks.running"](),
							count: running.length,
							icon: CircleNotch,
							iconClass: running.length > 0 ? "animate-spin" : "",
						},
						{
							label: m["settings.tasks.completed"](),
							count: finished.filter((t) => t.status === "completed").length,
							icon: CheckCircle,
							iconClass: "",
						},
						{
							label: m["settings.tasks.cancelled"](),
							count: finished.filter((t) => t.status === "cancelled").length,
							icon: XCircle,
							iconClass: "",
						},
					].map(({ label, count, icon: Icon, iconClass }) => (
						<div
							key={label}
							className="flex items-center gap-3 py-3 first:pt-0 last:pb-0"
						>
							<Icon className={`size-4 text-muted-foreground ${iconClass}`} />
							<span className="min-w-0 flex-1 text-foreground text-sm">
								{label}
							</span>
							{isLoading ? (
								<Skeleton className="h-5 w-10" />
							) : (
								<span className="font-medium text-foreground text-sm tabular-nums">
									{count}
								</span>
							)}
						</div>
					))}
				</SettingRows>
			</section>

			<section className="flex flex-col gap-6">
				<div className="flex items-center justify-between gap-4">
					<h2 className="font-semibold text-foreground text-xl">
						{m["settings.tasks.all"]()}
					</h2>
					{finished.length > 0 && (
						<Button
							variant="outline"
							size="sm"
							onClick={() => clearFinishedMutation.mutate()}
							disabled={clearFinishedMutation.isPending}
						>
							<Trash className="mr-1.5 size-3.5" />
							{m["settings.tasks.clear_finished"]()}
						</Button>
					)}
				</div>
				{isLoading ? (
					<div className="space-y-3">
						<Skeleton className="h-16 w-full rounded" />
						<Skeleton className="h-16 w-full rounded" />
						<Skeleton className="h-16 w-full rounded" />
					</div>
				) : !tasks || tasks.length === 0 ? (
					<div className="flex flex-col items-center gap-3 py-12 text-center">
						<div className="flex size-12 items-center justify-center rounded-xl border border-border border-dashed">
							<ListChecks className="size-5 text-muted-foreground" />
						</div>
						<div>
							<p className="font-medium text-sm">
								{m["settings.tasks.none"]()}
							</p>
							<p className="text-muted-foreground text-xs">
								{m["settings.tasks.none_desc"]()}
							</p>
						</div>
					</div>
				) : (
					<SettingRows>
						{tasks.map((task) => {
							const config = statusConfig[task.status];
							const StatusIcon = config.icon;
							const percent =
								task.totalJobs > 0
									? Math.round(
											((task.completedJobs + task.failedJobs) /
												task.totalJobs) *
												100,
										)
									: 0;
							const isPreparing =
								task.status === "running" && task.totalJobs === 0;

							return (
								<div
									key={task.id}
									className="flex items-center gap-4 py-4 first:pt-0 last:pb-0"
								>
									{/* Status icon */}
									<div
										className={`flex size-8 shrink-0 items-center justify-center rounded-lg ${config.className}`}
									>
										<StatusIcon className={`size-4 ${config.iconClassName}`} />
									</div>

									{/* Info */}
									<div className="min-w-0 flex-1">
										<div className="flex items-center gap-2">
											<p className="truncate font-medium text-sm">
												{task.label}
											</p>
											<span
												className={`inline-flex items-center rounded-full px-2 py-0.5 font-medium text-xs ${config.className}`}
											>
												{config.label()}
											</span>
										</div>

										{isPreparing ? (
											<p className="mt-1 text-muted-foreground text-xs">
												{m["settings.tasks.preparing"]()}
											</p>
										) : (
											<div className="mt-1.5 flex items-center gap-3">
												<div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
													<div
														className={`h-full rounded-full transition-all duration-300 ${
															task.status === "cancelled"
																? "bg-warning"
																: task.status === "completed"
																	? "bg-success"
																	: "bg-primary"
														}`}
														style={{ width: `${percent}%` }}
													/>
												</div>
												<span className="shrink-0 text-muted-foreground text-xs tabular-nums">
													{task.completedJobs + task.failedJobs}/
													{task.totalJobs}
													{task.failedJobs > 0 && (
														<span className="text-destructive">
															{" "}
															(
															{m["settings.tasks.failed_count"]({
																count: task.failedJobs,
															})}
															)
														</span>
													)}
												</span>
											</div>
										)}

										<p className="mt-1 text-muted-foreground text-xs">
											<Clock className="mr-1 inline size-3" />
											{formatDetailedDate(new Date(task.createdAt))}
										</p>
									</div>

									{/* Actions */}
									<div className="flex shrink-0 gap-2">
										{task.status === "running" ? (
											<Button
												variant="outline"
												size="sm"
												onClick={() => cancelMutation.mutate(task.id)}
												disabled={cancelMutation.isPending}
											>
												{m["settings.tasks.cancel"]()}
											</Button>
										) : (
											<Button
												variant="ghost"
												size="sm"
												onClick={() => deleteMutation.mutate(task.id)}
												disabled={deleteMutation.isPending}
												className="text-muted-foreground hover:text-destructive"
												aria-label={m["settings.tasks.delete_task"]()}
											>
												<Trash className="size-3.5" />
											</Button>
										)}
									</div>
								</div>
							);
						})}
					</SettingRows>
				)}
			</section>
		</div>
	);
}
