import { Link, Outlet, useLocation } from "@tanstack/react-router";
import { ChevronsLeft, ChevronsRight } from "lucide-react";
import { lazy, Suspense, useState } from "react";
import { MiniPlayer } from "@/components/audio-player/mini-player";
import { DashboardSidebarNav } from "@/components/dashboard/dashboard-sidebar-nav";
import { MobileBottomNav } from "@/components/dashboard/mobile-bottom-nav";
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
		<Skeleton className="size-8 rounded-full border border-border/50 bg-muted/30" />
	);
}

function SidebarFooterSection() {
	const { state, toggleSidebar } = useSidebar();
	const collapsed = state === "collapsed";

	return (
		<SidebarFooter className="p-2">
			<button
				type="button"
				onClick={toggleSidebar}
				className="flex h-8 w-full items-center justify-center text-sidebar-foreground/50 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
				aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
			>
				{collapsed ? (
					<ChevronsRight className="size-4" />
				) : (
					<ChevronsLeft className="size-4" />
				)}
			</button>
		</SidebarFooter>
	);
}

export function DashboardLayout() {
	const location = useLocation();
	const [shouldRenderDeferredUi, setShouldRenderDeferredUi] = useState(false);
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

	return (
		<div className="md:flex md:h-svh md:flex-col">
			<SidebarProvider className="md:min-h-0 md:flex-1 md:[transform:translateZ(0)]">
				<Sidebar collapsible="icon">
					<SidebarHeader className="h-14 flex-row items-center border-sidebar-border px-4">
						<Link to="/dashboard" className="flex items-center gap-3">
							<span className="font-semibold text-lg leading-none">
								七
							</span>
							<span className="font-semibold text-[15px] tracking-wide group-data-[collapsible=icon]:hidden">
								Nanahoshi
							</span>
						</Link>
					</SidebarHeader>

					<DashboardSidebarNav
						locationPathname={location.pathname}
						onNavigate={() => {}}
					/>

					<SidebarFooterSection />
				</Sidebar>

				<SidebarInset className="md:min-h-0">
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

						<div
							className="hidden shrink-0 md:block"
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
					</header>

					<main className="w-full min-w-0 flex-1 overflow-y-auto pb-14 md:pb-0">
						<Outlet />
					</main>

					<MobileBottomNav />
				</SidebarInset>
			</SidebarProvider>

			<MiniPlayer />
		</div>
	);
}
