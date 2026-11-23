import { useMutation } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { View } from "react-native";
import { PillButton } from "@/components/pill-button";
import { Spinner } from "@/components/states";
import { Text } from "@/components/text";
import { useMountEffect } from "@/hooks/use-mount-effect";
import { createNanahoshiAuth, type NanahoshiAuth } from "@/lib/auth-client";
import { probeServer } from "@/lib/discover-servers";
import { haptics } from "@/lib/haptics";
import { t } from "@/lib/i18n";
import {
	type PairFailure,
	type PairLink,
	pairFailure,
	parsePairParams,
} from "@/lib/pair-link";
import { useMaybeConnection, useServer } from "@/providers/app-provider";
import { SetupStep } from "@/screens/setup/scaffold";
import { space } from "@/theme";

const FAILURES: Record<PairFailure, string> = {
	unreachable: "mobile.pair.err_unreachable",
	expired: "mobile.pair.err_expired",
	refused: "mobile.pair.err_refused",
	failed: "mobile.pair.err_failed",
};

const close = () => {
	if (router.canGoBack()) router.back();
	else router.replace("/");
};

/**
 * Where the web's "Mobile app" QR lands (`nanahoshi://pair?…`), from the
 * in-app scanner or the phone's own camera: trades the code for a session
 * of this phone's own and opens that server.
 */
export function PairScreen() {
	const params = useLocalSearchParams<{ server?: string; token?: string }>();
	const link = parsePairParams(params);
	const connection = useMaybeConnection();
	if (!link)
		return (
			<SetupStep
				leading="close"
				onBack={close}
				title={t("mobile.pair.invalid_title")}
				lead={t("mobile.pair.invalid_lead")}
			/>
		);
	if (connection)
		return (
			<CheckSession
				link={link}
				auth={connection.auth}
				serverUrl={connection.serverUrl}
			/>
		);
	return <Redeem link={link} current={null} />;
}

function CheckSession({
	link,
	auth,
	serverUrl,
}: {
	link: PairLink;
	auth: NanahoshiAuth;
	serverUrl: string;
}) {
	const session = auth.useSession();
	if (session.isPending)
		return (
			<SetupStep leading="none" title={t("mobile.pair.connecting")}>
				<Spinner />
			</SetupStep>
		);
	if (session.data)
		return (
			<SetupStep
				leading="close"
				onBack={close}
				title={t("mobile.pair.signed_in_title")}
				lead={t("mobile.pair.signed_in_lead")}
			/>
		);
	return <Redeem link={link} current={{ auth, serverUrl }} />;
}

function Redeem({
	link,
	current,
}: {
	link: PairLink;
	current: { auth: NanahoshiAuth; serverUrl: string } | null;
}) {
	const { setServerUrl } = useServer();
	const sameServer = current?.serverUrl === link.server;
	const redeem = useMutation({
		mutationFn: async (): Promise<PairFailure | null> => {
			const controller = new AbortController();
			if (!(await probeServer(link.server, controller.signal)))
				return "unreachable";
			// The session cookie lands in the one store every auth client reads,
			// so a fresh client for another server hands it to the next connection.
			const auth =
				sameServer && current ? current.auth : createNanahoshiAuth(link.server);
			const result = await auth.$fetch("/mobile-connect/redeem", {
				method: "POST",
				body: { token: link.token },
			});
			if (result.error) return pairFailure(result.error);
			return null;
		},
		onSuccess: async (failure) => {
			if (failure) {
				haptics.error();
				return;
			}
			haptics.success();
			// Another server remounts the app on a new connection, signed in;
			// the same one just needs its session read again.
			if (sameServer && current) current.auth.$store.notify("$sessionSignal");
			else await setServerUrl(link.server);
		},
	});
	useMountEffect(() => {
		redeem.mutate();
	});

	const failure = redeem.isError ? "failed" : redeem.data;
	if (!failure)
		return (
			<SetupStep
				leading="none"
				title={t("mobile.pair.connecting")}
				lead={link.server.replace(/^https?:\/\//, "")}
			>
				<Spinner />
			</SetupStep>
		);
	return (
		<SetupStep
			leading="close"
			onBack={close}
			title={t("mobile.pair.failed_title")}
			footer={
				<View style={{ gap: space.sm }}>
					<PillButton
						label={t("mobile.pair.scan_again")}
						onPress={() => router.replace("/scan")}
					/>
					<PillButton
						variant="plain"
						label={t("mobile.pair.retry")}
						onPress={() => redeem.mutate()}
					/>
				</View>
			}
		>
			<Text variant="body" tone="secondary" accessibilityLiveRegion="polite">
				{t(FAILURES[failure])}
			</Text>
		</SetupStep>
	);
}
