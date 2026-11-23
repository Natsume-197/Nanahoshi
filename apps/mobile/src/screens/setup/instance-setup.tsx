import { useMutation } from "@tanstack/react-query";
import { router } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { Button } from "@/components/button";
import { Pressable } from "@/components/pressable";
import { Text } from "@/components/text";
import { TextField } from "@/components/text-field";
import { t } from "@/lib/i18n";
import { setResumeRoute } from "@/lib/resume-route";
import { slugOrFallback, usernameFromEmail } from "@/lib/setup-flow";
import { useConnection } from "@/providers/app-provider";
import { radius, space, usePalette } from "@/theme";
import { HardwareBack, SetupStep, StepTransition } from "./scaffold";

const NAME_IDEAS = [
	"onboarding.name_idea_home",
	"onboarding.name_idea_shelf",
	"onboarding.name_idea_nook",
];

const close = () => {
	if (router.canGoBack()) router.back();
	else router.replace("/");
};

/**
 * A brand-new server, set up from the phone (the web's /setup): what to call
 * the library, then the admin account. Signing in carries on straight to
 * where the books are.
 */
export function InstanceSetup() {
	const { api, auth } = useConnection();
	const [step, setStep] = useState<"name" | "account">("name");
	const [name, setName] = useState("");
	const [email, setEmail] = useState("");
	const [username, setUsername] = useState<string | null>(null);
	const [password, setPassword] = useState("");
	const shownUsername = username ?? usernameFromEmail(email);

	const setup = useMutation({
		mutationFn: async () => {
			await api.client.setup.complete({
				workspaceName: name.trim(),
				workspaceSlug: slugOrFallback(name.trim()),
				username: shownUsername,
				email: email.trim(),
				password,
			});
			// The navigation remounts on the new session; land on the books.
			setResumeRoute(["/", "/setup/books"]);
			const result = await auth.signIn.email({ email: email.trim(), password });
			if (result.error) throw new Error(t("mobile.signin.failed"));
		},
	});

	if (step === "name") {
		const blocked = name.trim() ? null : t("onboarding.name_blocked");
		return (
			<StepTransition stepKey="name" direction={1}>
				<SetupStep
					leading="close"
					onBack={close}
					step={{ index: 0, total: 2 }}
					title={t("onboarding.name_title")}
					lead={t("onboarding.name_lead")}
					footer={
						<>
							<Button
								label={t("onboarding.continue")}
								disabled={!!blocked}
								onPress={() => setStep("account")}
							/>
							{blocked ? <BlockedReason text={blocked} /> : null}
						</>
					}
				>
					<View style={{ gap: space.md }}>
						<TextField
							large
							label={t("setup.server_name")}
							placeholder={t("onboarding.name_placeholder")}
							value={name}
							onChangeText={setName}
							autoFocus
							maxLength={60}
							returnKeyType="next"
							onSubmitEditing={() => name.trim() && setStep("account")}
						/>
						<View
							style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}
						>
							{NAME_IDEAS.map((key) => (
								<IdeaChip
									key={key}
									label={t(key)}
									onPress={() => setName(t(key))}
								/>
							))}
						</View>
					</View>
				</SetupStep>
			</StepTransition>
		);
	}

	const blocked = !email.includes("@")
		? t("onboarding.account_blocked_email")
		: shownUsername.length < 3
			? t("onboarding.account_blocked_username")
			: password.length < 8
				? t("onboarding.account_blocked_password")
				: null;
	return (
		<StepTransition stepKey="account" direction={1}>
			<HardwareBack onBack={() => setStep("name")} />
			<SetupStep
				onBack={() => setStep("name")}
				step={{ index: 1, total: 2 }}
				title={t("onboarding.account_title")}
				lead={t("onboarding.account_lead", { name: name.trim() })}
				footer={
					<>
						{setup.error ? (
							<Text
								variant="subhead"
								tone="danger"
								selectable
								accessibilityLiveRegion="polite"
							>
								{setup.error.message || t("setup.failed")}
							</Text>
						) : null}
						<Button
							label={t("onboarding.account_create")}
							loading={setup.isPending}
							disabled={!!blocked}
							onPress={() => setup.mutate()}
						/>
						{blocked ? <BlockedReason text={blocked} /> : null}
					</>
				}
			>
				<View style={{ gap: space.md }}>
					<TextField
						label={t("auth.email")}
						value={email}
						onChangeText={setEmail}
						autoFocus
						autoCapitalize="none"
						autoCorrect={false}
						keyboardType="email-address"
						autoComplete="email"
						textContentType="emailAddress"
					/>
					<TextField
						label={t("auth.username")}
						value={shownUsername}
						onChangeText={(text) =>
							setUsername(text.toLowerCase().replace(/[^a-z0-9_.]/g, ""))
						}
						autoCapitalize="none"
						autoCorrect={false}
						maxLength={30}
						autoComplete="username-new"
					/>
					<Text variant="caption" tone="tertiary">
						{t("onboarding.username_hint")}
					</Text>
					<TextField
						label={t("auth.password")}
						value={password}
						onChangeText={setPassword}
						secureTextEntry
						autoComplete="new-password"
						textContentType="newPassword"
						returnKeyType="go"
						onSubmitEditing={() => !blocked && setup.mutate()}
					/>
				</View>
			</SetupStep>
		</StepTransition>
	);
}

function BlockedReason({ text }: { text: string }) {
	return (
		<Text
			variant="subhead"
			tone="tertiary"
			style={{ textAlign: "center" }}
			accessibilityLiveRegion="polite"
		>
			{text}
		</Text>
	);
}

function IdeaChip({ label, onPress }: { label: string; onPress: () => void }) {
	const palette = usePalette();
	return (
		<Pressable
			onPress={onPress}
			accessibilityRole="button"
			android_ripple={{ color: palette.ripple }}
			style={({ pressed }) => ({
				paddingHorizontal: space.md,
				paddingVertical: space.sm,
				borderRadius: radius.pill,
				overflow: "hidden",
				borderWidth: 1,
				borderColor: palette.separator,
				opacity: pressed && process.env.EXPO_OS === "ios" ? 0.7 : 1,
			})}
		>
			<Text variant="subhead" tone="secondary">
				{label}
			</Text>
		</Pressable>
	);
}
