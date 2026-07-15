import { createFileRoute, redirect } from "@tanstack/react-router";
import { z } from "zod";
import { SignUpForm } from "@/components/forms/sign-up-form";
import { client } from "@/utils/orpc";

export const Route = createFileRoute("/sign-up")({
	validateSearch: z.object({
		redirect: z.string().startsWith("/").optional().catch(undefined),
	}),
	beforeLoad: async ({ context, search }) => {
		if (context.session) {
			if (search.redirect) throw redirect({ href: search.redirect });
			throw redirect({ to: "/dashboard" });
		}
		// A fresh install creates its admin through the setup wizard, not here.
		if (!(await client.setup.isConfigured())) {
			throw redirect({ to: "/setup" });
		}
	},
	component: RouteComponent,
});

function RouteComponent() {
	const { redirect: redirectTo } = Route.useSearch();
	return <SignUpForm redirectTo={redirectTo} onSwitchToSignIn={() => {}} />;
}
