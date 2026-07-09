import {
	ArrowLineDown,
	CircleNotch,
	GearSix,
	Users,
} from "@phosphor-icons/react";
import {
	getRouteApi,
	Link,
	Outlet,
	useLocation,
	useRouter,
} from "@tanstack/react-router";
import { type CSSProperties, lazy, Suspense, useRef } from "react";
import { MiniPlayer } from "@/components/audio-player/mini-player";
import { DashboardSidebarNav } from "@/components/dashboard/dashboard-sidebar-nav";
import { MobileBottomNav } from "@/components/dashboard/mobile-bottom-nav";
import { OrgSwitcher } from "@/components/dashboard/org-switcher";
import { UserMenu } from "@/components/dashboard/user-menu";
import { ActivityRail } from "@/components/layout/activity-rail";
import { ScrollContainerProvider } from "@/components/layout/scroll-container-context";
import { useSettingsModal } from "@/components/layout/settings-modal-context";
import { preloadSettingsModal } from "@/components/layout/settings-modal-host";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { HeroBackdrop } from "@/components/shared/detail-page";
import { OfflineBanner } from "@/components/shared/offline-banner";
import { Button } from "@/components/ui/button";
import {
	Sidebar,
	SidebarHeader,
	SidebarInset,
	SidebarProvider,
} from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { useAudioPlayerBook } from "@/context/audio-player-context";
import { useMountEffect } from "@/hooks/use-mount-effect";
import { useNotificationEvents } from "@/hooks/use-notification-events";
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

// Notification listener: keeps the bell's unread badge live app-wide.
// Notifications are per-user (not per-server), so no key-by-org remount.
function NotificationEventsListener() {
	useNotificationEvents();
	return null;
}

const DashboardHeaderSearch = lazy(async () => {
	const module = await import("@/components/dashboard/dashboard-header-search");
	return { default: module.DashboardHeaderSearch };
});

function DashboardHeaderSearchShell() {
	return (
		<div className="relative hidden min-w-0 flex-1 md:block">
			<Skeleton className="h-11 rounded-xl bg-sidebar-accent/50" />
		</div>
	);
}

function ServerSwitchOverlay() {
	return (
		<div className="absolute inset-0 z-40 flex items-center justify-center bg-background">
			<div className="flex flex-col items-center gap-3 text-muted-foreground">
				<CircleNotch className="size-6 animate-spin" />
				<span className="text-sm">Switching server…</span>
			</div>
		</div>
	);
}

function SidebarHeaderSection() {
	return (
		<SidebarHeader className="h-14 justify-center px-2 py-0">
			<OrgSwitcher variant="sidebar" />
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
	const audiobook = useAudioPlayerBook();
	// The full-width transport bar is fixed to the bottom. When it's visible we
	// reserve its height at the foot of the sidebar and the scroll area so neither
	// is hidden behind it (the bar spans under the sidebar, not just the content).
	const showPlayerBar =
		Boolean(audiobook) && !location.pathname.startsWith("/player/");
	const scrollContainerRef = useRef<HTMLElement | null>(null);
	const restoreFrameRef = useRef<number | null>(null);
	const heroBackdropRef = useRef<HTMLDivElement | null>(null);

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

	// Fade the hero backdrop out as the content scrolls (direct opacity write on
	// one element — compositor-cheap, no re-render). Keeps the wash confined to
	// the top of the content panel.
	useMountEffect(() => {
		const el = scrollContainerRef.current;
		if (!el) return;
		const onScroll = () => {
			if (heroBackdropRef.current) {
				heroBackdropRef.current.style.opacity = String(
					heroBackdropOpacity(el.scrollTop),
				);
			}
		};
		el.addEventListener("scroll", onScroll, { passive: true });
		return () => el.removeEventListener("scroll", onScroll);
	});

	return (
		<ScrollContainerProvider value={scrollContainerRef}>
			<TaskEventsListener key={activeOrg?.id ?? "none"} />
			<PresenceEventsListener key={`presence-${activeOrg?.id ?? "none"}`} />
			<NotificationEventsListener />
			<div
				className="flex h-svh flex-col"
				style={{ "--player-height": "82px" } as CSSProperties}
			>
				<SidebarProvider className="min-h-0 flex-1 bg-sidebar [transform:translateZ(0)]">
					<Sidebar
						collapsible="icon"
						className={cn(
							"group-data-[side=left]:border-r-0",
							showPlayerBar && "md:pb-[var(--player-height)]",
						)}
					>
						<SidebarHeaderSection />

						<DashboardSidebarNav
							locationPathname={location.pathname}
							onNavigate={() => {}}
						/>
					</Sidebar>

					<SidebarInset className="relative min-h-0 bg-transparent">
						{/* md:pl-0 lines the search field up with the content panel's left border. */}
						<header className="flex h-14 shrink-0 items-center gap-3 pr-3 pl-3 md:pl-0 lg:pr-4">
							<Link
								to="/dashboard"
								className="flex shrink-0 items-center gap-2 md:hidden"
							>
								<span className="font-semibold text-sm tracking-wide">
									Nanahoshi
								</span>
							</Link>

							<Suspense fallback={<DashboardHeaderSearchShell />}>
								<DashboardHeaderSearch />
							</Suspense>

							<div className="order-1 ml-auto flex shrink-0 items-center gap-1.5 md:order-none">
								<Button
									variant="ghost"
									size="icon-lg"
									aria-label={m["nav.downloads"]()}
									title={m["nav.downloads"]()}
									asChild
									className="hidden rounded-full text-muted-foreground md:inline-flex [&_svg]:size-[18px]"
								>
									<Link to="/dashboard/downloads">
										<ArrowLineDown />
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
								<NotificationBell />
								<Button
									type="button"
									variant="ghost"
									size="icon-lg"
									aria-label={m["nav.settings"]()}
									title={m["nav.settings"]()}
									onPointerEnter={preloadSettingsModal}
									onClick={() => openSettings("profile")}
									className="hidden rounded-full text-muted-foreground md:inline-flex [&_svg]:size-[18px]"
								>
									<GearSix />
								</Button>
								<div className="hidden md:block">
									<UserMenu collapsed />
								</div>
							</div>
						</header>

						{/* Content panel: the app chrome (navbar + sidebar) shares the
						    sidebar surface; everything routed lives on this raised sheet
						    with the reference's rounded top-left corner. */}
						<div className="relative z-10 flex min-h-0 flex-1 flex-col overflow-hidden bg-background md:rounded-tl-2xl">
							{/* One continuous artwork wash across the top of the panel; fades
							    into --background on scroll. null on non-detail routes. */}
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

							{/* Home shows its own full offline notice */}
							{location.pathname !== "/dashboard" && <OfflineBanner />}

							<div className="relative z-10 flex min-h-0 flex-1">
								<main
									ref={scrollContainerRef}
									className={cn(
										"min-w-0 flex-1 overflow-y-auto pb-14 [scrollbar-gutter:stable]",
										showPlayerBar ? "md:pb-[var(--player-height)]" : "md:pb-0",
									)}
								>
									<Outlet />
								</main>

								<ActivityRail
									open={activityRailOpen}
									onClose={() => setActivityRailOpen(false)}
								/>
							</div>

							{isSwitchingServer && <ServerSwitchOverlay />}
						</div>

						<MobileBottomNav />
					</SidebarInset>
				</SidebarProvider>

				{/* Full-width transport row: sits below the sidebar+content flex so it
				    spans the entire viewport, not just the content column. */}
				<MiniPlayer />
			</div>
		</ScrollContainerProvider>
	);
}
