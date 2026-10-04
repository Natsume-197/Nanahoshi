import { Redirect } from "expo-router";
import { useServer } from "@/providers/app-provider";
import { SignIn } from "@/screens/auth/sign-in";

export default function SignInRoute() {
	const { serverUrl } = useServer();
	if (!serverUrl) return <Redirect href="/connect" />;
	return <SignIn />;
}
