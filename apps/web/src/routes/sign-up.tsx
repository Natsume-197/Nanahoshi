import { createFileRoute, redirect } from "@tanstack/react-router";
import { z } from "zod";
import { SignUpForm } from "@/components/forms/sign-up-form";

export const Route = createFileRoute("/sign-up")({
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
	return <SignUpForm redirectTo={redirectTo} onSwitchToSignIn={() => {}} />;
}
