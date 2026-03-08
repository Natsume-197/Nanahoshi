import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { getUser } from "@/functions/get-user";

export const Route = createFileRoute("/dashboard/settings/admin")({
	component: () => <Outlet />,
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
