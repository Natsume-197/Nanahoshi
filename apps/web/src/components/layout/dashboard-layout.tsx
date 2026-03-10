import { Link, Outlet, useLocation } from "@tanstack/react-router";
import { ChevronsLeft, ChevronsRight } from "lucide-react";
import { lazy, Suspense, useEffect, useState } from "react";
import { DashboardSidebarNav } from "@/components/dashboard/dashboard-sidebar-nav";
import { Logo, LogoIcon } from "@/components/shared/logo";
import {
	Sidebar,
	SidebarFooter,
	SidebarHeader,
	SidebarInset,
	SidebarProvider,
	SidebarTrigger,
	useSidebar,
} from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { useTaskEvents } from "@/hooks/use-task-events";
import { OrgSwitcher } from "@/components/dashboard/org-switcher";

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
		<SidebarFooter className="gap-1 p-2">
			<div className="group-data-[collapsible=icon]:hidden">
				<OrgSwitcher />
			</div>
			<button
				type="button"
				onClick={toggleSidebar}
				className="flex h-8 w-full items-center justify-center rounded-md text-sidebar-foreground/50 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
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

	useEffect(() => {
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
	}, []);

	if (location.pathname.endsWith("/read")) {
		return <Outlet />;
	}

	return (
		<SidebarProvider>
			<Sidebar collapsible="icon">
				<SidebarHeader className="h-14 flex-row items-center border-sidebar-border border-b px-[14px]">
					<Link to="/dashboard" className="flex items-center gap-2">
						<LogoIcon className="size-5 shrink-0" />
						<Logo className="h-5 group-data-[collapsible=icon]:hidden" />
					</Link>
				</SidebarHeader>

				<DashboardSidebarNav
					locationPathname={location.pathname}
					onNavigate={() => { }}
				/>

				<SidebarFooterSection />
			</Sidebar>

			<SidebarInset>
				<header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-3 border-border/40 border-b bg-[var(--header,var(--background))] px-4 lg:px-6">
					<SidebarTrigger className="md:hidden" />

					<Suspense fallback={<DashboardHeaderSearchShell />}>
						<DashboardHeaderSearch />
					</Suspense>

					<div className="shrink-0" onPointerEnter={preloadDashboardUserMenu}>
						{shouldRenderDeferredUi ? (
							<Suspense fallback={<DashboardUserMenuShell />}>
								<DashboardUserMenu collapsed />
							</Suspense>
						) : (
							<DashboardUserMenuShell />
						)}
					</div>
				</header>

				<main className="min-w-0 flex-1 overflow-y-auto bg-[length:100%_400px] bg-gradient-to-b from-muted/30 to-transparent bg-no-repeat">
					<Outlet />
				</main>
			</SidebarInset>
		</SidebarProvider>
	);
}
