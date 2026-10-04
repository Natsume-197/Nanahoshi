import { useMutation } from "@tanstack/react-query";
import * as WebBrowser from "expo-web-browser";
import { useRef, useState } from "react";
import { Text as NativeText } from "react-native";
import { Button } from "@/components/button";
import { useFormSheet } from "@/components/form-sheet/open";
import { showNotice } from "@/components/prompt";
import { SheetBody } from "@/components/sheet-body";
import { Text } from "@/components/text";
import { TextField } from "@/components/text-field";
import { haptics } from "@/lib/haptics";
import { t } from "@/lib/i18n";
import { kindleEmailProblem, lastKindleEmail } from "@/lib/kindle";
import { useApi } from "@/providers/app-provider";
import { usePalette } from "@/theme";

const AMAZON_APPROVE_URL = "https://www.amazon.com/sendtokindle/email";

/** The web's "Send to Kindle" dialog as a native sheet: one address field,
 * remembered for next time. */
export function SendToKindle({ uuid }: { uuid: string }) {
	const { client } = useApi();
	const palette = usePalette();
	const { finish } = useFormSheet();
	const initial = lastKindleEmail.read();
	const emailRef = useRef(initial);
	const [problem, setProblem] = useState<string | null>(null);
	const send = useMutation({
		mutationFn: (kindleEmail: string) =>
			client.kindle.sendToKindle({ bookUuid: uuid, kindleEmail }),
		onSuccess: async (_data, kindleEmail) => {
			await lastKindleEmail.write(kindleEmail).catch(() => undefined);
			haptics.success();
			finish();
		},
		onError: (error) =>
			showNotice(
				error instanceof Error && error.message
					? error.message
					: t("toast.kindle_failed"),
			),
	});

	const submit = () => {
		const email = emailRef.current.trim();
		const found = kindleEmailProblem(email);
		setProblem(
			found === "invalid"
				? t("kindle.err_invalid")
				: found === "not_kindle"
					? t("kindle.err_not_kindle")
					: null,
		);
		if (!found) send.mutate(email);
	};

	return (
		<SheetBody title={t("kindle.title")} description={t("kindle.desc")}>
			<TextField
				label={t("kindle.email_label")}
				placeholder={t("kindle.email_placeholder")}
				defaultValue={initial}
				onChangeText={(text) => {
					emailRef.current = text;
				}}
				keyboardType="email-address"
				autoCapitalize="none"
				autoCorrect={false}
				autoComplete="email"
				autoFocus={!initial}
				returnKeyType="send"
				onSubmitEditing={submit}
			/>
			<Text variant="subhead" tone="secondary">
				{t("kindle.approve_pre")}
				<NativeText
					accessibilityRole="link"
					onPress={() => void WebBrowser.openBrowserAsync(AMAZON_APPROVE_URL)}
					style={{ color: palette.text, textDecorationLine: "underline" }}
				>
					{t("kindle.approve_link")}
				</NativeText>
				{t("kindle.approve_post")}
			</Text>
			{problem ? (
				<Text variant="subhead" tone="danger" accessibilityLiveRegion="polite">
					{problem}
				</Text>
			) : null}
			<Button
				label={t("kindle.send")}
				onPress={submit}
				loading={send.isPending}
			/>
		</SheetBody>
	);
}
