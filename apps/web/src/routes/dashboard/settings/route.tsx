import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { SettingsSidebarNav } from "@/components/settings/settings-sidebar-nav";
import { getUser } from "@/functions/get-user";

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

function SettingsLayout() {
	const { session } = Route.useRouteContext();
	const isAdmin = session.user.role === "admin";
	const hasOrg = !!session.session.activeOrganizationId;

	return (
		<div className="mx-auto max-w-7xl p-6 lg:p-8">
			<div className="flex flex-col gap-8 md:flex-row">
				<SettingsSidebarNav isAdmin={isAdmin} hasOrg={hasOrg} />

				<div className="min-w-0 flex-1">
					<Outlet />
				</div>
			</div>
		</div>
	);
}
