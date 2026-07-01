import { useMutation, useQuery } from "@tanstack/react-query";
import {
	CheckCircle2,
	Clock,
	ListTodo,
	Loader2,
	Trash2,
	XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { authClient } from "@/lib/auth-client";
import { m } from "@/paraglide/messages";
import { formatDetailedDate, getErrorMessage } from "@/utils/format";
import { client, orpc, queryClient } from "@/utils/orpc";

const statusConfig = {
	running: {
		label: m["settings.tasks.running"],
		icon: Loader2,
		className: "text-blue-600 bg-blue-500/10",
		iconClassName: "animate-spin",
	},
	completed: {
		label: m["settings.tasks.completed"],
		icon: CheckCircle2,
		className: "text-emerald-600 bg-emerald-500/10",
		iconClassName: "",
	},
	cancelled: {
		label: m["settings.tasks.cancelled"],
		icon: XCircle,
		className: "text-amber-600 bg-amber-500/10",
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
		<div className="space-y-8">
			<div>
				<p className="text-muted-foreground text-sm">
					{m["settings.tasks.desc"]()}
				</p>
			</div>

			<div className="grid gap-4 sm:grid-cols-3">
				{[
					{
						label: m["settings.tasks.running"](),
						count: running.length,
						icon: Loader2,
						iconClass: running.length > 0 ? "animate-spin" : "",
					},
					{
						label: m["settings.tasks.completed"](),
						count: finished.filter((t) => t.status === "completed").length,
						icon: CheckCircle2,
						iconClass: "",
					},
					{
						label: m["settings.tasks.cancelled"](),
						count: finished.filter((t) => t.status === "cancelled").length,
						icon: XCircle,
						iconClass: "",
					},
				].map(({ label, count, icon: Icon, iconClass }) => (
					<Card key={label}>
						<CardHeader className="flex flex-row items-center justify-between border-b">
							<CardTitle className="font-medium text-sm">{label}</CardTitle>
							<Icon className={`size-4 text-muted-foreground ${iconClass}`} />
						</CardHeader>
						<CardContent>
							{isLoading ? (
								<Skeleton className="h-8 w-16 rounded" />
							) : (
								<p className="font-bold text-2xl">{count}</p>
							)}
						</CardContent>
					</Card>
				))}
			</div>

			<Card>
				<CardHeader className="flex flex-row items-center justify-between border-b">
					<CardTitle>{m["settings.tasks.all"]()}</CardTitle>
					{finished.length > 0 && (
						<Button
							variant="outline"
							size="sm"
							onClick={() => clearFinishedMutation.mutate()}
							disabled={clearFinishedMutation.isPending}
						>
							<Trash2 className="mr-1.5 size-3.5" />
							{m["settings.tasks.clear_finished"]()}
						</Button>
					)}
				</CardHeader>
				<CardContent className="p-0">
					{isLoading ? (
						<div className="space-y-3 p-6">
							<Skeleton className="h-16 w-full rounded" />
							<Skeleton className="h-16 w-full rounded" />
							<Skeleton className="h-16 w-full rounded" />
						</div>
					) : !tasks || tasks.length === 0 ? (
						<div className="flex flex-col items-center gap-3 py-12 text-center">
							<div className="flex size-12 items-center justify-center rounded-xl border border-border border-dashed">
								<ListTodo className="size-5 text-muted-foreground" />
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
						<div className="divide-y divide-border">
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
										className="flex items-center gap-4 px-6 py-4"
									>
										{/* Status icon */}
										<div
											className={`flex size-8 shrink-0 items-center justify-center rounded-lg ${config.className}`}
										>
											<StatusIcon
												className={`size-4 ${config.iconClassName}`}
											/>
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
																	? "bg-amber-500"
																	: task.status === "completed"
																		? "bg-emerald-500"
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
													<Trash2 className="size-3.5" />
												</Button>
											)}
										</div>
									</div>
								);
							})}
						</div>
					)}
				</CardContent>
			</Card>
		</div>
	);
}
