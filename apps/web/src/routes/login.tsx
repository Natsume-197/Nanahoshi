import { createFileRoute, redirect } from "@tanstack/react-router";
import { z } from "zod";

import { SignInForm } from "@/components/forms/sign-in-form";

export const Route = createFileRoute("/login")({
	validateSearch: z.object({
		redirect: z.string().startsWith("/").optional().catch(undefined),
	}),
	beforeLoad: ({ context, search }) => {
		if (context.session) {
			if (search.redirect) throw redirect({ href: search.redirect });
			throw redirect({ to: "/dashboard" });
		}
	},
	component: RouteComponent,
});

function RouteComponent() {
	const { redirect: redirectTo } = Route.useSearch();
	return <SignInForm redirectTo={redirectTo} onSwitchToSignUp={() => {}} />;
}
