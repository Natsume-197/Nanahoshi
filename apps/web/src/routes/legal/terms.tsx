import { createFileRoute, redirect } from "@tanstack/react-router";
import { LegalPage } from "@/features/legal/legal-page";
import { client } from "@/utils/orpc";

export const Route = createFileRoute("/legal/terms")({
	// An admin who points TERMS_URL at their own document gets it instead.
	beforeLoad: async () => {
		const sso = await client.setup.ssoStatus().catch(() => null);
		const external = sso?.legal.terms;
		if (external) throw redirect({ href: external });
	},
	component: () => <LegalPage kind="terms" />,
});
