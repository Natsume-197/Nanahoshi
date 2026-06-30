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
	useRouter,
} from "@tanstack/react-router";
import { ArrowDownToLine, Bell, Loader2, Menu, Settings } from "lucide-react";
import { lazy, Suspense, useRef, useState } from "react";
import { toast } from "sonner";
import { MiniPlayer } from "@/components/audio-player/mini-player";
import { DashboardSidebarNav } from "@/components/dashboard/dashboard-sidebar-nav";
import { MobileBottomNav } from "@/components/dashboard/mobile-bottom-nav";
import { OrgSwitcher } from "@/components/dashboard/org-switcher";
import { ActivityRail } from "@/components/layout/activity-rail";
import { ScrollContainerProvider } from "@/components/layout/scroll-container-context";
import { SettingsModalProvider } from "@/components/layout/settings-modal-context";
import type { OrgSettingsSection } from "@/components/settings/server-settings-modal";
import type { SettingsSection } from "@/components/settings/settings-sections";
import { OfflineBanner } from "@/components/shared/offline-banner";
import { PRESENCE_DOT } from "@/components/shared/presence-dot";
import { UserAvatar } from "@/components/shared/user-avatar";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
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
import { usePresenceEvents } from "@/hooks/use-presence-events";
import { usePresenceIdle } from "@/hooks/use-presence-idle";
import { useTaskEvents } from "@/hooks/use-task-events";
import {
	hydrateActivityRail,
	setActivityRailOpen,
	useActivityRailOpen,
} from "@/lib/activity-rail-store";
import { authClient } from "@/lib/auth-client";
import { reconcilePersistedServer } from "@/lib/switch-server";
import { useIsSwitchingServer } from "@/lib/switching-server-store";
import { cn } from "@/lib/utils";
import { client, orpc, queryClient } from "@/utils/orpc";

const dashboardRoute = getRouteApi("/dashboard");

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

const SettingsModal = lazy(async () => {
	const module = await import("@/components/settings/settings-modal");
	return { default: module.SettingsModal };
});

const ServerSettingsModal = lazy(async () => {
	const module = await import("@/components/settings/server-settings-modal");
	return { default: module.ServerSettingsModal };
});

function preloadSettingsModal() {
	void import("@/components/settings/settings-modal");
}

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
	{ label: string; dot: string }
> = {
	online: { label: "Online", dot: PRESENCE_DOT.online },
	away: { label: "Away", dot: PRESENCE_DOT.away },
	invisible: { label: "Invisible", dot: PRESENCE_DOT.offline },
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
			toast.error("Failed to update status");
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

	const content = (
		<div
			className={cn(
				"flex h-14 min-w-0 items-center gap-2 rounded-lg px-2 text-sidebar-accent-foreground",
				"group-data-[collapsible=icon]:h-auto group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:bg-transparent group-data-[collapsible=icon]:px-0",
			)}
		>
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<button
						type="button"
						aria-label="Change status"
						className="flex min-w-0 flex-1 items-center gap-3 rounded-md py-1 text-left outline-none transition-colors hover:bg-sidebar-accent focus:outline-none focus-visible:ring-0 group-data-[collapsible=icon]:size-9 group-data-[collapsible=icon]:flex-none group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:p-0"
					>
						<span className="relative shrink-0">
							<UserAvatar
								name={session.user.name}
								image={avatarImage}
								className="size-9"
								fallbackClassName="text-xs"
							/>
							<span
								className={cn(
									"absolute right-0 bottom-0 size-3 rounded-full ring-2 ring-sidebar",
									statusMeta.dot,
								)}
							/>
						</span>

						<div className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
							<p className="truncate font-medium text-sm leading-5">
								{session.user.name}
							</p>
							<p className="truncate text-sidebar-foreground/65 text-xs leading-4">
								{statusMeta.label}
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
						<DropdownMenuSub>
							<DropdownMenuSubTrigger>
								<StatusDot status={status} />
								{statusMeta.label}
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
											{STATUS_META[nextStatus].label}
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
				aria-label="Settings"
				title="Settings"
				onPointerEnter={preloadSettingsModal}
				onClick={() => onOpenSettings("profile")}
				className="size-8 shrink-0 rounded-md text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground focus-visible:ring-0 group-data-[collapsible=icon]:hidden [&_svg]:size-[18px]"
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
				aria-label="Toggle sidebar"
				className="flex size-8 shrink-0 items-center justify-center rounded-md text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
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
	const isSwitchingServer = useIsSwitchingServer();
	const activityRailOpen = useActivityRailOpen();
	const [activeSettings, setActiveSettings] = useState<SettingsSection | null>(
		null,
	);
	const [activeOrgSettings, setActiveOrgSettings] =
		useState<OrgSettingsSection | null>(null);
	const scrollContainerRef = useRef<HTMLElement | null>(null);

	// Drop any persisted cache that belongs to a different server (e.g. switched
	// on another device, then this tab reloaded). Same-server reloads keep theirs.
	useMountEffect(() => {
		reconcilePersistedServer(session?.session.activeOrganizationId ?? null);
	});

	// Restore the persisted Activity rail state once on mount (avoids an SSR
	// hydration mismatch from reading localStorage during render).
	useMountEffect(() => {
		hydrateActivityRail();
	});

	const openSettings = (section: SettingsSection) => setActiveSettings(section);
	const closeSettings = () => setActiveSettings(null);
	const openOrgSettings = (section: OrgSettingsSection) =>
		setActiveOrgSettings(section);
	const closeOrgSettings = () => setActiveOrgSettings(null);

	// The dashboard scrolls inside <main>, not the window, so the router's
	// default scroll-to-top on navigation doesn't reach it (scrollRestoration
	// was removed for performance — its scroll tracking was costly).
	useMountEffect(() =>
		router.subscribe("onResolved", ({ pathChanged }) => {
			if (pathChanged) {
				scrollContainerRef.current?.scrollTo({ top: 0 });
			}
		}),
	);

	return (
		<SettingsModalProvider value={{ openSettings, openOrgSettings }}>
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
							<header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-3 border-border/40 bg-background px-4 lg:px-6">
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

								<div className="ml-auto flex shrink-0 items-center gap-2">
									<Button
										variant="ghost"
										size="icon-lg"
										aria-label="Downloads"
										title="Downloads"
										asChild
										className="rounded-full text-muted-foreground [&_svg]:size-[18px]"
									>
										<Link to="/dashboard/downloads">
											<ArrowDownToLine />
										</Link>
									</Button>
									<Button
										type="button"
										variant="ghost"
										size="icon-lg"
										aria-label="Notifications"
										title="Notifications"
										className="rounded-full text-muted-foreground [&_svg]:size-[18px]"
									>
										<Bell />
									</Button>
								</div>
							</header>

							{/* Home shows its own full offline notice */}
							{location.pathname !== "/dashboard" && <OfflineBanner />}

							<div className="flex min-h-0 flex-1">
								<main
									ref={scrollContainerRef}
									className="min-w-0 flex-1 overflow-y-auto pb-14 md:pb-0"
								>
									<Outlet />
								</main>

								<ActivityRail
									open={activityRailOpen}
									onOpen={() => setActivityRailOpen(true)}
									onClose={() => setActivityRailOpen(false)}
								/>
							</div>

							<MobileBottomNav />

							{isSwitchingServer && <ServerSwitchOverlay />}
						</SidebarInset>
					</SidebarProvider>

					<MiniPlayer />

					{activeSettings && (
						<Suspense fallback={null}>
							<SettingsModal
								section={activeSettings}
								onNavigate={openSettings}
								onClose={closeSettings}
							/>
						</Suspense>
					)}

					{activeOrgSettings && (
						<Suspense fallback={null}>
							<ServerSettingsModal
								section={activeOrgSettings}
								onNavigate={openOrgSettings}
								onClose={closeOrgSettings}
							/>
						</Suspense>
					)}
				</div>
			</ScrollContainerProvider>
		</SettingsModalProvider>
	);
}
