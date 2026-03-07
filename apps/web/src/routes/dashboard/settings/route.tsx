import {
	createFileRoute,
	Link,
	Outlet,
	redirect,
	useLocation,
} from "@tanstack/react-router";
import { Library, Palette, Shield, User } from "lucide-react";
import { getUser } from "@/functions/get-user";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/dashboard/settings")({
	component: SettingsLayout,
	beforeLoad: async () => {
		const session = await getUser();
		if (!session) {
			throw redirect({ to: "/login" });
		}
		return { session };
	},
});

const navItems = [
	{ label: "General", to: "/dashboard/settings", icon: User },
	{ label: "Libraries", to: "/dashboard/settings/libraries", icon: Library },
	{
		label: "Appearance",
		to: "/dashboard/settings/appearance",
		icon: Palette,
	},
	{
		label: "Account",
		to: "/dashboard/settings/account",
		icon: Shield,
	},
] as const;

function SettingsLayout() {
	const { pathname } = useLocation();

	return (
		<div className="mx-auto max-w-7xl p-6 lg:p-8">
			<div className="mb-8">
				<h1 className="font-bold text-2xl tracking-tight">Settings</h1>
				<p className="text-muted-foreground text-sm">
					Manage your account and preferences
				</p>
			</div>

			<div className="flex flex-col gap-8 md:flex-row">
				{/* Desktop sidebar nav */}
				<nav className="hidden shrink-0 md:block md:w-44">
					<ul className="space-y-1">
						{navItems.map((item) => {
							const isActive =
								item.to === "/dashboard/settings"
									? pathname === "/dashboard/settings" ||
										pathname === "/dashboard/settings/"
									: pathname.startsWith(item.to);

							return (
								<li key={item.to}>
									<Link
										to={item.to}
										className={cn(
											"flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors",
											isActive
												? "bg-accent font-medium text-foreground"
												: "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
										)}
									>
										<item.icon className="size-4" />
										{item.label}
									</Link>
								</li>
							);
						})}
					</ul>
				</nav>

				{/* Mobile horizontal nav */}
				<nav className="flex gap-1 overflow-x-auto border-border border-b pb-2 md:hidden">
					{navItems.map((item) => {
						const isActive =
							item.to === "/dashboard/settings"
								? pathname === "/dashboard/settings" ||
									pathname === "/dashboard/settings/"
								: pathname.startsWith(item.to);

						return (
							<Link
								key={item.to}
								to={item.to}
								className={cn(
									"flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors",
									isActive
										? "bg-accent font-medium text-foreground"
										: "text-muted-foreground hover:text-foreground",
								)}
							>
								<item.icon className="size-4" />
								{item.label}
							</Link>
						);
					})}
				</nav>

				{/* Content */}
				<div className="min-w-0 flex-1">
					<Outlet />
				</div>
			</div>
		</div>
	);
}
