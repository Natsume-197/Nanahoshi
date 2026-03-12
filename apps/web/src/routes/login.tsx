import { createFileRoute, redirect } from "@tanstack/react-router";

import { SignInForm } from "@/components/forms/sign-in-form";

export const Route = createFileRoute("/login")({
	beforeLoad: ({ context }) => {
		if (context.session) {
			throw redirect({ to: "/dashboard" });
		}
	},
	component: RouteComponent,
});

function RouteComponent() {
	return (
		<SignInForm onSwitchToSignUp={() => {}} />
	);
}
