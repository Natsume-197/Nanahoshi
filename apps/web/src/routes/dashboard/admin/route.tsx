import {
	createFileRoute,
	Link,
	Outlet,
	redirect,
	useLocation,
} from "@tanstack/react-router";
import { getUser } from "@/functions/get-user";

export const Route = createFileRoute("/dashboard/admin")({
	component: AdminLayout,
	beforeLoad: async () => {
		const session = await getUser();
		if (!session) {
			throw redirect({ to: "/login" });
		}
		if (session.user.role !== "admin") {
			throw redirect({ to: "/dashboard" });
		}
		return { session };
	},
});

const tabs = [
	{ to: "/dashboard/admin", label: "Overview", exact: true },
	{ to: "/dashboard/admin/users", label: "Users" },
	{ to: "/dashboard/admin/organizations", label: "Organizations" },
] as const;

function AdminLayout() {
	const location = useLocation();

	return (
		<div className="space-y-6 p-6 lg:p-8">
			<div>
				<h1 className="font-bold text-2xl tracking-tight">Admin</h1>
				<p className="text-muted-foreground text-sm">
					Manage users, organizations, and system settings
				</p>
			</div>

			<nav className="flex gap-1 border-b">
				{tabs.map(({ to, label, ...rest }) => {
					const exact = "exact" in rest && rest.exact;
					const isActive = exact
						? location.pathname === to
						: location.pathname.startsWith(to);

					return (
						<Link
							key={to}
							to={to}
							className={`border-b-2 px-4 py-2 font-medium text-sm transition-colors ${
								isActive
									? "border-foreground text-foreground"
									: "border-transparent text-muted-foreground hover:text-foreground"
							}`}
						>
							{label}
						</Link>
					);
				})}
			</nav>

			<Outlet />
		</div>
	);
}
