import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import SignInForm from "@/components/forms/sign-in-form";
import SignUpForm from "@/components/forms/sign-up-form";

export const Route = createFileRoute("/login")({
	component: RouteComponent,
});

function RouteComponent() {
	const [showSignIn, setShowSignIn] = useState(false);

	return showSignIn ? (
		<SignInForm onSwitchToSignUp={() => setShowSignIn(false)} />
	) : (
		<SignUpForm onSwitchToSignIn={() => setShowSignIn(true)} />
	);
}
