import { Link, Outlet, useLocation } from "@tanstack/react-router";
import { ChevronsLeft, ChevronsRight, Menu, X } from "lucide-react";
import { lazy, Suspense, useEffect, useState } from "react";
import { DashboardSidebarNav } from "@/components/dashboard/dashboard-sidebar-nav";
import { Logo, LogoIcon } from "@/components/shared/logo";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

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

export function DashboardLayout() {
	const [sidebarOpen, setSidebarOpen] = useState(false);
	const [collapsed, setCollapsed] = useState(false);
	const [shouldRenderDeferredUi, setShouldRenderDeferredUi] = useState(false);
	const location = useLocation();

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

	// Reader pages get full viewport with no sidebar or header.
	if (location.pathname.endsWith("/read")) {
		return <Outlet />;
	}

	return (
		<div className="flex h-screen flex-col overflow-hidden bg-background">
			<header className="z-30 flex h-14 shrink-0 items-center gap-3 border-border/40 border-b px-4 lg:px-6">
				<Button
					variant="outline"
					size="icon"
					className="lg:hidden"
					onClick={() => setSidebarOpen(true)}
				>
					<Menu className="size-5" />
				</Button>
				<LogoIcon className="size-5 lg:hidden" />
				<Link
					to="/dashboard"
					className="hidden shrink-0 items-center gap-2 lg:flex"
				>
					<LogoIcon className="size-5 shrink-0" />
					<Logo className="h-5" />
				</Link>

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

			<div className="relative flex min-h-0 flex-1 overflow-hidden">
				{sidebarOpen && (
					<button
						type="button"
						aria-label="Close sidebar"
						className="fixed inset-x-0 top-14 bottom-0 z-40 border-0 bg-black/50 lg:hidden"
						onClick={() => setSidebarOpen(false)}
					/>
				)}

				{sidebarOpen && (
					<aside className="fixed top-14 bottom-0 left-0 z-50 flex w-64 flex-col border-sidebar-border border-r bg-sidebar transition-transform duration-150 lg:hidden">
						<div className="flex h-14 items-center justify-between border-sidebar-border border-b px-4">
							<Link
								to="/dashboard"
								onClick={() => setSidebarOpen(false)}
								className="flex items-center gap-2"
							>
								<LogoIcon className="size-5 shrink-0" />
								<Logo className="h-5" />
							</Link>
							<button type="button" onClick={() => setSidebarOpen(false)}>
								<X className="size-5" />
							</button>
						</div>
						<div className="min-h-0 flex-1">
							<DashboardSidebarNav
								collapsed={false}
								locationPathname={location.pathname}
								onNavigate={() => setSidebarOpen(false)}
							/>
						</div>
					</aside>
				)}

				<aside
					className={`hidden h-full shrink-0 flex-col overflow-hidden border-sidebar-border border-r bg-sidebar transition-[width] duration-[180ms] ease-out lg:flex ${
						collapsed ? "w-16" : "w-64"
					}`}
				>
					<div className="min-h-0 flex-1">
						<DashboardSidebarNav
							collapsed={collapsed}
							locationPathname={location.pathname}
							onNavigate={() => setSidebarOpen(false)}
						/>
					</div>

					<div
						className={`hidden border-sidebar-border border-t p-2 lg:block ${
							collapsed ? "px-2" : "px-3"
						}`}
					>
						<button
							type="button"
							onClick={() => setCollapsed(!collapsed)}
							className="flex h-9 w-full items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
							title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
						>
							{collapsed ? (
								<ChevronsRight className="size-4" />
							) : (
								<ChevronsLeft className="size-4" />
							)}
						</button>
					</div>
				</aside>

				<main className="min-w-0 flex-1 overflow-y-auto bg-[length:100%_300px] bg-gradient-to-b from-muted/20 to-transparent bg-no-repeat">
					<Outlet />
				</main>
			</div>
		</div>
	);
}
