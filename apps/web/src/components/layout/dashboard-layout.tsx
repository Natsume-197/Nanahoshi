import {
	Link,
	Outlet,
	useLocation,
	useNavigate,
	useRouter,
	useSearch,
} from "@tanstack/react-router";
import { Menu, Settings } from "lucide-react";
import { lazy, Suspense, useRef, useState } from "react";
import { MiniPlayer } from "@/components/audio-player/mini-player";
import { DashboardSidebarNav } from "@/components/dashboard/dashboard-sidebar-nav";
import { MobileBottomNav } from "@/components/dashboard/mobile-bottom-nav";
import { OrgSwitcher } from "@/components/dashboard/org-switcher";
import { ScrollContainerProvider } from "@/components/layout/scroll-container-context";
import type { SettingsSection } from "@/components/settings/settings-sections";
import { Button } from "@/components/ui/button";
import {
	Sidebar,
	SidebarHeader,
	SidebarInset,
	SidebarProvider,
	useSidebar,
} from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { useMountEffect } from "@/hooks/use-mount-effect";
import { useTaskEvents } from "@/hooks/use-task-events";

const DashboardHeaderSearch = lazy(async () => {
	const module = await import("@/components/dashboard/dashboard-header-search");
	return { default: module.DashboardHeaderSearch };
});

const DashboardUserMenu = lazy(async () => {
	const module = await import("@/components/dashboard/user-menu");
	return { default: module.UserMenu };
});

function preloadDashboardUserMenu() {
	void import("@/components/dashboard/user-menu");
}

const SettingsModal = lazy(async () => {
	const module = await import("@/components/settings/settings-modal");
	return { default: module.SettingsModal };
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

function DashboardUserMenuShell() {
	return (
		<Skeleton className="size-9 rounded-full border border-border/50 bg-muted/30" />
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

export function DashboardLayout({
	defaultSidebarOpen = true,
}: {
	/** Persisted sidebar state read from the cookie on the server (SSR-safe). */
	defaultSidebarOpen?: boolean;
}) {
	const location = useLocation();
	const router = useRouter();
	const navigate = useNavigate();
	const activeSettings = useSearch({
		from: "/dashboard",
		select: (search) => search.settings,
	});
	const [shouldRenderDeferredUi, setShouldRenderDeferredUi] = useState(false);
	const scrollContainerRef = useRef<HTMLElement | null>(null);
	useTaskEvents();

	const openSettings = (section: SettingsSection) => {
		navigate({ to: ".", search: (prev) => ({ ...prev, settings: section }) });
	};
	const closeSettings = () => {
		navigate({
			to: ".",
			search: ({ settings: _drop, ...rest }) => rest,
		});
	};

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

	useMountEffect(() => {
		const idleWindow = window as Window & {
			requestIdleCallback?: (callback: () => void) => number;
			cancelIdleCallback?: (handle: number) => void;
		};
		if (
			typeof idleWindow.requestIdleCallback === "function" &&
			typeof idleWindow.cancelIdleCallback === "function"
		) {
			const idleId = idleWindow.requestIdleCallback(() => {
				setShouldRenderDeferredUi(true);
			});
			return () => {
				idleWindow.cancelIdleCallback?.(idleId);
			};
		}
		const timeoutId = window.setTimeout(() => {
			setShouldRenderDeferredUi(true);
		}, 700);
		return () => {
			window.clearTimeout(timeoutId);
		};
	});

	return (
		<ScrollContainerProvider value={scrollContainerRef}>
			<div className="flex h-svh flex-col">
				<SidebarProvider
					defaultOpen={defaultSidebarOpen}
					className="min-h-0 flex-1 [transform:translateZ(0)]"
				>
					<Sidebar collapsible="icon">
						<SidebarHeaderSection />

						<DashboardSidebarNav
							locationPathname={location.pathname}
							onNavigate={() => {}}
						/>
					</Sidebar>

					<SidebarInset className="min-h-0">
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

							<div className="flex shrink-0 items-center gap-2">
								<Button
									variant="ghost"
									size="icon-lg"
									aria-label="Settings"
									title="Settings"
									onPointerEnter={preloadSettingsModal}
									onClick={() => openSettings("profile")}
									className="rounded-full text-muted-foreground [&_svg]:size-[18px]"
								>
									<Settings />
								</Button>
								<div
									className="hidden md:block"
									onPointerEnter={preloadDashboardUserMenu}
								>
									{shouldRenderDeferredUi ? (
										<Suspense fallback={<DashboardUserMenuShell />}>
											<DashboardUserMenu collapsed />
										</Suspense>
									) : (
										<DashboardUserMenuShell />
									)}
								</div>
							</div>
						</header>

						<main
							ref={scrollContainerRef}
							className="w-full min-w-0 flex-1 overflow-y-auto pb-14 md:pb-0"
						>
							<Outlet />
						</main>

						<MobileBottomNav />
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
			</div>
		</ScrollContainerProvider>
	);
}
