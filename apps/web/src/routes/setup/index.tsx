import { createFileRoute, redirect } from "@tanstack/react-router";
import { SetupFlow } from "@/components/onboarding/setup-flow";
import { reachServer } from "@/lib/auth-session-error";
import { client } from "@/utils/orpc";

export const Route = createFileRoute("/setup/")({
	beforeLoad: async () => {
		const { configured } = await reachServer(() => client.setup.ssoStatus());
		if (configured) {
			throw redirect({
				to: "/dashboard",
			});
		}
	},
	component: SetupFlow,
});
