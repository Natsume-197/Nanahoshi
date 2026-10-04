import { router } from "expo-router";
import { useRef, useState } from "react";
import { Pressable, type TextInput, View } from "react-native";
import { PrimaryButton } from "@/components/button";
import { Text } from "@/components/text";
import { TextField } from "@/components/text-field";
import { t } from "@/lib/i18n";
import { useConnection } from "@/providers/app-provider";
import { space } from "@/theme";
import { AuthScaffold } from "./auth-scaffold";

export function SignIn() {
	const { auth, serverUrl } = useConnection();
	const identifierRef = useRef("");
	const passwordRef = useRef("");
	const passwordInput = useRef<TextInput>(null);
	const [error, setError] = useState<string | null>(null);
	const [pending, setPending] = useState(false);

	const submit = async () => {
		const identifier = identifierRef.current.trim();
		const password = passwordRef.current;
		if (!identifier || !password) return;
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

	const host = serverUrl.replace(/^https?:\/\//, "");

	return (
		<AuthScaffold
			title={t("auth.welcome_back")}
			lead={`${t("auth.sign_in_subtitle")}\n${host}`}
		>
			<View style={{ gap: space.lg }}>
				<TextField
					label={t("mobile.signin.identifier")}
					placeholder={t("auth.email_placeholder")}
					onChangeText={(text) => {
						identifierRef.current = text;
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
					ref={passwordInput}
					label={t("auth.password")}
					placeholder={t("auth.password_placeholder")}
					onChangeText={(text) => {
						passwordRef.current = text;
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
				<PrimaryButton
					label={pending ? t("auth.signing_in") : t("auth.sign_in")}
					onPress={submit}
					loading={pending}
				/>
				<Pressable
					onPress={() => router.push("/connect")}
					accessibilityRole="link"
					style={({ pressed }) => ({
						alignSelf: "center",
						padding: space.md,
						opacity: pressed ? 0.6 : 1,
					})}
				>
					<Text
						variant="subhead"
						tone="secondary"
						style={{ fontWeight: "600" }}
					>
						{t("mobile.signin.change_server")}
					</Text>
				</Pressable>
			</View>
		</AuthScaffold>
	);
}
