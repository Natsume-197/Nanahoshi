import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * Likes moved onto the profile as a tab, so this route only forwards old links
 * and bookmarks. Without a username `/dashboard/profile` resolves one and
 * redirects, landing on the profile without the tab preselected.
 */
export const Route = createFileRoute("/dashboard/likes")({
	component: () => null,
	beforeLoad: ({ context }) => {
		const session = context.session;
		if (!session) {
			throw redirect({ to: "/login" });
		}

		const username = (session.user as { username?: string }).username?.trim();
		throw redirect(
			username
				? {
						to: "/dashboard/user/$username",
						params: { username },
						search: { tab: "likes" as const },
					}
				: { to: "/dashboard/profile" },
		);
	},
});
