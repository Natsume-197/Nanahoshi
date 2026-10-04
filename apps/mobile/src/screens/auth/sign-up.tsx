import { router } from "expo-router";
import { type ComponentProps, useRef, useState } from "react";
import { type TextInput, View } from "react-native";
import { PillButton } from "@/components/pill-button";
import { Text } from "@/components/text";
import { TextField } from "@/components/text-field";
import { t } from "@/lib/i18n";
import { useConnection } from "@/providers/app-provider";
import { SetupStep } from "@/screens/setup/scaffold";
import { space } from "@/theme";

const FIELDS = ["name", "username", "email", "password"] as const;
type Field = (typeof FIELDS)[number];

/** The web's sign-up form for someone arriving from an invite: the code goes
 * along as the web sends it, and the invite resumes once signed in. */
export function SignUp({ inviteCode }: { inviteCode?: string }) {
	const { auth } = useConnection();
	const values = useRef<Record<Field, string>>({
		name: "",
		username: "",
		email: "",
		password: "",
	});
	const inputs = useRef<Partial<Record<Field, TextInput | null>>>({});
	const [filled, setFilled] = useState(0);
	const [error, setError] = useState<string | null>(null);
	const [pending, setPending] = useState(false);
	const ready = filled === FIELDS.length;

	const change = (field: Field) => (text: string) => {
		values.current[field] = text;
		setFilled(FIELDS.filter((key) => values.current[key].trim()).length);
	};

	const submit = async () => {
		if (!ready || pending) return;
		const { name, username, email, password } = values.current;
		setError(null);
		setPending(true);
		const result = await auth.signUp.email(
			{
				name: name.trim(),
				username: username.trim().toLowerCase(),
				email: email.trim(),
				password,
			},
			inviteCode ? { headers: { "x-invite-code": inviteCode } } : undefined,
		);
		setPending(false);
		if (result.error)
			setError(result.error.message ?? t("mobile.error.action"));
		// Success flips the root guard to the tabs, like signing in.
	};

	const field = (
		key: Field,
		props: Partial<ComponentProps<typeof TextField>> & { label: string },
	) => {
		const next = FIELDS[FIELDS.indexOf(key) + 1];
		return (
			<TextField
				large
				ref={(input) => {
					inputs.current[key] = input;
				}}
				onChangeText={change(key)}
				autoCorrect={false}
				returnKeyType={next ? "next" : "go"}
				onSubmitEditing={() =>
					next ? inputs.current[next]?.focus() : void submit()
				}
				submitBehavior={next ? "submit" : undefined}
				{...props}
			/>
		);
	};

	return (
		<SetupStep
			leading={router.canGoBack() ? "back" : "none"}
			title={t("auth.create_account")}
			footer={
				<PillButton
					label={t("auth.sign_up")}
					onPress={submit}
					loading={pending}
					disabled={!ready}
				/>
			}
		>
			<View style={{ gap: space.md }}>
				{field("name", {
					label: t("auth.name"),
					placeholder: t("auth.name_placeholder"),
					autoComplete: "name",
					textContentType: "name",
					autoFocus: true,
				})}
				{field("username", {
					label: t("auth.username"),
					placeholder: t("auth.username_placeholder"),
					autoCapitalize: "none",
					autoComplete: "username-new",
					textContentType: "username",
				})}
				{field("email", {
					label: t("auth.email"),
					placeholder: t("auth.email_placeholder"),
					autoCapitalize: "none",
					autoComplete: "email",
					keyboardType: "email-address",
					textContentType: "emailAddress",
				})}
				{field("password", {
					label: t("auth.password"),
					placeholder: t("auth.password_min_placeholder"),
					secureTextEntry: true,
					autoComplete: "new-password",
					textContentType: "newPassword",
				})}
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
