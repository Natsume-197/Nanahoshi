import type { NotificationData } from "@nanahoshi/api/routers/notifications/notification.model";
import {
	Bell,
	CaretLeft,
	CaretRight,
	Checks,
	CircleNotch,
	Trash,
} from "@phosphor-icons/react";
import { useInfiniteQuery, useMutation, useQuery } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { type ComponentProps, memo, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { Button } from "@/components/ui/button";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyTitle,
} from "@/components/ui/empty";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { selectVisibleActiveTasks } from "@/hooks/task-update-cache";
import { useActivityRailIsSheet } from "@/hooks/use-mobile";
import { useOverlayBackDismiss } from "@/hooks/use-overlay-back-dismiss";
import { useWindowEvent } from "@/hooks/use-window-event";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/utils";
import { m } from "@/paraglide/messages";
import { client, orpc, queryClient } from "@/utils/orpc";
import { getTaskJobProgress } from "@/utils/task-progress";
import {
	hasActionableAttention,
	NotificationItem,
	type NotificationRow,
} from "./notification-item";

const PAGE_SIZE = 20;

const unreadCountKey = orpc.notifications.unreadCount.queryOptions().queryKey;
const listKey = orpc.notifications.list.key();

interface NotificationBellProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}

/** Notifications unread badge and controlled trigger in the top bar. */
export function NotificationBell({
	open,
	onOpenChange,
}: NotificationBellProps) {
	const { data: unread } = useQuery(
		orpc.notifications.unreadCount.queryOptions(),
	);
	const count = unread?.count ?? 0;

	return (
		<NotificationTrigger
			count={count}
			aria-expanded={open}
			onClick={() => onOpenChange(!open)}
		/>
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
			data-notification-trigger="true"
			aria-label={accessibleLabel}
			title={m["notifications.title"]()}
			className={cn("relative rounded-full", className)}
		>
			<span className="relative inline-flex">
				<Bell />
				{count > 0 && (
					<span
						className="absolute -end-0.5 -top-0.5 size-2 rounded-full bg-primary ring-2 ring-background"
						aria-hidden="true"
					/>
				)}
			</span>
		</Button>
	);
}

interface NotificationRailProps {
	open: boolean;
	onClose: () => void;
}

/**
 * Below `lg`, notifications use the established full-screen mobile sheet.
 * From `lg` up, they open as a floating dropdown card anchored to the top bar
 * (title + unread pill, "Mark all as read", All/Unread tabs), not as a
 * full-height side rail: the workspace never reflows and remains interactive
 * behind the panel.
 */
export function NotificationRail({ open, onClose }: NotificationRailProps) {
	const isSheet = useActivityRailIsSheet();
	const panelRef = useRef<HTMLElement | null>(null);
	useOverlayBackDismiss(open && isSheet, onClose);

	useWindowEvent("keydown", (event) => {
		if (event.key !== "Escape" || !open || isSheet) return;
		if (document.querySelector('[role="dialog"], [role="alertdialog"]')) return;
		onClose();
	});

	// Dropdown behavior on desktop: a pointer press outside the card dismisses
	// it. Presses on the bell itself are ignored here — the bell's own click
	// toggles, and closing on pointerdown first would make that click reopen.
	useEffect(() => {
		if (!open || isSheet) return;
		const onPointerDown = (event: PointerEvent) => {
			const target = event.target as HTMLElement | null;
			if (target?.closest?.("[data-notification-trigger]")) return;
			if (
				panelRef.current &&
				!panelRef.current.contains(event.target as Node)
			) {
				onClose();
			}
		};
		document.addEventListener("pointerdown", onPointerDown);
		return () => document.removeEventListener("pointerdown", onPointerDown);
	}, [open, isSheet, onClose]);

	return (
		<>
			<aside
				ref={panelRef}
				aria-label={m["notifications.title"]()}
				aria-hidden={!open}
				inert={!open}
				// Anchored to the bell in the top bar — the rail renders inside a
				// relative wrapper around the trigger, so it drops just below the
				// header right-aligned with the bell, with a scale/fade transition
				// instead of a lateral slide.
				className={cn(
					"absolute top-[calc(100%+0.625rem)] right-0 z-50 hidden w-[24rem] max-w-[calc(100vw-2rem)] origin-top-right transition-all duration-150 ease-[var(--ease-smooth-out)] lg:block",
					open
						? "pointer-events-auto scale-100 opacity-100"
						: "pointer-events-none scale-[0.98] opacity-0",
				)}
			>
				<div className="theme-gradient-surface flex max-h-[min(70vh,34rem)] min-h-0 min-w-0 flex-col overflow-hidden rounded-2xl border border-sidebar-border bg-background text-foreground shadow-2xl">
					{!isSheet && (
						<NotificationPanel active={open} mode="rail" onNavigate={onClose} />
					)}
				</div>
			</aside>

			{isSheet && (
				<Sheet open={open} onOpenChange={(next) => !next && onClose()}>
					<SheetContent
						side="right"
						showCloseButton={false}
						overlayClassName="hidden"
						className="mobile-screen-sheet inset-0 bg-background p-0 shadow-none data-[side=right]:h-dvh data-[side=right]:w-dvw data-[side=right]:max-w-none data-[side=right]:border-0 data-[side=right]:sm:max-w-none"
					>
						<NotificationPanel
							active={open}
							mode="screen"
							onNavigate={onClose}
						/>
					</SheetContent>
				</Sheet>
			)}
		</>
	);
}

function NotificationPanel({
	active,
	mode,
	onNavigate,
}: {
	active: boolean;
	mode: "rail" | "screen";
	onNavigate: () => void;
}) {
	const router = useRouter();
	const [activeTaskPage, setActiveTaskPage] = useState(0);
	// Tasks are server-scoped (orgProcedure); the cache is kept live by the
	// already-mounted useTaskEvents, so progress animates with no extra plumbing.
	const { data: activeOrg } = authClient.useActiveOrganization();
	const { data: activeTasks } = useQuery({
		...orpc.tasks.getActiveTasks.queryOptions(),
		enabled: active && !!activeOrg,
		subscribed: active,
	});

	const { data, isLoading, hasNextPage, fetchNextPage, isFetchingNextPage } =
		useInfiniteQuery({
			...orpc.notifications.list.infiniteOptions({
				input: (pageParam: number | undefined) => ({
					limit: PAGE_SIZE,
					cursor: pageParam,
				}),
				getNextPageParam: (lastPage) =>
					lastPage.length === PAGE_SIZE ? lastPage.at(-1)?.id : undefined,
				initialPageParam: undefined as number | undefined,
			}),
			enabled: active,
			subscribed: active,
		});
	const notifications = data?.pages.flat() ?? [];
	const activeTaskProjection = selectVisibleActiveTasks(
		activeTasks ?? [],
		activeTaskPage,
	);

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
	const deleteAll = useMutation({
		mutationFn: () => client.notifications.deleteAll(),
		onSuccess: () => {
			queryClient.setQueryData(unreadCountKey, { count: 0 });
			queryClient.setQueryData(listKey, undefined);
		},
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
		const data = notification.payload as NotificationData;
		// No-change tasks never surface attention (see hasActionableAttention),
		// so tapping them only marks as read instead of deep-linking.
		if (hasActionableAttention(data) && data.attention) {
			// Deep-link to the match manager's "needs attention" tray for this
			// library — unmatched, review and failures all live there.
			void navigateToAttention(data.attention.libraryUuid);
		}
	};

	const handleDelete = (notification: NotificationRow) => {
		deleteNotification.mutate(notification.id);
	};

	const hasUnread = notifications.some((n) => n.readAt === null);
	const hasNotifications = notifications.length > 0;
	const unreadCount = notifications.filter((n) => n.readAt === null).length;
	const [filter, setFilter] = useState<"all" | "unread">("all");
	const visibleNotifications =
		filter === "unread"
			? notifications.filter((n) => n.readAt === null)
			: notifications;

	return (
		<div className="flex h-full min-h-0 flex-col">
			{mode === "screen" ? (
				<SheetHeader className="grid shrink-0 grid-cols-[2.75rem_minmax(0,1fr)_2.75rem] items-center gap-2 border-sidebar-border border-b ps-[max(0.75rem,var(--safe-area-left))] pe-[max(0.75rem,var(--safe-area-right))] pt-[calc(var(--safe-area-top)+0.5rem)] pb-2 text-center">
					<Button
						type="button"
						variant="ghost"
						size="icon-lg"
						aria-label={m["aria.go_back"]()}
						title={m["aria.go_back"]()}
						onClick={onNavigate}
						className="size-11 rounded-full"
					>
						<CaretLeft />
					</Button>
					<div className="min-w-0">
						<SheetTitle className="truncate font-semibold text-lg">
							{m["notifications.title"]()}
						</SheetTitle>
						<SheetDescription className="sr-only">
							{m["notifications.description"]()}
						</SheetDescription>
					</div>
					<div className="flex items-center justify-end">
						{hasNotifications && (
							<Button
								type="button"
								variant="ghost"
								size="icon-lg"
								onClick={() => deleteAll.mutate()}
								disabled={deleteAll.isPending}
								aria-label={m["notifications.delete_all"]()}
								title={m["notifications.delete_all"]()}
								className="size-11 rounded-full"
							>
								{deleteAll.isPending ? (
									<CircleNotch className="animate-spin" />
								) : (
									<Trash />
								)}
							</Button>
						)}
						{hasUnread && (
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
									<CircleNotch className="animate-spin" />
								) : (
									<Checks />
								)}
							</Button>
						)}
					</div>
				</SheetHeader>
			) : (
				<div className="flex shrink-0 flex-col px-5 pt-5">
					<div className="flex items-center justify-between gap-2">
						<h2 className="flex min-w-0 items-center gap-2 font-semibold text-[1.05rem] tracking-tight">
							<span className="truncate">{m["notifications.title"]()}</span>
							{unreadCount > 0 && (
								<span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-muted-foreground text-xs tabular-nums">
									<span aria-hidden="true">
										{unreadCount > 99 ? "99+" : unreadCount}
									</span>
									<span className="sr-only">
										{m["notifications.unread_count"]({
											count: unreadCount,
										})}
									</span>
								</span>
							)}
						</h2>
						<div className="flex shrink-0 items-center gap-0.5">
							{hasUnread && (
								<Button
									type="button"
									variant="ghost"
									size="sm"
									onClick={() => markAllRead.mutate()}
									disabled={markAllRead.isPending}
									className="h-auto rounded-full px-2.5 py-1.5 font-normal text-[0.8125rem] text-muted-foreground hover:text-foreground"
								>
									{m["notifications.mark_all_read"]()}
								</Button>
							)}
							{hasNotifications && (
								<Button
									type="button"
									variant="ghost"
									size="icon-sm"
									onClick={() => deleteAll.mutate()}
									disabled={deleteAll.isPending}
									aria-label={m["notifications.delete_all"]()}
									title={m["notifications.delete_all"]()}
									className="rounded-full text-muted-foreground hover:text-foreground"
								>
									{deleteAll.isPending ? (
										<CircleNotch className="animate-spin" />
									) : (
										<Trash />
									)}
								</Button>
							)}
						</div>
					</div>
					<div
						role="tablist"
						aria-label={m["notifications.title"]()}
						className="mt-2 flex items-center gap-5 border-sidebar-border border-b text-sm"
					>
						{(["all", "unread"] as const).map((tab) => {
							const selected = filter === tab;
							return (
								<button
									key={tab}
									type="button"
									role="tab"
									aria-selected={selected}
									onClick={() => setFilter(tab)}
									className={cn(
										"relative px-0.5 pt-1 pb-2.5 transition-colors",
										selected
											? "font-medium text-foreground"
											: "text-muted-foreground hover:text-foreground",
									)}
								>
									{tab === "all"
										? m["search.all"]()
										: m["notifications.unread"]()}
									<span
										aria-hidden="true"
										className={cn(
											"absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-foreground transition-opacity",
											selected ? "opacity-100" : "opacity-0",
										)}
									/>
								</button>
							);
						})}
					</div>
				</div>
			)}

			<div
				className={cn(
					"flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain",
					mode === "screen"
						? "ps-[max(0.75rem,var(--safe-area-left))] pe-[max(0.75rem,var(--safe-area-right))] pt-3 pb-[max(0.75rem,var(--safe-area-bottom))]"
						: "px-3 pt-3 pb-3",
				)}
			>
				{activeTasks && activeTasks.length > 0 && (
					<section
						className="mb-3 rounded-2xl bg-muted/30 p-2"
						aria-labelledby="notification-active-tasks"
					>
						<h3
							id="notification-active-tasks"
							className="px-2 py-1.5 font-medium text-muted-foreground text-xs"
						>
							{m["notifications.in_progress"]()}
						</h3>
						<div className="flex flex-col gap-1">
							{activeTaskProjection.visible.map((task) => (
								<TaskProgressRow key={task.id} task={task} />
							))}
						</div>
						{activeTaskProjection.pageCount > 1 && (
							<div className="flex items-center justify-between gap-2 px-2 pt-2">
								<p className="text-muted-foreground text-xs tabular-nums">
									{m["notifications.active_tasks_range"]({
										from: activeTaskProjection.from,
										to: activeTaskProjection.to,
										total: activeTaskProjection.total,
									})}
								</p>
								<nav
									aria-label={m["notifications.active_tasks_pagination"]()}
									className="flex items-center gap-1"
								>
									<Button
										type="button"
										variant="ghost"
										size="icon-sm"
										onClick={() =>
											setActiveTaskPage(activeTaskProjection.currentPage - 1)
										}
										disabled={activeTaskProjection.currentPage === 0}
										aria-label={m["notifications.previous_page"]()}
									>
										<CaretLeft />
									</Button>
									<Button
										type="button"
										variant="ghost"
										size="icon-sm"
										onClick={() =>
											setActiveTaskPage(activeTaskProjection.currentPage + 1)
										}
										disabled={
											activeTaskProjection.currentPage ===
											activeTaskProjection.pageCount - 1
										}
										aria-label={m["notifications.next_page"]()}
									>
										<CaretRight />
									</Button>
								</nav>
							</div>
						)}
					</section>
				)}

				{isLoading ? (
					<NotificationsSkeleton />
				) : visibleNotifications.length === 0 ? (
					<Empty className="min-h-0 flex-1 p-8">
						<EmptyHeader>
							<EmptyTitle>{m["notifications.empty"]()}</EmptyTitle>
							<EmptyDescription>
								{m["notifications.empty_desc"]()}
							</EmptyDescription>
						</EmptyHeader>
					</Empty>
				) : (
					<section aria-label={m["notifications.title"]()}>
						<ul className="flex flex-col gap-1">
							{visibleNotifications.map((notification) => (
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
									<CircleNotch
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

const TaskProgressRow = memo(function TaskProgressRow({
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
				<CircleNotch
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
});

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
