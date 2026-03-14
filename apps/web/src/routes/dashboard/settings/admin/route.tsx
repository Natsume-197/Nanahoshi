import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/dashboard/settings/admin")({
	component: () => <Outlet />,
	beforeLoad: ({ context }) => {
		const session = context.session;
		if (!session) {
			throw redirect({ to: "/login" });
		}
		if (session.user.role !== "admin") {
			throw redirect({ to: "/dashboard" });
		}
		return { session };
	},
});
