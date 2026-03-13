import { createFileRoute, redirect } from "@tanstack/react-router";
import { SignUpForm } from "@/components/forms/sign-up-form";

export const Route = createFileRoute("/sign-up")({
	beforeLoad: ({ context }) => {
		if (context.session) {
			throw redirect({ to: "/dashboard" });
		}
	},
	component: RouteComponent,
});

function RouteComponent() {
	return <SignUpForm onSwitchToSignIn={() => {}} />;
}
