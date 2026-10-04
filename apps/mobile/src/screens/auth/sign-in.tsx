import { router } from "expo-router";
import { useRef, useState } from "react";
import { type TextInput, View } from "react-native";
import { PillButton } from "@/components/pill-button";
import { Text } from "@/components/text";
import { TextField } from "@/components/text-field";
import { t } from "@/lib/i18n";
import { useConnection } from "@/providers/app-provider";
import { SetupStep } from "@/screens/setup/scaffold";
import { space } from "@/theme";

/** "Continue with email" (Fable, Matter): the two fields and nothing else;
 * the providers and the server live on the welcome screen. The action rides
 * the keyboard and is live once both fields have something in them. */
export function SignIn() {
	const { auth } = useConnection();
	const identifierRef = useRef("");
	const passwordRef = useRef("");
	const passwordInput = useRef<TextInput>(null);
	const [filled, setFilled] = useState({ identifier: false, password: false });
	const [error, setError] = useState<string | null>(null);
	const [pending, setPending] = useState(false);
	const ready = filled.identifier && filled.password;

	const submit = async () => {
		const identifier = identifierRef.current.trim();
		const password = passwordRef.current;
		if (!identifier || !password || pending) return;
		setError(null);
		setPending(true);
		// Same rule as the web login: an @ means email, anything else a username.
		const result = identifier.includes("@")
			? await auth.signIn.email({ email: identifier, password })
			: await auth.signIn.username({ username: identifier, password });
		setPending(false);
		if (result.error) {
			setError(
				result.error.status === 401
					? t("mobile.signin.failed")
					: (result.error.message ?? t("mobile.signin.failed")),
			);
		}
		// Success needs no navigation: the session flips the root guard, which
		// swaps this whole stack for the tabs so back can't return here.
	};

	return (
		<SetupStep
			leading={router.canGoBack() ? "back" : "none"}
			title={t("mobile.signin.title")}
			footer={
				<PillButton
					label={t("auth.sign_in")}
					onPress={submit}
					loading={pending}
					disabled={!ready}
				/>
			}
		>
			<View style={{ gap: space.md }}>
				<TextField
					large
					label={t("mobile.signin.identifier")}
					placeholder={t("mobile.signin.identifier")}
					onChangeText={(text) => {
						identifierRef.current = text;
						setFilled((state) => ({ ...state, identifier: !!text.trim() }));
					}}
					autoCapitalize="none"
					autoCorrect={false}
					autoComplete="username"
					textContentType="username"
					returnKeyType="next"
					onSubmitEditing={() => passwordInput.current?.focus()}
					submitBehavior="submit"
					autoFocus
				/>
				<TextField
					large
					ref={passwordInput}
					label={t("auth.password")}
					placeholder={t("auth.password")}
					onChangeText={(text) => {
						passwordRef.current = text;
						setFilled((state) => ({ ...state, password: !!text }));
					}}
					secureTextEntry
					autoComplete="current-password"
					textContentType="password"
					returnKeyType="go"
					onSubmitEditing={submit}
				/>
				{error ? (
					<Text
						variant="subhead"
						tone="danger"
						selectable
						accessibilityLiveRegion="polite"
					>
						{error}
					</Text>
				) : null}
			</View>
		</SetupStep>
	);
}
