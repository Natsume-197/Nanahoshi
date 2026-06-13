import { createFileRoute, redirect } from "@tanstack/react-router";
import { DiscordAccessRules } from "@/components/settings/sections/discord";
import { client } from "@/utils/orpc";

export const Route = createFileRoute(
	"/dashboard/settings/organization/discord",
)({
	component: DiscordAccessRules,
	beforeLoad: async ({ context }) => {
		const session = context.session;
		if (!session) {
			throw redirect({ to: "/login" });
		}
		// System admins always pass
		if (session.user.role === "admin") return;

		const orgId = session.session.activeOrganizationId;
		if (!orgId) {
			throw redirect({ to: "/dashboard/settings/organization/general" });
		}

		// Check org membership role
		try {
			const { role } = await client.users.getMyRole();
			if (role !== "admin" && role !== "owner") {
				throw redirect({ to: "/dashboard/settings/organization/general" });
			}
		} catch {
			throw redirect({ to: "/dashboard/settings/organization/general" });
		}
	},
});
