import type { NotificationData } from "@nanahoshi-v2/api/routers/notifications/notification.model";
import { useInfiniteQuery, useMutation, useQuery } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import {
	BellIcon,
	CheckCheckIcon,
	ChevronLeftIcon,
	InboxIcon,
	LoaderCircleIcon,
} from "lucide-react";
import { type ComponentProps, useState } from "react";
import { flushSync } from "react-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@/components/ui/empty";
import {
	Popover,
	PopoverContent,
	PopoverDescription,
	PopoverHeader,
	PopoverTitle,
	PopoverTrigger,
} from "@/components/ui/popover";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
	SheetTrigger,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/utils";
import { m } from "@/paraglide/messages";
import { client, orpc, queryClient } from "@/utils/orpc";
import { getTaskJobProgress } from "@/utils/task-progress";
import { NotificationItem, type NotificationRow } from "./notification-item";

const PAGE_SIZE = 20;

const unreadCountKey = orpc.notifications.unreadCount.queryOptions().queryKey;
const listKey = orpc.notifications.list.key();

/** Notifications: unread badge in the top bar, panel on click. */
export function NotificationBell() {
	const { data: unread } = useQuery(
		orpc.notifications.unreadCount.queryOptions(),
	);
	const count = unread?.count ?? 0;

	return (
		<>
			<div className="md:hidden">
				<MobileNotificationBell count={count} />
			</div>
			<div className="hidden md:block">
				<DesktopNotificationBell count={count} />
			</div>
		</>
	);
}

function NotificationTrigger({
	count,
	className,
	...props
}: { count: number } & ComponentProps<typeof Button>) {
	const accessibleLabel =
		count > 0
			? m["notifications.unread_count"]({ count })
			: m["notifications.title"]();

	return (
		<Button
			{...props}
			type="button"
			variant="ambient"
			size="icon-lg"
			aria-label={accessibleLabel}
			title={m["notifications.title"]()}
			className={cn("relative rounded-full", className)}
		>
			<BellIcon />
			{count > 0 && (
				<Badge
					className="absolute -end-1 -top-1 min-w-5 px-1 tabular-nums"
					aria-hidden="true"
				>
					{count > 99 ? "99+" : count}
				</Badge>
			)}
		</Button>
	);
}

function MobileNotificationBell({ count }: { count: number }) {
	const [open, setOpen] = useState(false);

	return (
		<Sheet open={open} onOpenChange={setOpen}>
			<SheetTrigger asChild>
				<NotificationTrigger count={count} />
			</SheetTrigger>
			<SheetContent
				side="right"
				showCloseButton={false}
				overlayClassName="hidden"
				className="mobile-notifications-sheet data-[side=right]:data-closed:slide-out-to-right-full data-[side=right]:data-open:slide-in-from-right-full inset-0 bg-background p-0 shadow-none duration-[var(--page-slide-dur)] ease-[var(--page-slide-ease)] data-[side=right]:h-dvh data-[side=right]:w-dvw data-[side=right]:max-w-none data-[side=right]:border-0 motion-reduce:animate-none data-[side=right]:sm:max-w-none"
			>
				<NotificationPanel mode="screen" onNavigate={() => setOpen(false)} />
			</SheetContent>
		</Sheet>
	);
}

function DesktopNotificationBell({ count }: { count: number }) {
	const [open, setOpen] = useState(false);

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<NotificationTrigger count={count} />
			</PopoverTrigger>
			{/* Closed content is unmounted, so the panel queries only run while open */}
			<PopoverContent
				align="end"
				className="w-[26rem] max-w-[calc(100vw-1rem)] gap-0 p-0"
			>
				<NotificationPanel mode="popover" onNavigate={() => setOpen(false)} />
			</PopoverContent>
		</Popover>
	);
}

function NotificationPanel({
	mode,
	onNavigate,
}: {
	mode: "popover" | "screen";
	onNavigate: () => void;
}) {
	const router = useRouter();
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

	const navigateToAttention = async (libraryUuid: string) => {
		const navigate = () =>
			router.navigate({
				to: "/dashboard/metadata",
				search: { bucket: "attention", library: libraryUuid },
			});
		const prefersReducedMotion = window.matchMedia(
			"(prefers-reduced-motion: reduce)",
		).matches;
		const supportsViewTransitions = "startViewTransition" in document;

		if (mode !== "screen" || prefersReducedMotion || !supportsViewTransitions) {
			onNavigate();
			await navigate();
			return;
		}

		const transition = document.startViewTransition(async () => {
			document.documentElement.dataset.mobileNavigation = "forward";
			flushSync(onNavigate);
			await navigate();
		});

		const cleanUpTransition = () => {
			delete document.documentElement.dataset.mobileNavigation;
		};
		void transition.finished.then(cleanUpTransition, cleanUpTransition);
	};

	const handleSelect = (notification: NotificationRow) => {
		if (notification.readAt === null) markRead.mutate([notification.id]);
		const attention = (notification.payload as NotificationData).attention;
		if (attention) {
			// Deep-link to the match manager's "needs attention" tray for this
			// library — unmatched, review and failures all live there.
			void navigateToAttention(attention.libraryUuid);
		}
	};

	const handleDelete = (notification: NotificationRow) => {
		deleteNotification.mutate(notification.id);
	};

	const hasUnread = notifications.some((n) => n.readAt === null);

	return (
		<div
			className={cn(
				"flex flex-col",
				mode === "screen"
					? "h-full min-h-0"
					: "max-h-[min(36rem,calc(100vh-2rem))]",
			)}
		>
			{mode === "screen" ? (
				<SheetHeader className="grid shrink-0 grid-cols-[2.75rem_minmax(0,1fr)_2.75rem] items-center gap-2 border-b ps-[max(0.75rem,var(--safe-area-left))] pe-[max(0.75rem,var(--safe-area-right))] pt-[calc(var(--safe-area-top)+0.5rem)] pb-2 text-center">
					<Button
						type="button"
						variant="ghost"
						size="icon-lg"
						aria-label={m["aria.go_back"]()}
						title={m["aria.go_back"]()}
						onClick={onNavigate}
						className="size-11 rounded-full"
					>
						<ChevronLeftIcon />
					</Button>
					<div className="min-w-0">
						<SheetTitle className="truncate font-semibold text-lg">
							{m["notifications.title"]()}
						</SheetTitle>
						<SheetDescription className="sr-only">
							{m["notifications.description"]()}
						</SheetDescription>
					</div>
					{hasUnread ? (
						<Button
							type="button"
							variant="ghost"
							size="icon-lg"
							onClick={() => markAllRead.mutate()}
							disabled={markAllRead.isPending}
							aria-label={m["notifications.mark_all_read"]()}
							title={m["notifications.mark_all_read"]()}
							className="size-11 rounded-full"
						>
							{markAllRead.isPending ? (
								<LoaderCircleIcon className="animate-spin" />
							) : (
								<CheckCheckIcon />
							)}
						</Button>
					) : (
						<span aria-hidden="true" />
					)}
				</SheetHeader>
			) : (
				<PopoverHeader className="shrink-0 px-4 pt-4 pb-3">
					<div className="flex items-center justify-between gap-3">
						<PopoverTitle>{m["notifications.title"]()}</PopoverTitle>
						{hasUnread && (
							<Button
								type="button"
								variant="ghost"
								size="sm"
								onClick={() => markAllRead.mutate()}
								disabled={markAllRead.isPending}
							>
								{markAllRead.isPending ? (
									<LoaderCircleIcon
										data-icon="inline-start"
										className="animate-spin"
									/>
								) : (
									<CheckCheckIcon data-icon="inline-start" />
								)}
								{m["notifications.mark_all_read"]()}
							</Button>
						)}
					</div>
					<PopoverDescription>
						{m["notifications.description"]()}
					</PopoverDescription>
				</PopoverHeader>
			)}

			<div
				className={cn(
					"min-h-0 flex-1 overflow-y-auto overscroll-contain",
					mode === "screen"
						? "ps-[max(0.75rem,var(--safe-area-left))] pe-[max(0.75rem,var(--safe-area-right))] pt-3 pb-[max(0.75rem,var(--safe-area-bottom))]"
						: "px-2 pb-2",
				)}
			>
				{activeTasks && activeTasks.length > 0 && (
					<section
						className="mb-4 rounded-2xl bg-muted/50 p-2"
						aria-labelledby="notification-active-tasks"
					>
						<h3
							id="notification-active-tasks"
							className="px-2 py-1.5 font-medium text-muted-foreground text-xs"
						>
							{m["notifications.in_progress"]()}
						</h3>
						<div className="flex flex-col gap-1">
							{activeTasks.map((task) => (
								<TaskProgressRow key={task.id} task={task} />
							))}
						</div>
					</section>
				)}

				{isLoading ? (
					<NotificationsSkeleton />
				) : notifications.length === 0 ? (
					<Empty className="min-h-64 p-8">
						<EmptyHeader>
							<EmptyMedia variant="icon">
								<InboxIcon />
							</EmptyMedia>
							<EmptyTitle>{m["notifications.empty"]()}</EmptyTitle>
							<EmptyDescription>
								{m["notifications.empty_desc"]()}
							</EmptyDescription>
						</EmptyHeader>
					</Empty>
				) : (
					<section aria-labelledby="recent-notifications">
						<h3
							id="recent-notifications"
							className="px-3 pb-1.5 font-medium text-muted-foreground text-xs"
						>
							{m["notifications.recent"]()}
						</h3>
						<ul className="flex flex-col gap-1">
							{notifications.map((notification) => (
								<li key={notification.id}>
									<NotificationItem
										notification={notification}
										onSelect={handleSelect}
										onDelete={handleDelete}
										isDeleting={
											deleteNotification.isPending &&
											deleteNotification.variables === notification.id
										}
									/>
								</li>
							))}
						</ul>
						{hasNextPage && (
							<Button
								type="button"
								variant="ghost"
								size="sm"
								className="mt-2 w-full"
								onClick={() => fetchNextPage()}
								disabled={isFetchingNextPage}
							>
								{isFetchingNextPage ? (
									<LoaderCircleIcon
										data-icon="inline-start"
										className="animate-spin"
									/>
								) : (
									m["notifications.load_more"]()
								)}
							</Button>
						)}
					</section>
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
	const progress = getTaskJobProgress(task);

	return (
		<div className="flex items-center gap-3 rounded-xl bg-background/70 p-2.5">
			<span className="flex size-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground">
				<LoaderCircleIcon
					className="size-4 animate-spin motion-reduce:animate-none"
					aria-hidden="true"
				/>
			</span>
			<div className="min-w-0 flex-1">
				<div className="flex items-baseline justify-between gap-2">
					<p className="truncate text-sm leading-tight">{task.label}</p>
					<span className="shrink-0 text-muted-foreground text-xs tabular-nums">
						{progress.total > 0
							? `${progress.percent}%`
							: m["settings.tasks.preparing"]()}
					</span>
				</div>
				<div
					className="mt-2 h-1 overflow-hidden rounded-full bg-muted"
					role="progressbar"
					aria-label={task.label}
					aria-valuemin={0}
					aria-valuemax={100}
					aria-valuenow={progress.percent}
				>
					<div
						className="h-full rounded-full bg-primary transition-[width] duration-300 motion-reduce:transition-none"
						style={{ width: `${progress.percent}%` }}
					/>
				</div>
			</div>
		</div>
	);
}

function NotificationsSkeleton() {
	return (
		<div className="flex flex-col gap-3 px-2 py-2" aria-hidden="true">
			{[0, 1, 2, 3].map((i) => (
				<div key={i} className="flex items-center gap-2.5">
					<Skeleton className="size-10 rounded-xl" />
					<div className="flex flex-1 flex-col gap-1.5">
						<Skeleton className="h-3 w-40" />
						<Skeleton className="h-2.5 w-24" />
					</div>
				</div>
			))}
		</div>
	);
}
