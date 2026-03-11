import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";


export const Route = createFileRoute("/dashboard/profile")({
	component: () => <Outlet />,
	beforeLoad: ({ context }) => {
		const session = context.session;
		if (!session) {
			throw redirect({ to: "/login" });
		}
		return { session };
	},
});
