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
		<div className="flex min-h-svh flex-col md:flex-row">
			<div className="shrink-0 p-4 md:sticky md:top-0 md:h-svh md:w-64 md:overflow-y-auto md:border-border md:border-r md:px-5 md:py-6">
				<SettingsSidebarNav
					isAdmin={isAdmin}
					hasOrg={hasOrg}
					isOrgAdmin={isOrgAdmin}
				/>
			</div>

			<main className="min-w-0 flex-1 md:h-svh md:overflow-y-auto">
				<div className="mx-auto max-w-4xl px-6 py-8 lg:px-10 lg:py-12">
					<Outlet />
				</div>
			</main>
		</div>
	);
}
