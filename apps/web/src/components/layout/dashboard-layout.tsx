import { CircleNotch, Users } from "@phosphor-icons/react";
import {
	getRouteApi,
	Link,
	Outlet,
	useLocation,
	useRouter,
	useRouterState,
} from "@tanstack/react-router";
import { type CSSProperties, type RefObject, useCallback, useRef } from "react";
import { MiniPlayer } from "@/components/audio-player/mini-player";
import { CreateMenu } from "@/components/dashboard/create-menu";
import { DashboardAppRail } from "@/components/dashboard/dashboard-app-rail";
import { DashboardHeaderSearch } from "@/components/dashboard/dashboard-header-search";
import { MobileBottomNav } from "@/components/dashboard/mobile-bottom-nav";
import { getTabReselectScrollBehavior } from "@/components/dashboard/mobile-tab-navigation";
import { OrgSwitcher } from "@/components/dashboard/org-switcher";
import { UserMenu } from "@/components/dashboard/user-menu";
import { ActivityRail } from "@/components/layout/activity-rail";
import { ScrollContainerProvider } from "@/components/layout/scroll-container-context";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { HeroBackdrop } from "@/components/shared/detail-page";
import { OfflineBanner } from "@/components/shared/offline-banner";
import { Button } from "@/components/ui/button";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { useAudioPlayerBook } from "@/context/audio-player-context";
import { useIsomorphicLayoutEffect } from "@/hooks/use-isomorphic-layout-effect";
import { useMountEffect } from "@/hooks/use-mount-effect";
import { useNotificationEvents } from "@/hooks/use-notification-events";
import { usePresenceEvents } from "@/hooks/use-presence-events";
import { usePresenceIdle } from "@/hooks/use-presence-idle";
import { useRecommendationEvents } from "@/hooks/use-recommendation-events";
import { useSession } from "@/hooks/use-session";
import { useTaskEvents } from "@/hooks/use-task-events";
import {
	setActivityRailOpen,
	toggleActivityRail,
	useActivityRailOpen,
} from "@/lib/activity-rail-store";
import { useHeroBackdrop } from "@/lib/hero-backdrop-store";
import {
	getLocationRestoreKey,
	getScrollRestoreEpoch,
	pageScroll,
} from "@/lib/scroll-restoration";
import { reconcilePersistedServer } from "@/lib/switch-server";
import { useIsSwitchingServer } from "@/lib/switching-server-store";
import { cn } from "@/lib/utils";
import { m } from "@/paraglide/messages";

const dashboardRoute = getRouteApi("/dashboard");

// Last restore run, so the second remount of a navigation (content-swap
// commit, then resolution commit — see getScrollRestoreEpoch) resumes instead
// of restarting: once the user takes over scrolling it must not yank back.
let lastRestoreRun: { locationKey: string; takenOver: boolean } | null = null;

/**
 * Restores the dashboard <main> scroll offset for the current history entry.
 * Keyed by getScrollRestoreEpoch so it remounts in the same React commit that
 * mounts the new page's content (it must be rendered AFTER the Outlet so the
 * content is committed first), which puts the restored offset on screen
 * before the browser paints — no visible jump. The target entry is read from
 * `router.latestLocation`, which already points at the destination in that
 * commit. The rAF loop only kicks in when the content isn't tall enough yet
 * (cold cache, skeleton swap-in) and re-reads the target so a concurrent
 * scroll-to-top reselect wins.
 */
function ScrollRestorer({
	containerRef,
}: {
	containerRef: RefObject<HTMLElement | null>;
}) {
	const router = useRouter();
	useIsomorphicLayoutEffect(() => {
		const el = containerRef.current;
		if (!el) return;
		const locationKey = getLocationRestoreKey(router.latestLocation);
		if (lastRestoreRun?.locationKey === locationKey && lastRestoreRun.takenOver)
			return;
		const run = { locationKey, takenOver: false };
		lastRestoreRun = run;
		let frame: number | null = null;
		const startedAt = performance.now();

		// Keep re-asserting for the whole window: async content swapping in can
		// shrink scrollHeight for a frame, which clamps scrollTop to 0 — without
		// re-assertion the restore would silently stick there.
		const apply = () => {
			frame = null;
			const target = pageScroll.get(locationKey) ?? 0;
			const maxTop = Math.max(0, el.scrollHeight - el.clientHeight);
			const desired = Math.min(target, maxTop);
			if (el.scrollTop !== desired) {
				el.scrollTo({ top: desired, behavior: "auto" });
			}
			if (performance.now() - startedAt < 700) {
				frame = window.requestAnimationFrame(apply);
			}
		};

		const cancel = () => {
			if (frame != null) window.cancelAnimationFrame(frame);
			frame = null;
			el.removeEventListener("wheel", takeOver);
			el.removeEventListener("touchstart", takeOver);
			window.removeEventListener("keydown", takeOver);
			window.removeEventListener("pointerdown", takeOver);
		};
		// The user taking over scrolling ends the restore immediately — for this
		// run AND any follow-up remount for the same entry (unmount alone, e.g.
		// the swap→resolution remount, lets the next run keep re-asserting).
		const takeOver = () => {
			run.takenOver = true;
			cancel();
		};
		el.addEventListener("wheel", takeOver, { passive: true });
		el.addEventListener("touchstart", takeOver, { passive: true });
		window.addEventListener("keydown", takeOver);
		window.addEventListener("pointerdown", takeOver);

		apply();
		return cancel;
	}, []);
	return null;
}

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
 * re-subscribes on switch and re-scopes member presence to the new server.
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

// Recommendation listener: refetches "For you" when the debounced per-user
// refresh (like/shelf/progress signal) finishes server-side. Per-user routing.
function RecommendationEventsListener() {
	useRecommendationEvents();
	return null;
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

// Routes that own the whole window: they bring their own full-height navigation
// and header, so the app rail, the top bar and the members rail would only
// compete with it. They must offer their own way back — mobile still keeps the
// bottom tab bar, which is its real navigation.
const STANDALONE_ROUTES = new Set(["/dashboard/metadata"]);

export function DashboardLayout() {
	const location = useLocation();
	const router = useRouter();
	const { organizations } = dashboardRoute.useRouteContext();
	const { data: session } = useSession();
	const activeOrganizationId = session?.session.activeOrganizationId ?? null;
	const heroBackdrop = useHeroBackdrop();
	const isSwitchingServer = useIsSwitchingServer();
	const activityRailOpen = useActivityRailOpen();
	const audiobook = useAudioPlayerBook();
	// The full-width transport bar is fixed to the bottom. When it's visible we
	// reserve its height at the foot of the sidebar and the scroll area so neither
	// is hidden behind it (the bar spans under the sidebar, not just the content).
	const showPlayerBar = Boolean(audiobook);
	const standalone = STANDALONE_ROUTES.has(location.pathname);
	const scrollContainerRef = useRef<HTMLElement | null>(null);
	// Remount epoch, NOT plain useLocation(): during a pending navigation the
	// location already points at the target while the old page is still on
	// screen — keying off it would scroll the visible old page to top. See
	// getScrollRestoreEpoch for the timing details.
	const scrollRestoreEpoch = useRouterState({
		select: getScrollRestoreEpoch,
	});
	// Drop any persisted cache that belongs to a different server (e.g. switched
	// on another device, then this tab reloaded). Same-server reloads keep theirs.
	useMountEffect(() => {
		reconcilePersistedServer(session?.session.activeOrganizationId ?? null);
	});

	const handleReselectActiveTab = useCallback(() => {
		const scrollEl = scrollContainerRef.current;
		if (!scrollEl) return;

		pageScroll.set(getLocationRestoreKey(router.latestLocation), 0);
		const prefersReducedMotion = window.matchMedia(
			"(prefers-reduced-motion: reduce)",
		).matches;
		scrollEl.scrollTo({
			top: 0,
			behavior: getTabReselectScrollBehavior(prefersReducedMotion),
		});
	}, [router]);

	// The dashboard scrolls inside <main>, not the window. Save the position as
	// a navigation starts; restoring is <ScrollRestorer>'s job so it lands in
	// the same commit that mounts the new page (see below).
	useMountEffect(() =>
		router.subscribe("onBeforeNavigate", ({ fromLocation, hrefChanged }) => {
			if (!hrefChanged || !fromLocation) return;
			const scrollEl = scrollContainerRef.current;
			if (!scrollEl) return;
			pageScroll.set(getLocationRestoreKey(fromLocation), scrollEl.scrollTop);
		}),
	);

	return (
		<ScrollContainerProvider value={scrollContainerRef}>
			<TaskEventsListener key={activeOrganizationId ?? "none"} />
			<PresenceEventsListener
				key={`presence-${activeOrganizationId ?? "none"}`}
			/>
			<NotificationEventsListener />
			<RecommendationEventsListener />
			<div
				className="relative flex h-dvh flex-col overflow-hidden pt-[var(--safe-area-top)] pr-[var(--safe-area-right)] pl-[var(--safe-area-left)]"
				style={
					{
						"--player-height": "88px",
						// The bar's own height plus the inset it has to clear (an iPad in
						// landscape is >=md and still has a home indicator), so every
						// reservation below stays in step with the bar.
						"--player-reserve":
							"calc(var(--player-height) + var(--safe-area-bottom))",
						"--mobile-player-offset": showPlayerBar
							? "var(--mobile-player-height)"
							: "0px",
					} as CSSProperties
				}
			>
				<SidebarProvider className="theme-gradient-surface min-h-0 flex-1 bg-sidebar [transform:translateZ(0)]">
					{/* One fixed chrome column. It doesn't collapse; below md it steps
					    aside entirely for the bottom tab bar. */}
					{!standalone && (
						<div
							className={cn(
								"hidden shrink-0 md:flex",
								showPlayerBar && "md:pb-[var(--player-reserve)]",
							)}
						>
							<DashboardAppRail
								locationPathname={location.pathname}
								activeOrganizationId={activeOrganizationId}
							/>
						</div>
					)}

					<SidebarInset className="relative min-h-0 bg-transparent">
						{/* Desktop is a 1fr/auto/1fr grid so the search sits on the panel's
						    true centre line, not centred in whatever the icon cluster
						    leaves over. Mobile keeps the flex row and its own ordering. */}
						{!standalone && (
							<header className="theme-gradient-surface relative z-20 flex h-14 shrink-0 items-center gap-3 bg-background px-3 md:grid md:grid-cols-[1fr_auto_1fr] md:bg-none md:bg-transparent lg:px-4">
								<Link
									to="/dashboard"
									className="flex shrink-0 items-center gap-2 md:hidden"
								>
									<span className="font-semibold text-sm tracking-wide">
										Nanahoshi
									</span>
								</Link>

								{/* Server switcher leads the bar on desktop; mobile switches
								    servers from the bottom tab bar's "Me" drawer instead. */}
								<div className="hidden min-w-0 items-center md:col-start-1 md:flex">
									<OrgSwitcher
										variant="header"
										initialOrganizations={organizations}
										activeOrganizationId={activeOrganizationId}
									/>
								</div>

								<DashboardHeaderSearch />

								<div className="order-1 ml-auto flex shrink-0 items-center gap-1.5 md:order-none md:col-start-3 md:ml-0 md:justify-self-end">
									{/* Create and account are desktop-only here: mobile reaches
									    them through the bottom tab bar's drawers. */}
									<div className="hidden md:contents">
										<CreateMenu />
									</div>
									{/* Toggles the right-hand server-members sidebar. On mobile it opens as
								    a sheet; on desktop it reserves a collapsible column. */}
									<Button
										type="button"
										variant="ghost"
										size="icon-lg"
										aria-label={m["aria.friends_activity"]()}
										title={m["aria.friends_activity"]()}
										aria-pressed={activityRailOpen}
										aria-expanded={activityRailOpen}
										onClick={toggleActivityRail}
										className={cn(
											"rounded-full text-muted-foreground [&_svg]:size-[18px]",
											activityRailOpen && "bg-muted text-foreground",
										)}
									>
										<Users />
									</Button>
									<NotificationBell />
									<div className="hidden md:contents">
										<UserMenu collapsed />
									</div>
								</div>
							</header>
						)}

						{/* Content panel: the app chrome (navbar + sidebars) shares the
						    sidebar surface; routed content sits on the raised sheet. A
						    standalone route has no chrome to sit under, so it drops the
						    raised-sheet rounding and fills the window. */}
						<div className="theme-gradient-surface relative z-10 flex min-h-0 flex-1 overflow-hidden bg-sidebar">
							<div
								className={cn(
									"relative z-10 flex min-h-0 flex-1 flex-col overflow-hidden bg-background",
									!standalone && "md:rounded-tl-2xl",
									!heroBackdrop && "theme-gradient-surface",
									!standalone && activityRailOpen && "lg:rounded-tr-2xl",
								)}
							>
								{/* One continuous artwork wash across the whole content panel.
								    null on non-detail routes. */}
								{heroBackdrop && (
									<div className="pointer-events-none absolute inset-0 z-0">
										<HeroBackdrop
											coverUrl={heroBackdrop.coverUrl}
											coverSrcSet={heroBackdrop.coverSrcSet}
											accent={heroBackdrop.accent}
										/>
									</div>
								)}

								{/* Home shows its own full offline notice */}
								{location.pathname !== "/dashboard" && <OfflineBanner />}

								<main
									ref={scrollContainerRef}
									className={cn(
										"min-w-0 flex-1 overflow-y-auto overscroll-y-contain pb-[calc(var(--mobile-tabbar-height)+var(--mobile-player-offset)+var(--safe-area-bottom))] [scroll-padding-bottom:calc(var(--mobile-tabbar-height)+var(--mobile-player-offset)+var(--safe-area-bottom))] [scrollbar-gutter:stable]",
										showPlayerBar
											? "md:pb-[var(--player-reserve)] md:[scroll-padding-bottom:var(--player-reserve)]"
											: "md:pb-0 md:[scroll-padding-bottom:0px]",
									)}
								>
									<Outlet />
									<ScrollRestorer
										key={scrollRestoreEpoch}
										containerRef={scrollContainerRef}
									/>
								</main>

								{isSwitchingServer && <ServerSwitchOverlay />}
							</div>

							{/* Its only toggle lives in the top bar, so a standalone route
							    would strand it open with no way to close it. */}
							{!standalone && (
								<ActivityRail
									open={activityRailOpen}
									onClose={() => setActivityRailOpen(false)}
									reservePlayerSpace={showPlayerBar}
								/>
							)}
						</div>
					</SidebarInset>
				</SidebarProvider>

				{/* Keep fixed mobile chrome outside the transformed sidebar wrapper so
				    it remains anchored to the visual viewport as browser UI resizes it. */}
				<MobileBottomNav onReselectActiveTab={handleReselectActiveTab} />

				{/* Full-width transport row: sits below the sidebar+content flex so it
				    spans the entire viewport, not just the content column. */}
				<MiniPlayer />
			</div>
		</ScrollContainerProvider>
	);
}
