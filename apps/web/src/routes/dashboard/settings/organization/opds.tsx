import { createFileRoute, redirect } from "@tanstack/react-router";
import { OpdsSettings } from "@/components/settings/sections/opds";

export const Route = createFileRoute("/dashboard/settings/organization/opds")({
	component: OpdsSettings,
	beforeLoad: async ({ context }) => {
		if (!context.session) {
			throw redirect({ to: "/login" });
		}
	},
});
