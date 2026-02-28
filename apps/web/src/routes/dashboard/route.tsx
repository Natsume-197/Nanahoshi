import {
	createFileRoute,
	Link,
	Outlet,
	useLocation,
} from "@tanstack/react-router";
import { Home, Menu, Search, Settings, Shield, User, X } from "lucide-react";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { Logo, LogoIcon } from "@/components/logo";
import { OrgSwitcher } from "@/components/org-switcher";
import { Button } from "@/components/ui/button";
import { UserMenu } from "@/components/user-menu";

export const Route = createFileRoute("/dashboard")({
	component: DashboardLayout,
});

const navItems = [
	{ to: "/dashboard", label: "Home", icon: Home, exact: true },
	{ to: "/dashboard/search", label: "Search", icon: Search },
	{ to: "/dashboard/profile", label: "Profile", icon: User },
	{ to: "/dashboard/settings", label: "Settings", icon: Settings },
] as const;

function DashboardLayout() {
	const [sidebarOpen, setSidebarOpen] = useState(false);
	const location = useLocation();
	const { data: session } = authClient.useSession();

	// Reader pages get full viewport — no sidebar or header
	if (location.pathname.endsWith("/read")) {
		return <Outlet />;
	}

	return (
		<div className="flex h-screen overflow-hidden bg-background">
			{/* Mobile overlay */}
			{sidebarOpen && (
				<div
					className="fixed inset-0 z-40 bg-black/50 lg:hidden"
					onClick={() => setSidebarOpen(false)}
					onKeyDown={() => {}}
				/>
			)}

			{/* Sidebar */}
			<aside
				className={`fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r bg-card transition-transform duration-200 lg:static lg:translate-x-0 ${
					sidebarOpen ? "translate-x-0" : "-translate-x-full"
				}`}
			>
				{/* Logo */}
				<div className="flex h-16 items-center gap-2 px-5">
					<Link to="/dashboard" className="flex items-center gap-2">
						<LogoIcon className="size-6" />
						<Logo className="h-5" />
					</Link>
					<button
						type="button"
						className="ml-auto lg:hidden"
						onClick={() => setSidebarOpen(false)}
					>
						<X className="size-5" />
					</button>
				</div>

				{/* Org switcher */}
				<div className="px-3 py-2">
					<OrgSwitcher />
				</div>

				{/* Navigation */}
				<nav className="flex-1 space-y-1 px-3 py-2">
					{navItems.map(({ to, label, icon: Icon, ...rest }) => {
						const exact = "exact" in rest && rest.exact;
						const isActive = exact
							? location.pathname === to
							: location.pathname.startsWith(to);

						return (
							<Link
								key={to}
								to={to}
								onClick={() => setSidebarOpen(false)}
								className={`flex items-center gap-3 rounded-md px-3 py-2.5 font-medium text-sm transition-colors ${
									isActive
										? "bg-accent text-accent-foreground"
										: "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
								}`}
							>
								<Icon className="size-5" />
								{label}
							</Link>
						);
					})}
					{session?.user.role === "admin" && (
						<Link
							to="/dashboard/admin"
							onClick={() => setSidebarOpen(false)}
							className={`flex items-center gap-3 rounded-md px-3 py-2.5 font-medium text-sm transition-colors ${
								location.pathname.startsWith("/dashboard/admin")
									? "bg-accent text-accent-foreground"
									: "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
							}`}
						>
							<Shield className="size-5" />
							Admin
						</Link>
					)}
				</nav>

				{/* Bottom section */}
				<div className="border-t p-3">
					<UserMenu />
				</div>
			</aside>

			{/* Main content */}
			<div className="flex flex-1 flex-col overflow-hidden">
				{/* Mobile header */}
				<header className="flex h-14 items-center gap-3 border-b px-4 lg:hidden">
					<Button
						variant="outline"
						size="icon"
						onClick={() => setSidebarOpen(true)}
					>
						<Menu className="size-5" />
					</Button>
					<LogoIcon className="size-5" />
				</header>

				{/* Page content */}
				<main className="flex-1 overflow-y-auto">
					<Outlet />
				</main>
			</div>
		</div>
	);
}
