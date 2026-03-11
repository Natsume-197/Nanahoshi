import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { getUser } from "@/functions/get-user";

export const Route = createFileRoute("/dashboard/settings/organization")({
	component: () => <Outlet />,
	beforeLoad: async () => {
		const session = await getUser();
		if (!session?.session.activeOrganizationId) {
			throw redirect({ to: "/dashboard/settings/profile" });
		}
	},
});
