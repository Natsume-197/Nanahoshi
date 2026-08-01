import type { Task } from "@nanahoshi-v2/api/modules/taskManager";
import {
	BracketsCurly,
	CheckCircle,
	CircleNotch,
	DotsThree,
	ListChecks,
	Trash,
	XCircle,
} from "@phosphor-icons/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { DataTable, DataTableColumnHeader } from "@/components/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Modal } from "@/components/ui/modal";
import { Skeleton } from "@/components/ui/skeleton";
import { authClient } from "@/lib/auth-client";
import { m } from "@/paraglide/messages";
import {
	formatDetailedDate,
	formatTime,
	getErrorMessage,
} from "@/utils/format";
import { client, orpc, queryClient } from "@/utils/orpc";

const statusConfig = {
	running: {
		label: m["settings.tasks.running"],
		icon: CircleNotch,
		variant: "info",
		iconClassName: "animate-spin",
	},
	completed: {
		label: m["settings.tasks.completed"],
		icon: CheckCircle,
		variant: "success",
		iconClassName: "",
	},
	cancelled: {
		label: m["settings.tasks.cancelled"],
		icon: XCircle,
		variant: "warning",
		iconClassName: "",
	},
	failed: {
		label: () => m["settings.tasks.failed_count"]({ count: 1 }),
		icon: XCircle,
		variant: "destructive",
		iconClassName: "",
	},
} as const;

function elapsedMs(task: Task, now: number): number | null {
	const end = task.status === "running" ? now : task.finishedAt;
	return end === null ? null : Math.max(0, end - task.createdAt);
}

function jobColumns({
	now,
	onCancel,
	onDelete,
	onViewPayload,
	isCancelling,
	isDeleting,
}: {
	now: number;
	onCancel: (taskId: string) => void;
	onDelete: (taskId: string) => void;
	onViewPayload: (task: Task, returnFocus: () => void) => void;
	isCancelling: boolean;
	isDeleting: boolean;
}): ColumnDef<Task, unknown>[] {
	return [
		{
			accessorKey: "label",
			header: ({ column }) => (
				<DataTableColumnHeader
					column={column}
					title={m["settings.tasks.event"]()}
				/>
			),
			cell: ({ row }) => {
				const task = row.original;
				const processed = task.completedJobs + task.failedJobs;
				const isPreparing = task.status === "running" && task.totalJobs === 0;

				return (
					<div className="flex min-w-52 flex-col gap-0.5">
						<span className="font-medium">{task.label}</span>
						<span className="text-muted-foreground text-xs tabular-nums">
							{isPreparing
								? m["settings.tasks.preparing"]()
								: `${processed}/${task.totalJobs}`}
							{task.failedJobs > 0 && (
								<span className="text-destructive">
									{" · "}
									{m["settings.tasks.failed_count"]({
										count: task.failedJobs,
									})}
								</span>
							)}
						</span>
					</div>
				);
			},
		},
		{
			accessorKey: "createdAt",
			header: ({ column }) => (
				<DataTableColumnHeader
					column={column}
					title={m["settings.tasks.start_date"]()}
				/>
			),
			cell: ({ row }) => (
				<time
					dateTime={new Date(row.original.createdAt).toISOString()}
					className="text-muted-foreground"
				>
					{formatDetailedDate(new Date(row.original.createdAt))}
				</time>
			),
		},
		{
			accessorKey: "status",
			header: ({ column }) => (
				<DataTableColumnHeader
					column={column}
					title={m["settings.tasks.status"]()}
				/>
			),
			cell: ({ row }) => {
				const config = statusConfig[row.original.status];
				const StatusIcon = config.icon;

				return (
					<Badge variant={config.variant}>
						<StatusIcon
							data-icon="inline-start"
							className={config.iconClassName}
						/>
						{config.label()}
					</Badge>
				);
			},
		},
		{
			id: "elapsed",
			accessorFn: (task) => elapsedMs(task, now) ?? -1,
			header: ({ column }) => (
				<DataTableColumnHeader
					column={column}
					title={m["settings.tasks.elapsed"]()}
				/>
			),
			cell: ({ row }) => {
				const elapsed = elapsedMs(row.original, now);
				return (
					<span className="text-muted-foreground tabular-nums">
						{elapsed === null ? "—" : formatTime(elapsed / 1000)}
					</span>
				);
			},
		},
		{
			id: "actions",
			enableSorting: false,
			cell: ({ row }) => (
				<JobActionsMenu
					task={row.original}
					onViewPayload={onViewPayload}
					onCancel={onCancel}
					onDelete={onDelete}
					isCancelling={isCancelling}
					isDeleting={isDeleting}
				/>
			),
		},
	];
}

function JobActionsMenu({
	task,
	onViewPayload,
	onCancel,
	onDelete,
	isCancelling,
	isDeleting,
}: {
	task: Task;
	onViewPayload: (task: Task, returnFocus: () => void) => void;
	onCancel: (taskId: string) => void;
	onDelete: (taskId: string) => void;
	isCancelling: boolean;
	isDeleting: boolean;
}) {
	const triggerRef = useRef<HTMLButtonElement>(null);

	return (
		<div className="flex justify-end">
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Button
						ref={triggerRef}
						variant="ghost"
						size="icon-sm"
						aria-label={m["settings.tasks.actions_for"]({
							event: task.label,
						})}
					>
						<DotsThree />
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end">
					<DropdownMenuGroup>
						<DropdownMenuItem
							onClick={() =>
								onViewPayload(task, () => triggerRef.current?.focus())
							}
						>
							<BracketsCurly />
							{m["settings.tasks.view_payload"]()}
						</DropdownMenuItem>
						{task.status === "running" ? (
							<DropdownMenuItem
								onClick={() => onCancel(task.id)}
								disabled={isCancelling}
							>
								<XCircle />
								{m["settings.tasks.cancel"]()}
							</DropdownMenuItem>
						) : (
							<DropdownMenuItem
								variant="destructive"
								onClick={() => onDelete(task.id)}
								disabled={isDeleting}
							>
								<Trash />
								{m["settings.tasks.delete_task"]()}
							</DropdownMenuItem>
						)}
					</DropdownMenuGroup>
				</DropdownMenuContent>
			</DropdownMenu>
		</div>
	);
}

export function AdminTasks() {
	// Tasks are server-scoped, so this needs an active server (orgProcedure).
	const { data: activeOrg } = authClient.useActiveOrganization();
	const { data: tasks, isLoading } = useQuery({
		...orpc.tasks.getAllTasks.queryOptions(),
		enabled: !!activeOrg,
	});
	// Start deterministically for SSR; the effect begins the live clock on mount.
	const [now, setNow] = useState(0);
	const [payloadTask, setPayloadTask] = useState<Task | null>(null);
	const [payloadOpen, setPayloadOpen] = useState(false);
	const payloadReturnFocusRef = useRef<(() => void) | null>(null);
	const payloadQuery = useQuery({
		...orpc.tasks.getPayload.queryOptions({
			input: { taskId: payloadTask?.id ?? "" },
		}),
		enabled: payloadTask !== null,
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

	const finished = tasks?.filter((task) => task.status !== "running") ?? [];
	const hasRunningJobs =
		tasks?.some((task) => task.status === "running") ?? false;

	useEffect(() => {
		if (!hasRunningJobs) return;
		setNow(Date.now());
		const interval = window.setInterval(() => setNow(Date.now()), 1000);
		return () => window.clearInterval(interval);
	}, [hasRunningJobs]);

	const columns = jobColumns({
		now,
		onCancel: (taskId) => cancelMutation.mutate(taskId),
		onDelete: (taskId) => deleteMutation.mutate(taskId),
		onViewPayload: (task, returnFocus) => {
			payloadReturnFocusRef.current = returnFocus;
			setPayloadTask(task);
			setPayloadOpen(true);
		},
		isCancelling: cancelMutation.isPending,
		isDeleting: deleteMutation.isPending,
	});

	return (
		<div>
			<section className="flex flex-col gap-6">
				<h2 className="font-semibold text-foreground text-xl">
					{m["settings.tasks.all"]()}
				</h2>
				<DataTable
					columns={columns}
					data={tasks ?? []}
					isLoading={isLoading}
					emptyState={{
						icon: <ListChecks className="size-5 text-muted-foreground" />,
						title: m["settings.tasks.none"](),
						description: m["settings.tasks.none_desc"](),
					}}
					toolbar={
						finished.length > 0 ? (
							<Button
								variant="outline"
								size="sm"
								onClick={() => clearFinishedMutation.mutate()}
								disabled={clearFinishedMutation.isPending}
							>
								<Trash data-icon="inline-start" />
								{m["settings.tasks.clear_finished"]()}
							</Button>
						) : undefined
					}
				/>
			</section>

			<Modal
				open={payloadOpen}
				onOpenChange={setPayloadOpen}
				onOpenChangeComplete={(open) => {
					if (!open) {
						setPayloadTask(null);
						payloadReturnFocusRef.current?.();
						payloadReturnFocusRef.current = null;
					}
				}}
				title={m["settings.tasks.payload_title"]({
					event: payloadTask?.label ?? "",
				})}
				description={m["settings.tasks.payload_description"]()}
				className="sm:max-w-2xl"
			>
				{payloadQuery.isLoading ? (
					<Skeleton className="h-48 w-full rounded-xl" />
				) : payloadQuery.isError ? (
					<p className="text-destructive text-sm">
						{m["settings.tasks.payload_load_failed"]()}
					</p>
				) : payloadQuery.data === null ? (
					<p className="text-muted-foreground text-sm">
						{m["settings.tasks.payload_empty"]()}
					</p>
				) : (
					<pre className="max-h-[60dvh] overflow-auto overscroll-contain rounded-xl bg-muted p-4 text-xs">
						<code className="whitespace-pre-wrap break-words">
							{JSON.stringify(payloadQuery.data, null, 2)}
						</code>
					</pre>
				)}
			</Modal>
		</div>
	);
}
