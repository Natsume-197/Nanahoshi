import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/dashboard/settings/admin/organizations")(
	{
		component: () => <Outlet />,
	},
);
