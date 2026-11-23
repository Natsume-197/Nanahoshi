import { router } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { Button } from "@/components/button";
import { Text } from "@/components/text";
import { TextField } from "@/components/text-field";
import { t } from "@/lib/i18n";
import { inviteCodeFrom } from "@/lib/invite-link";
import { useConnection } from "@/providers/app-provider";
import { space } from "@/theme";

/** Nobody is left without a next step: an invite link pasted here opens it
 * (the invite screen checks it against this server first). */
export function InvitePaste({ hint }: { hint?: string }) {
	const { serverUrl } = useConnection();
	const [value, setValue] = useState("");
	const [invalid, setInvalid] = useState(false);
	const submit = () => {
		const code = inviteCodeFrom(value);
		setInvalid(!code);
		if (!code) return;
		const pasted = value.trim();
		router.push({
			pathname: "/invite",
			params: {
				server: serverUrl,
				code,
				link: /^https?:\/\//i.test(pasted)
					? pasted
					: `${serverUrl}/invite/${code}`,
			},
		});
	};
	return (
		<View style={{ gap: space.sm, paddingHorizontal: space.lg }}>
			{hint ? (
				<Text
					variant="subhead"
					tone="secondary"
					style={{ textAlign: "center" }}
				>
					{hint}
				</Text>
			) : null}
			<TextField
				label={t("home.invite_paste_label")}
				placeholder={t("home.invite_paste_placeholder")}
				value={value}
				onChangeText={(text) => {
					setValue(text);
					setInvalid(false);
				}}
				autoCapitalize="none"
				autoCorrect={false}
				keyboardType="url"
				returnKeyType="go"
				onSubmitEditing={submit}
			/>
			{invalid ? (
				<Text variant="subhead" tone="danger" accessibilityLiveRegion="polite">
					{t("home.invite_paste_invalid")}
				</Text>
			) : null}
			<Button
				variant="secondary"
				label={t("home.invite_paste_action")}
				disabled={!value.trim()}
				onPress={submit}
			/>
		</View>
	);
}
