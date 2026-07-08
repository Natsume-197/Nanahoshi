import { useInfiniteQuery, useMutation, useQuery } from "@tanstack/react-query";
import { Bell, CircleNotch } from "@phosphor-icons/react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { authClient } from "@/lib/auth-client";
import { m } from "@/paraglide/messages";
import { client, orpc, queryClient } from "@/utils/orpc";
import { NotificationItem, type NotificationRow } from "./notification-item";

const PAGE_SIZE = 20;

const unreadCountKey = orpc.notifications.unreadCount.queryOptions().queryKey;
const listKey = orpc.notifications.list.key();

export function NotificationBell() {
	const [open, setOpen] = useState(false);
	const { data: unread } = useQuery(
		orpc.notifications.unreadCount.queryOptions(),
	);
	const count = unread?.count ?? 0;

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<Button
					type="button"
					variant="ghost"
					size="icon-lg"
					aria-label={m["aria.notifications"]()}
					title={m["aria.notifications"]()}
					className="relative rounded-full text-muted-foreground [&_svg]:size-[18px]"
				>
					<Bell />
					{count > 0 && (
						<span className="absolute top-1 right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 font-medium text-[10px] text-primary-foreground tabular-nums">
							{count > 99 ? "99+" : count}
						</span>
					)}
				</Button>
			</PopoverTrigger>
			{/* Radix unmounts closed content, so the panel queries only run while open */}
			<PopoverContent
				align="end"
				className="w-96 max-w-[calc(100vw-1rem)] gap-0 p-0"
			>
				<NotificationPanel onNavigate={() => setOpen(false)} />
			</PopoverContent>
		</Popover>
	);
}

function NotificationPanel({ onNavigate }: { onNavigate: () => void }) {
	// Tasks are server-scoped (orgProcedure); the cache is kept live by the
	// already-mounted useTaskEvents, so progress animates with no extra plumbing.
	const { data: activeOrg } = authClient.useActiveOrganization();
	const { data: activeTasks } = useQuery({
		...orpc.tasks.getActiveTasks.queryOptions(),
		enabled: !!activeOrg,
	});

	const { data, isLoading, hasNextPage, fetchNextPage, isFetchingNextPage } =
		useInfiniteQuery(
			orpc.notifications.list.infiniteOptions({
				input: (pageParam: number | undefined) => ({
					limit: PAGE_SIZE,
					cursor: pageParam,
				}),
				getNextPageParam: (lastPage) =>
					lastPage.length === PAGE_SIZE ? lastPage.at(-1)?.id : undefined,
				initialPageParam: undefined as number | undefined,
			}),
		);
	const notifications = data?.pages.flat() ?? [];

	const invalidateAll = () => {
		queryClient.invalidateQueries({ queryKey: unreadCountKey });
		queryClient.invalidateQueries({ queryKey: listKey });
	};

	const markAllRead = useMutation({
		mutationFn: () => client.notifications.markAllRead(),
		onSuccess: () => {
			queryClient.setQueryData(unreadCountKey, { count: 0 });
			queryClient.invalidateQueries({ queryKey: listKey });
		},
	});

	const markRead = useMutation({
		mutationFn: (ids: number[]) => client.notifications.markRead({ ids }),
		onSuccess: invalidateAll,
	});

	// Deleting an unread notification must also refresh the badge count.
	const deleteNotification = useMutation({
		mutationFn: (id: number) => client.notifications.delete({ id }),
		onSuccess: invalidateAll,
	});

	const handleSelect = (notification: NotificationRow) => {
		if (notification.readAt === null) markRead.mutate([notification.id]);
		onNavigate();
	};

	const handleDelete = (notification: NotificationRow) => {
		deleteNotification.mutate(notification.id);
	};

	const hasUnread = notifications.some((n) => n.readAt === null);

	return (
		<div className="flex max-h-[70vh] flex-col">
			<div className="flex h-12 shrink-0 items-center justify-between border-border/40 border-b pr-2 pl-4">
				<p className="font-semibold text-sm tracking-wide">
					{m["notifications.title"]()}
				</p>
				{hasUnread && (
					<Button
						type="button"
						variant="ghost"
						size="sm"
						className="h-7 rounded-full text-muted-foreground text-xs"
						onClick={() => markAllRead.mutate()}
						disabled={markAllRead.isPending}
					>
						{m["notifications.mark_all_read"]()}
					</Button>
				)}
			</div>

			{activeTasks && activeTasks.length > 0 && (
				<div className="shrink-0 border-border/40 border-b px-2 pb-2">
					<p className="px-2 py-2 font-medium text-muted-foreground text-xs uppercase tracking-wide">
						{m["notifications.in_progress"]()}
					</p>
					<div className="flex flex-col gap-0.5">
						{activeTasks.map((task) => (
							<TaskProgressRow key={task.id} task={task} />
						))}
					</div>
				</div>
			)}

			<div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
				{isLoading ? (
					<NotificationsSkeleton />
				) : notifications.length === 0 ? (
					<div className="px-2 py-8 text-center">
						<p className="font-medium text-sm">{m["notifications.empty"]()}</p>
						<p className="mt-1 text-muted-foreground text-sm">
							{m["notifications.empty_desc"]()}
						</p>
					</div>
				) : (
					<div className="flex flex-col gap-0.5">
						{notifications.map((notification) => (
							<NotificationItem
								key={notification.id}
								notification={notification}
								onSelect={handleSelect}
								onDelete={handleDelete}
							/>
						))}
						{hasNextPage && (
							<Button
								type="button"
								variant="ghost"
								size="sm"
								className="mt-1 w-full rounded-lg text-muted-foreground text-xs"
								onClick={() => fetchNextPage()}
								disabled={isFetchingNextPage}
							>
								{isFetchingNextPage ? (
									<CircleNotch className="size-3.5 animate-spin" />
								) : (
									m["notifications.load_more"]()
								)}
							</Button>
						)}
					</div>
				)}
			</div>
		</div>
	);
}

function TaskProgressRow({
	task,
}: {
	task: NonNullable<
		Awaited<ReturnType<typeof client.tasks.getActiveTasks>>
	>[number];
}) {
	const percent =
		task.totalJobs > 0
			? Math.round(
					((task.completedJobs + task.failedJobs) / task.totalJobs) * 100,
				)
			: 0;

	return (
		<div className="flex items-center gap-2.5 rounded-lg px-2 py-1.5">
			<span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
				<CircleNotch className="size-4 animate-spin" />
			</span>
			<div className="min-w-0 flex-1">
				<div className="flex items-baseline justify-between gap-2">
					<p className="truncate text-sm leading-tight">{task.label}</p>
					<span className="shrink-0 text-muted-foreground text-xs tabular-nums">
						{task.totalJobs > 0
							? `${percent}%`
							: m["settings.tasks.preparing"]()}
					</span>
				</div>
				<div className="mt-1.5 h-1 overflow-hidden rounded-full bg-muted">
					<div
						className="h-full rounded-full bg-primary transition-[width] duration-300"
						style={{ width: `${percent}%` }}
					/>
				</div>
			</div>
		</div>
	);
}

function NotificationsSkeleton() {
	return (
		<div className="flex flex-col gap-3 px-2 pt-2 pb-1">
			{[0, 1, 2, 3].map((i) => (
				<div key={i} className="flex items-center gap-2.5">
					<Skeleton className="size-9 rounded-full" />
					<div className="flex flex-1 flex-col gap-1.5">
						<Skeleton className="h-3 w-40" />
						<Skeleton className="h-2.5 w-24" />
					</div>
				</div>
			))}
		</div>
	);
}
