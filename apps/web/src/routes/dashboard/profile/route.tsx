import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/dashboard/profile")({
	component: () => null,
	beforeLoad: ({ context }) => {
		const session = context.session;
		if (!session) {
			throw redirect({ to: "/login" });
		}
		// Redirect to the username-based profile URL
		const username = (session.user as { username?: string }).username;
		if (username) {
			throw redirect({
				to: "/dashboard/user/$username",
				params: { username },
			});
		}
		return { session };
	},
});
