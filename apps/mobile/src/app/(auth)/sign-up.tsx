import { Redirect, useLocalSearchParams } from "expo-router";
import { useServer } from "@/providers/app-provider";
import { SignUp } from "@/screens/auth/sign-up";

export default function SignUpRoute() {
	const { serverUrl } = useServer();
	const { invite } = useLocalSearchParams<{ invite?: string }>();
	if (!serverUrl) return <Redirect href="/connect" />;
	return <SignUp inviteCode={invite} />;
}
