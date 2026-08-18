import { CircleNotch, Users } from "@phosphor-icons/react";
import {
	getRouteApi,
	Outlet,
	useLocation,
	useRouter,
	useRouterState,
} from "@tanstack/react-router";
import {
	type CSSProperties,
	type RefObject,
	useCallback,
	useRef,
	useState,
} from "react";
import { CreateMenu } from "@/components/dashboard/create-menu";
import { DashboardAppRail } from "@/components/dashboard/dashboard-app-rail";
import { DashboardHeaderSearch } from "@/components/dashboard/dashboard-header-search";
import { MobileBottomNav } from "@/components/dashboard/mobile-bottom-nav";
import { getTabReselectScrollBehavior } from "@/components/dashboard/mobile-tab-navigation";
import { OrgSwitcher } from "@/components/dashboard/org-switcher";
import { UserMenu } from "@/components/dashboard/user-menu";
import { ActivityRail } from "@/components/layout/activity-rail";
import { ScrollContainerProvider } from "@/components/layout/scroll-container-context";
import {
	NotificationBell,
	NotificationRail,
} from "@/components/notifications/notification-bell";
import { OfflineBanner } from "@/components/shared/offline-banner";
import { Button } from "@/components/ui/button";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import {
	useAudioPlayerBook,
	useAudioPlayerExpanded,
} from "@/context/audio-player-context";
import { useAutoHideHeader } from "@/hooks/use-auto-hide-header";
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
		// A forward navigation lands on a brand-new history entry whose saved
		// offset is 0. `main` is never remounted, so it still carries the previous
		// page's scrollTop and does need the one reset — but nothing after that:
		// there is no target to clamp against a growing document, so the polling
		// loop below would spend 700 ms reading `scrollHeight` (~47 forced layouts)
		// to re-assert a zero it already reached. This is the common case and it
		// was the bulk of the per-navigation cost.
		if ((pageScroll.get(locationKey) ?? 0) === 0) {
			lastRestoreRun = { locationKey, takenOver: false };
			el.scrollTop = 0;
			return;
		}

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
		<div
			className="absolute inset-0 z-40 flex items-center justify-center bg-background"
			role="status"
			aria-live="polite"
			aria-atomic="true"
		>
			<div className="flex flex-col items-center gap-3 text-muted-foreground">
				<CircleNotch aria-hidden="true" className="size-6 animate-spin" />
				<span className="text-sm">{m["common.switching_server"]()}</span>
			</div>
		</div>
	);
}

// Routes that own the whole window: they bring their own full-height navigation
// and header, so the app rail, the top bar and the members rail would only
// compete with it. They must offer their own way back — mobile still keeps the
// bottom tab bar, which is its real navigation.
const STANDALONE_ROUTES = new Set(["/dashboard/metadata"]);

// Routes that drop the top bar below md only. A detail page leads with its
// artwork and carries its own back button, so on a phone the bar just pushes
// the cover down — and because the bar auto-hides, any sticky page chrome would
// be left pinned against the padding it vacates. Desktop keeps the full chrome.
const MOBILE_CHROMELESS_ROUTE_IDS = new Set([
	"/dashboard/books/$uuid",
	"/dashboard/audiobooks/$uuid",
]);

export function DashboardLayout() {
	const location = useLocation();
	const router = useRouter();
	const { organizations } = dashboardRoute.useRouteContext();
	const { data: session } = useSession();
	const activeOrganizationId = session?.session.activeOrganizationId ?? null;
	const isSwitchingServer = useIsSwitchingServer();
	const activityRailOpen = useActivityRailOpen();
	const [notificationRailOpen, setNotificationRailOpen] = useState(false);
	const audiobook = useAudioPlayerBook();
	// The expanded player covers the window; the chrome behind it must leave the
	// tab order and the accessibility tree while it does.
	const playerExpanded = useAudioPlayerExpanded();
	// The full-width transport bar is fixed to the bottom. The layout reserves a
	// separate row for it below the workspace so the scroll area ends above the
	// bar instead of painting and scrolling behind it.
	const showPlayerBar = Boolean(audiobook);
	const standalone = STANDALONE_ROUTES.has(location.pathname);
	// Matched route ids, not the pathname: `/dashboard/audiobooks/series/$uuid`
	// is a detail-looking path that must keep its chrome.
	const mobileChromeless = useRouterState({
		select: (state) =>
			state.matches.some((match) =>
				MOBILE_CHROMELESS_ROUTE_IDS.has(match.routeId),
			),
	});
	const scrollContainerRef = useRef<HTMLElement | null>(null);
	const headerRef = useRef<HTMLElement | null>(null);
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
	// Mobile top bar gets out of the way while reading and comes back the moment
	// you scroll up. Drives the header element directly — no render per frame.
	useAutoHideHeader(headerRef, scrollContainerRef);

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
				className="relative flex h-dvh flex-col overflow-hidden bg-background pt-[var(--safe-area-top)] pr-[var(--safe-area-right)] pl-[var(--safe-area-left)]"
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
						// Detail-page artwork uses the visible height, not just the viewport
						// height, so its actions remain above the fixed desktop player.
						"--desktop-player-offset": showPlayerBar
							? "var(--player-reserve)"
							: "0px",
					} as CSSProperties
				}
			>
				<a
					href="#dashboard-main"
					className="fixed -start-[9999px] top-[calc(var(--safe-area-top)+0.75rem)] z-50 rounded-lg bg-primary px-4 py-2 font-medium text-primary-foreground text-sm shadow-lg focus:start-[calc(var(--safe-area-left)+0.75rem)] focus:outline-2 focus:outline-ring focus:outline-offset-2"
				>
					{m["aria.skip_to_content"]()}
				</a>
				{!standalone && (
					<header
						ref={headerRef}
						inert={playerExpanded}
						// px-4 below md so the server badge's leading edge lands on the
						// same line as the page's own px-4 content (section titles,
						// cards); from md the rail owns that alignment instead.
						//
						// Below md the negative margin pulls the bar's own height back out
						// of the column, so it overlays the scroll panel (which re-inserts
						// that space as padding) instead of occupying a row. That's what
						// lets it hide on a transform alone, with no reflow of the scroll
						// container on any frame. Hiding eases a touch slower than
						// revealing: getting the bar back should feel immediate, losing it
						// shouldn't snatch.
						//
						// max-md:gap-1.5 — below md the trailing icons are three peers
						// (members, bell, search) split across two flex children; one gap
						// for all of them, or the split reads as a grouping that isn't
						// there. The badge re-adds the difference itself.
						className={cn(
							"theme-gradient-surface relative z-20 flex h-[var(--mobile-header-height)] shrink-0 items-center gap-3 bg-sidebar px-4 motion-safe:transition-transform motion-safe:duration-200 motion-safe:ease-[var(--ease-smooth-out)] motion-safe:data-[hidden=true]:duration-[260ms] max-md:mb-[calc(var(--mobile-header-height)*-1)] max-md:gap-1.5 max-md:data-[hidden=true]:-translate-y-full md:grid md:grid-cols-[1fr_auto_1fr] md:px-3 lg:px-4",
							mobileChromeless && "max-md:hidden",
						)}
					>
						{/* Server switcher leads the bar at every size — it's what tells
					    you which server you're looking at. On mobile it takes the
					    free space so the name truncates instead of shoving the icon
					    cluster off the edge; from md the negative margin cancels the
					    header's own padding so the switcher can lay its badge out on
					    the app rail's grid below — it carries the rail's 5.5rem box
					    itself. */}
						<div className="flex min-w-0 flex-1 items-center max-md:me-1.5 md:col-start-1 md:-ms-3 md:flex-none lg:-ms-4">
							<OrgSwitcher
								initialOrganizations={organizations}
								activeOrganizationId={activeOrganizationId}
							/>
						</div>

						<DashboardHeaderSearch />

						{/* On mobile search is the last thing in the bar, so the cluster
						    sits just left of it and the bell lands next to it. */}
						<div className="order-1 flex shrink-0 items-center gap-1.5 md:order-none md:col-start-3 md:justify-self-end">
							<div className="hidden md:contents">
								<CreateMenu />
							</div>
							{/* Toggles the right-hand server-members panel. It slides over the
							    content on every size — sheet on mobile, non-modal overlay on
							    desktop — so the page never reflows. */}
							<Button
								type="button"
								variant="ghost"
								size="icon-lg"
								aria-label={m["aria.friends_activity"]()}
								title={m["aria.friends_activity"]()}
								aria-pressed={activityRailOpen}
								aria-expanded={activityRailOpen}
								onClick={() => {
									setNotificationRailOpen(false);
									toggleActivityRail();
								}}
								className={cn(
									"rounded-full text-foreground [&_svg]:size-[18px]",
									activityRailOpen && "bg-muted",
								)}
							>
								<Users weight={activityRailOpen ? "fill" : "bold"} />
							</Button>
							<NotificationBell
								open={notificationRailOpen}
								onOpenChange={(open) => {
									if (open) setActivityRailOpen(false);
									setNotificationRailOpen(open);
								}}
							/>
							<div className="hidden md:contents">
								<UserMenu collapsed />
							</div>
						</div>
					</header>
				)}

				<SidebarProvider
					inert={playerExpanded}
					// gap: the chrome shows between the rail and the content as a
					// channel, so the rail reads as its own panel rather than an
					// extension of the sheet.
					className="theme-gradient-surface min-h-0 flex-1 bg-sidebar [transform:translateZ(0)] md:gap-2"
				>
					{/* One fixed chrome column. It doesn't collapse; below md it steps
					    aside entirely for the bottom tab bar. */}
					{!standalone && (
						<div className="hidden shrink-0 md:flex">
							<DashboardAppRail
								locationPathname={location.pathname}
								activeOrganizationId={activeOrganizationId}
							/>
						</div>
					)}

					<SidebarInset className="relative min-h-0 bg-transparent">
						{/* Content panel: the app chrome (navbar + sidebars) shares the
					    sidebar surface; routed content sits on the raised sheet. A
					    standalone route has no chrome to sit under, so it drops the
					    raised-sheet rounding and fills the window. */}
						<div className="theme-gradient-surface relative z-10 flex min-h-0 flex-1 overflow-hidden bg-sidebar">
							<div
								className={cn(
									"theme-gradient-surface relative z-10 flex min-h-0 flex-1 flex-col overflow-hidden bg-background",
									!standalone &&
										"border-border md:rounded-tl-2xl md:border-s md:border-t",
								)}
							>
								<main
									id="dashboard-main"
									ref={scrollContainerRef}
									tabIndex={-1}
									// Below md the top padding stands in for the bar overlaying
									// this panel, so content still starts below it at rest —
									// and once scrolled, real content sits under the bar for it
									// to slide away from, never a gap. Matching scroll-padding
									// keeps anchor targets clear of it.
									className={cn(
										"min-w-0 flex-1 overflow-y-auto overscroll-y-contain [scrollbar-gutter:stable] focus:outline-none",
										// No bar below md on these routes, so the padding standing
										// in for it would just be a gap above the artwork.
										!mobileChromeless &&
											"max-md:pt-[var(--mobile-header-height)] max-md:[scroll-padding-top:var(--mobile-header-height)]",
									)}
								>
									{/* Inside the scroll area: the bar overlays the top of this
									    panel on mobile, so a banner above it would be hidden
									    under the bar. Home shows its own full offline notice. */}
									{location.pathname !== "/dashboard" && <OfflineBanner />}

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
								<>
									<ActivityRail
										open={activityRailOpen}
										onClose={() => setActivityRailOpen(false)}
									/>
									<NotificationRail
										open={notificationRailOpen}
										onClose={() => setNotificationRailOpen(false)}
									/>
								</>
							)}
						</div>
					</SidebarInset>
				</SidebarProvider>

				{/* Fixed bottom chrome gets a real row in the dashboard layout. This
				    keeps the workspace and its scrollbar above the player/navigation
				    while the persistent player remains mounted across route changes. */}
				<div
					data-slot="dashboard-bottom-chrome-reserve"
					aria-hidden="true"
					className="h-[calc(var(--mobile-tabbar-height)+var(--mobile-player-offset)+var(--safe-area-bottom))] shrink-0 bg-sidebar md:h-[var(--desktop-player-offset)]"
				/>

				{/* Keep fixed mobile chrome outside the transformed sidebar wrapper so
				    it remains anchored to the visual viewport as browser UI resizes it. */}
				<div inert={playerExpanded}>
					<MobileBottomNav onReselectActiveTab={handleReselectActiveTab} />
				</div>
			</div>
		</ScrollContainerProvider>
	);
}
