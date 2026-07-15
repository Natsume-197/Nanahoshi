import { createFileRoute, redirect } from "@tanstack/react-router";
import { z } from "zod";

import { SignInForm } from "@/components/forms/sign-in-form";
import { client } from "@/utils/orpc";

export const Route = createFileRoute("/login")({
	validateSearch: z.object({
		redirect: z.string().startsWith("/").optional().catch(undefined),
	}),
	beforeLoad: async ({ context, search }) => {
		if (context.session) {
			if (search.redirect) throw redirect({ href: search.redirect });
			throw redirect({ to: "/dashboard" });
		}
		// A fresh install has no accounts to sign into — go initialize instead.
		if (!(await client.setup.isConfigured())) {
			throw redirect({ to: "/setup" });
		}
	},
	component: RouteComponent,
});

function RouteComponent() {
	const { redirect: redirectTo } = Route.useSearch();
	return <SignInForm redirectTo={redirectTo} onSwitchToSignUp={() => {}} />;
}
