import { createFileRoute, redirect } from "@tanstack/react-router";
import { WelcomeFlow } from "@/components/onboarding/welcome-flow";

export const Route = createFileRoute("/welcome")({
	beforeLoad: ({ context }) => {
		if (!context.session) throw redirect({ to: "/login" });
	},
	component: WelcomeFlow,
});
