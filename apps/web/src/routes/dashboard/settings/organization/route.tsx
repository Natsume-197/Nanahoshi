import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/dashboard/settings/organization")({
	component: () => <Outlet />,
	beforeLoad: ({ context }) => {
		if (!context.session?.session.activeOrganizationId) {
			throw redirect({ to: "/dashboard/settings/profile" });
		}
	},
});
