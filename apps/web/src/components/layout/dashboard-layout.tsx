import { Link, Outlet, useLocation } from "@tanstack/react-router";
import { Menu } from "lucide-react";
import { lazy, Suspense, useRef, useState } from "react";
import { MiniPlayer } from "@/components/audio-player/mini-player";
import { DashboardSidebarNav } from "@/components/dashboard/dashboard-sidebar-nav";
import { MobileBottomNav } from "@/components/dashboard/mobile-bottom-nav";
import { ScrollContainerProvider } from "@/components/layout/scroll-container-context";
import { ThemeToggleButton } from "@/components/shared/theme-toggle";
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
	const [shouldRenderDeferredUi, setShouldRenderDeferredUi] = useState(false);
	const scrollContainerRef = useRef<HTMLElement | null>(null);
	useTaskEvents();

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

	// Settings is a standalone full-screen page (modal.com-style) — it brings its
	// own left nav, so skip the dashboard sidebar/header chrome entirely.
	if (location.pathname.startsWith("/dashboard/settings")) {
		return (
			<>
				<Outlet />
				<MiniPlayer />
			</>
		);
	}

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

							<Suspense fallback={<DashboardHeaderSearchShell />}>
								<DashboardHeaderSearch />
							</Suspense>

							<div className="flex shrink-0 items-center gap-2">
								<ThemeToggleButton />
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
							data-scroll-restoration-id="dashboard-main"
							className="w-full min-w-0 flex-1 overflow-y-auto pb-14 md:pb-0"
						>
							<Outlet />
						</main>

						<MobileBottomNav />
					</SidebarInset>
				</SidebarProvider>

				<MiniPlayer />
			</div>
		</ScrollContainerProvider>
	);
}
