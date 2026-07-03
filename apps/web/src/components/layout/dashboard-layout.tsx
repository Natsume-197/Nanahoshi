import {
	MANUAL_PRESENCE_STATUSES,
	type ManualPresenceStatus,
} from "@nanahoshi-v2/api/modules/presence/presence.types";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
	getRouteApi,
	Link,
	Outlet,
	useLocation,
	useNavigate,
	useRouter,
} from "@tanstack/react-router";
import {
	ArrowDownToLine,
	Bell,
	Loader2,
	Menu,
	Settings,
	User,
	Users,
} from "lucide-react";
import { lazy, Suspense, useRef, useState } from "react";
import { toast } from "sonner";
import { MiniPlayer } from "@/components/audio-player/mini-player";
import { DashboardSidebarNav } from "@/components/dashboard/dashboard-sidebar-nav";
import { MobileBottomNav } from "@/components/dashboard/mobile-bottom-nav";
import { OrgSwitcher } from "@/components/dashboard/org-switcher";
import { ActivityRail } from "@/components/layout/activity-rail";
import { ScrollContainerProvider } from "@/components/layout/scroll-container-context";
import { useSettingsModal } from "@/components/layout/settings-modal-context";
import { preloadSettingsModal } from "@/components/layout/settings-modal-host";
import type { SettingsSection } from "@/components/settings/settings-sections";
import { HeroBackdrop } from "@/components/shared/detail-page";
import { OfflineBanner } from "@/components/shared/offline-banner";
import { PRESENCE_DOT } from "@/components/shared/presence-dot";
import { UserAvatar } from "@/components/shared/user-avatar";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuSeparator,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
	Sidebar,
	SidebarFooter,
	SidebarHeader,
	SidebarInset,
	SidebarProvider,
	useSidebar,
} from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { useMountEffect } from "@/hooks/use-mount-effect";
import { useOnlineStatus } from "@/hooks/use-online-status";
import { usePresenceEvents } from "@/hooks/use-presence-events";
import { usePresenceIdle } from "@/hooks/use-presence-idle";
import { useTaskEvents } from "@/hooks/use-task-events";
import {
	setActivityRailOpen,
	toggleActivityRail,
	useActivityRailOpen,
} from "@/lib/activity-rail-store";
import { authClient } from "@/lib/auth-client";
import { useHeroBackdrop } from "@/lib/hero-backdrop-store";
import { reconcilePersistedServer } from "@/lib/switch-server";
import { useIsSwitchingServer } from "@/lib/switching-server-store";
import { cn } from "@/lib/utils";
import { m } from "@/paraglide/messages";
import { client, orpc, queryClient } from "@/utils/orpc";

const dashboardRoute = getRouteApi("/dashboard");

type ScrollRestorationLocation = {
	href: string;
	state: {
		__TSR_key?: string;
		key?: string;
		__TSR_index?: number;
	};
};

const getDashboardScrollKey = (location: ScrollRestorationLocation) =>
	location.state.__TSR_key ??
	location.state.key ??
	(typeof location.state.__TSR_index === "number"
		? `${location.state.__TSR_index}:${location.href}`
		: location.href);

const dashboardScrollPositions = new Map<string, number>();

// How far (px) the content scrolls before the hero backdrop has fully faded out,
// so the wash stays confined to the top and never bleeds behind scrolled content.
const HERO_BACKDROP_FADE_PX = 260;

const heroBackdropOpacity = (scrollTop: number) =>
	Math.max(0, 1 - scrollTop / HERO_BACKDROP_FADE_PX);

/**
 * Task-progress listener over the gateway WebSocket. Keyed by active server so it
 * re-subscribes on switch and re-scopes the task stream to the new server.
 */
function TaskEventsListener() {
	useTaskEvents();
	return null;
}

/**
 * Presence listener over the gateway WebSocket. Keyed by active server so it
 * re-subscribes on switch and re-scopes friend presence to the new server.
 */
function PresenceEventsListener() {
	usePresenceEvents();
	usePresenceIdle();
	return null;
}

const DashboardHeaderSearch = lazy(async () => {
	const module = await import("@/components/dashboard/dashboard-header-search");
	return { default: module.DashboardHeaderSearch };
});

function DashboardHeaderSearchShell() {
	return (
		<div className="relative mx-auto w-full max-w-md">
			<Skeleton className="h-9 rounded-full border border-border/50 bg-muted/40" />
		</div>
	);
}

function ServerSwitchOverlay() {
	return (
		<div className="absolute inset-x-0 top-14 bottom-0 z-40 flex items-center justify-center bg-background">
			<div className="flex flex-col items-center gap-3 text-muted-foreground">
				<Loader2 className="size-6 animate-spin" />
				<span className="text-sm">Switching server…</span>
			</div>
		</div>
	);
}

const STATUS_META: Record<
	ManualPresenceStatus,
	{ label: () => string; dot: string }
> = {
	online: { label: m["status.online"], dot: PRESENCE_DOT.online },
	away: { label: m["status.away"], dot: PRESENCE_DOT.away },
	invisible: { label: m["status.invisible"], dot: PRESENCE_DOT.offline },
};

function StatusDot({ status }: { status: ManualPresenceStatus }) {
	return (
		<span
			className={cn("size-2.5 shrink-0 rounded-full", STATUS_META[status].dot)}
		/>
	);
}

function SidebarProfileFooter({
	onOpenSettings,
}: {
	onOpenSettings: (section: SettingsSection) => void;
}) {
	const navigate = useNavigate();
	const online = useOnlineStatus();
	const { data: session, isPending } = authClient.useSession();
	const profileOptions = orpc.profile.getProfile.queryOptions();
	const { data: profile } = useQuery({
		...profileOptions,
		enabled: !!session,
	});
	const profileKey = profileOptions.queryKey;
	const status = profile?.presenceStatus ?? "online";
	const statusMutation = useMutation({
		mutationFn: (next: ManualPresenceStatus) =>
			client.follow.setStatus({ status: next }),
		onMutate: async (next) => {
			await queryClient.cancelQueries({ queryKey: profileKey });
			const previous = queryClient.getQueryData(profileKey);
			queryClient.setQueryData(profileKey, (old) =>
				old ? { ...old, presenceStatus: next } : old,
			);
			return { previous };
		},
		onError: (_err, _next, context) => {
			queryClient.setQueryData(profileKey, context?.previous);
			toast.error(m["toast.status_update_failed"]());
		},
	});

	if (isPending) {
		return (
			<SidebarFooter className="border-sidebar-border border-t p-2">
				<div className="flex h-14 items-center gap-3 rounded-lg px-2 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0">
					<Skeleton className="size-9 shrink-0 rounded-full" />
					<div className="min-w-0 flex-1 space-y-2 group-data-[collapsible=icon]:hidden">
						<Skeleton className="h-4 w-24" />
						<Skeleton className="h-3 w-14" />
					</div>
					<Skeleton className="size-8 shrink-0 rounded-md group-data-[collapsible=icon]:hidden" />
				</div>
			</SidebarFooter>
		);
	}

	if (!session) {
		return null;
	}

	const avatarImage =
		(profile?.image as string | null | undefined) ?? session.user.image;
	const statusMeta = STATUS_META[status];

	const handleGoToProfile = () => {
		const username = (session.user as { username?: string }).username;
		if (username) {
			navigate({ to: "/dashboard/user/$username", params: { username } });
		} else {
			navigate({ to: "/dashboard/profile" });
		}
	};

	const content = (
		<div
			className={cn(
				"relative flex h-14 w-full items-center rounded-lg px-2 text-sidebar-accent-foreground transition-[padding] duration-200",
				"group-data-[collapsible=icon]:px-0",
			)}
		>
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<button
						type="button"
						aria-label={m["aria.change_status"]()}
						className="flex w-full min-w-0 cursor-pointer items-center gap-3 overflow-hidden rounded-md py-1 pr-10 text-left outline-none transition-[width,height,padding] duration-200 hover:bg-sidebar-accent focus:outline-none focus-visible:ring-0 group-data-[collapsible=icon]:size-8! group-data-[collapsible=icon]:p-0!"
					>
						<span className="relative shrink-0">
							<UserAvatar
								name={session.user.name}
								image={avatarImage}
								className="size-9 transition-[width,height] duration-200 group-data-[collapsible=icon]:size-8"
								fallbackClassName="text-xs"
							/>
							<span
								className={cn(
									"absolute right-0 bottom-0 size-3 rounded-full ring-2 ring-sidebar",
									statusMeta.dot,
								)}
							/>
						</span>

						<div className="min-w-0 flex-1">
							<p className="truncate font-medium text-sm leading-5">
								{session.user.name}
							</p>
							<p className="truncate text-sidebar-foreground/65 text-xs leading-4">
								{statusMeta.label()}
							</p>
						</div>
					</button>
				</DropdownMenuTrigger>
				<DropdownMenuContent
					align="start"
					side="top"
					sideOffset={8}
					className="min-w-56 bg-card"
				>
					<DropdownMenuGroup>
						<DropdownMenuItem onClick={handleGoToProfile} disabled={!online}>
							<User />
							{m["nav.profile"]()}
						</DropdownMenuItem>
					</DropdownMenuGroup>
					<DropdownMenuSeparator />
					<DropdownMenuGroup>
						<DropdownMenuSub>
							<DropdownMenuSubTrigger>
								<StatusDot status={status} />
								{statusMeta.label()}
							</DropdownMenuSubTrigger>
							<DropdownMenuSubContent>
								<DropdownMenuRadioGroup
									value={status}
									onValueChange={(next) =>
										statusMutation.mutate(next as ManualPresenceStatus)
									}
								>
									{MANUAL_PRESENCE_STATUSES.map((nextStatus) => (
										<DropdownMenuRadioItem key={nextStatus} value={nextStatus}>
											<StatusDot status={nextStatus} />
											{STATUS_META[nextStatus].label()}
										</DropdownMenuRadioItem>
									))}
								</DropdownMenuRadioGroup>
							</DropdownMenuSubContent>
						</DropdownMenuSub>
					</DropdownMenuGroup>
				</DropdownMenuContent>
			</DropdownMenu>

			<Button
				type="button"
				variant="ghost"
				size="icon-sm"
				aria-label={m["nav.settings"]()}
				title={m["nav.settings"]()}
				onPointerEnter={preloadSettingsModal}
				onClick={() => onOpenSettings("profile")}
				className="absolute inset-y-0 right-2 my-auto size-8 rounded-md text-sidebar-foreground/70 transition-opacity duration-200 hover:bg-sidebar-accent hover:text-sidebar-foreground focus-visible:ring-0 group-data-[collapsible=icon]:pointer-events-none group-data-[collapsible=icon]:opacity-0 [&_svg]:size-[18px]"
			>
				<Settings />
			</Button>
		</div>
	);

	return (
		<SidebarFooter className="border-sidebar-border border-t p-2">
			{content}
		</SidebarFooter>
	);
}

function SidebarHeaderSection() {
	const { toggleSidebar } = useSidebar();

	return (
		<SidebarHeader className="h-14 flex-row items-center gap-3 border-sidebar-border px-2">
			<button
				type="button"
				onClick={toggleSidebar}
				aria-label={m["aria.toggle_sidebar"]()}
				className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-md text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
			>
				<Menu className="size-5" />
			</button>
			<Link
				to="/dashboard"
				className="flex items-center gap-3 group-data-[collapsible=icon]:hidden"
			>
				<span className="font-semibold text-[16px] tracking-wide">
					Nanahoshi
				</span>
			</Link>
		</SidebarHeader>
	);
}

export function DashboardLayout() {
	const location = useLocation();
	const router = useRouter();
	const { session } = dashboardRoute.useRouteContext();
	const { data: activeOrg } = authClient.useActiveOrganization();
	const heroBackdrop = useHeroBackdrop();
	const isSwitchingServer = useIsSwitchingServer();
	const activityRailOpen = useActivityRailOpen();
	const { openSettings } = useSettingsModal();
	const scrollContainerRef = useRef<HTMLElement | null>(null);
	const restoreFrameRef = useRef<number | null>(null);
	const heroBackdropRef = useRef<HTMLDivElement | null>(null);
	// True once the content has scrolled off the top. While a hero backdrop is
	// active and we're at the top, the header goes transparent so the wash reads
	// through it; on scroll it turns solid again to keep content readable.
	const [atTop, setAtTop] = useState(true);
	const immersiveHeader = Boolean(heroBackdrop) && atTop;

	// Drop any persisted cache that belongs to a different server (e.g. switched
	// on another device, then this tab reloaded). Same-server reloads keep theirs.
	useMountEffect(() => {
		reconcilePersistedServer(session?.session.activeOrganizationId ?? null);
	});

	// The dashboard scrolls inside <main>, not the window. Keep restoration
	// scoped to this one element so back/forward returns to the clicked card
	// without enabling the router's broader scroll tracking.
	useMountEffect(() => {
		const cancelPendingRestore = () => {
			if (restoreFrameRef.current == null) return;
			window.cancelAnimationFrame(restoreFrameRef.current);
			restoreFrameRef.current = null;
		};

		const restoreScroll = (top: number) => {
			cancelPendingRestore();
			const startedAt = performance.now();

			const apply = () => {
				const scrollEl = scrollContainerRef.current;
				if (!scrollEl) {
					restoreFrameRef.current = null;
					return;
				}

				const maxTop = Math.max(
					0,
					scrollEl.scrollHeight - scrollEl.clientHeight,
				);
				scrollEl.scrollTo({ top: Math.min(top, maxTop), behavior: "auto" });

				if (top > maxTop && performance.now() - startedAt < 700) {
					restoreFrameRef.current = window.requestAnimationFrame(apply);
					return;
				}

				restoreFrameRef.current = null;
			};

			restoreFrameRef.current = window.requestAnimationFrame(apply);
		};

		const unsubscribeBeforeNavigate = router.subscribe(
			"onBeforeNavigate",
			({ fromLocation, hrefChanged }) => {
				if (!hrefChanged || !fromLocation) return;
				const scrollEl = scrollContainerRef.current;
				if (!scrollEl) return;
				dashboardScrollPositions.set(
					getDashboardScrollKey(fromLocation),
					scrollEl.scrollTop,
				);
			},
		);

		const unsubscribeRendered = router.subscribe(
			"onRendered",
			({ toLocation, hrefChanged, hashChanged, pathChanged }) => {
				if (!hrefChanged || (hashChanged && !pathChanged)) return;
				const key = getDashboardScrollKey(toLocation);
				restoreScroll(dashboardScrollPositions.get(key) ?? 0);
			},
		);

		const currentKey = getDashboardScrollKey(router.latestLocation);
		if (dashboardScrollPositions.has(currentKey)) {
			restoreScroll(dashboardScrollPositions.get(currentKey) ?? 0);
		}

		return () => {
			unsubscribeBeforeNavigate();
			unsubscribeRendered();
			cancelPendingRestore();
		};
	});

	// Drive the immersive header (state, only on threshold cross) and fade the
	// hero backdrop out as the content scrolls (direct opacity write on one
	// element — compositor-cheap, no re-render). Keeps the wash confined to the top.
	useMountEffect(() => {
		const el = scrollContainerRef.current;
		if (!el) return;
		let wasAtTop = el.scrollTop <= 8;
		setAtTop(wasAtTop);
		const onScroll = () => {
			const top = el.scrollTop;
			if (heroBackdropRef.current) {
				heroBackdropRef.current.style.opacity = String(
					heroBackdropOpacity(top),
				);
			}
			const next = top <= 8;
			if (next !== wasAtTop) {
				wasAtTop = next;
				setAtTop(next);
			}
		};
		el.addEventListener("scroll", onScroll, { passive: true });
		return () => el.removeEventListener("scroll", onScroll);
	});

	return (
		<ScrollContainerProvider value={scrollContainerRef}>
			<TaskEventsListener key={activeOrg?.id ?? "none"} />
			<PresenceEventsListener key={`presence-${activeOrg?.id ?? "none"}`} />
			<div className="flex h-svh flex-col">
				<SidebarProvider className="min-h-0 flex-1 [transform:translateZ(0)]">
					<Sidebar collapsible="icon">
						<SidebarHeaderSection />

						<DashboardSidebarNav
							locationPathname={location.pathname}
							onNavigate={() => {}}
						/>

						<SidebarProfileFooter onOpenSettings={openSettings} />
					</Sidebar>

					<SidebarInset className="relative min-h-0">
						{/* One continuous artwork wash behind the header AND the hero, so the navbar
							    and hero read as a single surface. Fixed to the top of the content area;
							    fades into --background. null on non-detail routes. */}
						{heroBackdrop && (
							<div
								ref={(el) => {
									heroBackdropRef.current = el;
									if (el) {
										el.style.opacity = String(
											heroBackdropOpacity(
												scrollContainerRef.current?.scrollTop ?? 0,
											),
										);
									}
								}}
								className="pointer-events-none absolute inset-x-0 top-0 z-0 h-[600px] will-change-[opacity]"
							>
								<HeroBackdrop
									coverUrl={heroBackdrop.coverUrl}
									coverSrcSet={heroBackdrop.coverSrcSet}
									accent={heroBackdrop.accent}
								/>
							</div>
						)}

						<header
							className={cn(
								"sticky top-0 z-30 h-14 shrink-0 border-border/40 px-4 transition-colors duration-300 lg:px-6",
								immersiveHeader ? "bg-transparent" : "bg-background",
							)}
						>
							<div className="relative flex h-full items-center gap-3">
								<Link
									to="/dashboard"
									className="flex shrink-0 items-center gap-2 md:hidden"
								>
									<span className="font-semibold text-sm tracking-wide">
										Nanahoshi
									</span>
								</Link>

								<div className="hidden shrink-0 md:block">
									<OrgSwitcher />
								</div>

								<Suspense fallback={<DashboardHeaderSearchShell />}>
									<DashboardHeaderSearch />
								</Suspense>

								<div className="order-1 ml-auto flex shrink-0 items-center gap-2 md:order-none">
									<Button
										variant="ghost"
										size="icon-lg"
										aria-label={m["nav.downloads"]()}
										title={m["nav.downloads"]()}
										asChild
										className="hidden rounded-full text-muted-foreground md:inline-flex [&_svg]:size-[18px]"
									>
										<Link to="/dashboard/downloads">
											<ArrowDownToLine />
										</Link>
									</Button>
									{/* Toggles the right-hand activity rail (a Sheet below lg, an
									    inline drawer on lg+); it's no longer permanently docked. */}
									<Button
										type="button"
										variant="ghost"
										size="icon-lg"
										aria-label={m["aria.friends_activity"]()}
										title={m["aria.friends_activity"]()}
										aria-pressed={activityRailOpen}
										onClick={toggleActivityRail}
										className={cn(
											"rounded-full text-muted-foreground [&_svg]:size-[18px]",
											activityRailOpen && "bg-muted text-foreground",
										)}
									>
										<Users />
									</Button>
									<Button
										type="button"
										variant="ghost"
										size="icon-lg"
										aria-label={m["aria.notifications"]()}
										title={m["aria.notifications"]()}
										className="rounded-full text-muted-foreground [&_svg]:size-[18px]"
									>
										<Bell />
									</Button>
								</div>
							</div>
						</header>

						{/* Home shows its own full offline notice */}
						{location.pathname !== "/dashboard" && <OfflineBanner />}

						<div className="relative z-10 flex min-h-0 flex-1">
							<main
								ref={scrollContainerRef}
								className="min-w-0 flex-1 overflow-y-auto pb-14 [scrollbar-gutter:stable] md:pb-0"
							>
								<Outlet />
							</main>

							<ActivityRail
								open={activityRailOpen}
								onClose={() => setActivityRailOpen(false)}
							/>
						</div>

						<MobileBottomNav />

						{isSwitchingServer && <ServerSwitchOverlay />}
					</SidebarInset>
				</SidebarProvider>

				<MiniPlayer />
			</div>
		</ScrollContainerProvider>
	);
}
