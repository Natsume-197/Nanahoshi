import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { SettingsSidebarNav } from "@/components/settings/settings-sidebar-nav";
import { authClient } from "@/lib/auth-client";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/dashboard/settings")({
	component: SettingsLayout,
	beforeLoad: ({ context }) => {
		const session = context.session;
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

	const { data: org } = authClient.useActiveOrganization();

	const { data: myRoleData } = useQuery({
		...orpc.users.getMyRole.queryOptions(),
		enabled: hasOrg,
	});

	const myRole =
		myRoleData?.role ??
		org?.members.find((m) => m.userId === session.user.id)?.role;
	const isOrgAdmin = isAdmin || myRole === "admin" || myRole === "owner";

	return (
		<div className="mx-auto max-w-7xl p-6 lg:p-8">
			<div className="flex flex-col gap-8 md:flex-row">
				<SettingsSidebarNav
					isAdmin={isAdmin}
					hasOrg={hasOrg}
					isOrgAdmin={isOrgAdmin}
				/>

				<div className="min-w-0 flex-1">
					<Outlet />
				</div>
			</div>
		</div>
	);
}
