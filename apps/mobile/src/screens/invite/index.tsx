import { useMutation, useQuery } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import type { ReactNode } from "react";
import { Linking, View } from "react-native";
import { Button } from "@/components/button";
import { showNotice } from "@/components/prompt";
import { ServerAvatar } from "@/components/server-avatar";
import { Spinner } from "@/components/states";
import { Text } from "@/components/text";
import { useMountEffect } from "@/hooks/use-mount-effect";
import type { NanahoshiAuth } from "@/lib/auth-client";
import { haptics } from "@/lib/haptics";
import { t } from "@/lib/i18n";
import {
	type InviteLink,
	inviteHref,
	parseInviteLink,
} from "@/lib/invite-link";
import { mediaUrl } from "@/lib/media";
import { setResumeRoute } from "@/lib/resume-route";
import {
	useApi,
	useConnection,
	useMaybeConnection,
	useServer,
} from "@/providers/app-provider";
import { useSwitchServer } from "@/screens/panels/servers";
import { SetupStep } from "@/screens/setup/scaffold";
import { radius, space, usePalette } from "@/theme";

const ERRORS = {
	invalid: "invite.err_invalid",
	expired: "invite.err_expired",
	revoked: "invite.err_revoked",
	exhausted: "invite.err_exhausted",
} as const;

const close = () => {
	if (router.canGoBack()) router.back();
	else router.replace("/");
};
const hostOf = (url: string) => url.replace(/^https?:\/\//, "");

/**
 * Where an invite link from the web lands (`nanahoshi://invite?…`): the
 * web's /invite/$code page, for whichever state the app is in.
 */
export function InviteScreen() {
	const params = useLocalSearchParams<{
		server?: string;
		code?: string;
		link?: string;
		join?: string;
	}>();
	const invite = parseInviteLink(params);
	// Back from signing up or in for this invite: finish it, as the web's ?join=1.
	const autoJoin = params.join === "1";
	const connection = useMaybeConnection();
	if (!invite)
		return (
			<SetupStep
				leading="close"
				onBack={close}
				title={t("invite.invalid_title")}
				lead={t("invite.err_invalid")}
			/>
		);
	if (connection)
		return (
			<Connected invite={invite} auth={connection.auth} autoJoin={autoJoin} />
		);
	return <SignInThere invite={invite} />;
}

/** Asks the connected server first: the same instance is often reached at
 * another address (LAN IP in the app, public domain in the link), and a
 * code it knows settles that it's the same one. */
function Connected({
	invite,
	auth,
	autoJoin,
}: {
	invite: InviteLink;
	auth: NanahoshiAuth;
	autoJoin: boolean;
}) {
	const { orpc } = useApi();
	const { serverUrl } = useConnection();
	const session = auth.useSession();
	const preview = useQuery(
		orpc.inviteLinks.preview.queryOptions({ input: { code: invite.code } }),
	);
	const data = preview.data;
	if (preview.isPending || session.isPending)
		return (
			<SetupStep leading="close" onBack={close} title="">
				<Spinner />
			</SetupStep>
		);
	const known = data !== undefined && data.status !== "invalid";
	if (!known && serverUrl !== invite.server)
		return <OtherServer invite={invite} auth={auth} />;
	if (data?.status !== "ok")
		return (
			<SetupStep
				leading="close"
				onBack={close}
				title={t("invite.invalid_title")}
				lead={t(data ? ERRORS[data.status] : "invite.err_invalid")}
			/>
		);
	const card = (
		<ServerCard
			name={data.serverName}
			logo={mediaUrl(serverUrl, data.serverLogo)}
			detail={`${t("invite.member_count", { count: data.memberCount })} · ${t("invite.book_count", { count: data.bookCount })}`}
		/>
	);
	if (!session.data)
		return (
			<SignedOut
				invite={invite}
				card={card}
				requiresDiscord={data.requiresDiscord}
			/>
		);
	return (
		<JoinActions
			invite={invite}
			card={card}
			serverId={data.serverId}
			alreadyMember={data.alreadyMember}
			needsDiscord={data.requiresDiscord && !data.discordLinked}
			userName={session.data.user.name || session.data.user.email}
			autoJoin={autoJoin}
		/>
	);
}

function JoinActions({
	invite,
	card,
	serverId,
	alreadyMember,
	needsDiscord,
	userName,
	autoJoin,
}: {
	invite: InviteLink;
	card: ReactNode;
	serverId: string;
	alreadyMember: boolean;
	needsDiscord: boolean;
	userName: string;
	autoJoin: boolean;
}) {
	const { client } = useApi();
	const { auth } = useConnection();
	const switchServer = useSwitchServer();
	const join = useMutation({
		mutationFn: () => client.inviteLinks.join({ code: invite.code }),
		onSuccess: (result) => {
			haptics.success();
			auth.$store.notify("$listOrg");
			switchServer.mutate(result.serverId);
		},
		onError: (error) => showNotice(error.message || t("mobile.error.action")),
	});
	const joinsNow = autoJoin && !alreadyMember && !needsDiscord;
	useMountEffect(() => {
		if (joinsNow) join.mutate();
	});
	const linkDiscord = useMutation({
		mutationFn: async () => {
			const result = await auth.linkSocial({
				provider: "discord",
				callbackURL: "/",
			});
			if (result?.error) throw new Error(result.error.message);
		},
		// The server checks the Discord rules on join, as the web's return does.
		onSuccess: () => join.mutate(),
		onError: () => showNotice(t("toast.discord_link_failed")),
	});
	const busy = join.isPending || switchServer.isPending || joinsNow;
	const footer = alreadyMember ? (
		<Button
			label={t("invite.open_server")}
			loading={busy}
			onPress={() => switchServer.mutate(serverId)}
		/>
	) : needsDiscord ? (
		<>
			<Button
				label={t("invite.link_discord")}
				loading={linkDiscord.isPending || busy}
				onPress={() => linkDiscord.mutate()}
			/>
			<Button
				variant="secondary"
				label={t("invite.no_thanks")}
				disabled={busy}
				onPress={close}
			/>
		</>
	) : (
		<>
			<Button
				label={t("invite.accept_as", { name: userName })}
				loading={busy}
				onPress={() => join.mutate()}
			/>
			<Button
				variant="secondary"
				label={t("invite.no_thanks")}
				disabled={busy}
				onPress={close}
			/>
		</>
	);
	return (
		<SetupStep
			leading="close"
			onBack={close}
			title={t("invite.invited_to_join")}
			lead={
				alreadyMember
					? t("invite.already_member")
					: needsDiscord
						? t("invite.link_discord_required")
						: undefined
			}
			footer={footer}
		>
			{card}
		</SetupStep>
	);
}

/** The app is connected to another server: signed in there, it can't take
 * this invite without signing out, so the browser finishes it. */
function OtherServer({
	invite,
	auth,
}: {
	invite: InviteLink;
	auth: NanahoshiAuth;
}) {
	const { serverUrl } = useConnection();
	const session = auth.useSession();
	if (session.isPending)
		return (
			<SetupStep leading="close" onBack={close} title="">
				<Spinner />
			</SetupStep>
		);
	if (!session.data) return <SignInThere invite={invite} />;
	return (
		<SetupStep
			leading="close"
			onBack={close}
			title={t("invite.invited_to_join")}
			lead={t("mobile.invite.other_server", {
				host: hostOf(invite.server),
				current: hostOf(serverUrl),
			})}
			footer={
				<Button
					label={t("mobile.invite.open_browser")}
					onPress={() => void Linking.openURL(invite.link)}
				/>
			}
		>
			<ServerCard name={hostOf(invite.server)} logo={null} />
		</SetupStep>
	);
}

/** The web's signed-out invite page: the instance's ways to create an
 * account, or sign in; either one comes back here and joins. */
function SignedOut({
	invite,
	card,
	requiresDiscord,
}: {
	invite: InviteLink;
	card: ReactNode;
	requiresDiscord: boolean;
}) {
	const { orpc } = useApi();
	const { auth } = useConnection();
	const sso = useQuery(orpc.setup.ssoStatus.queryOptions());
	const signup = sso.data?.signup;
	const resume = () =>
		setResumeRoute(["/", inviteHref(invite, { join: true })]);
	const discord = useMutation({
		mutationFn: async () => {
			resume();
			const result = await auth.signIn.social({
				provider: "discord",
				callbackURL: "/",
				// The server reads it back from the OAuth state to admit the sign-up.
				additionalData: { inviteCode: invite.code },
			});
			if (result?.error) throw new Error(result.error.message);
		},
		onError: () => showNotice(t("mobile.signin.provider_failed")),
	});
	const closed =
		!!signup &&
		(signup.policy === "closed" || (!signup.email && !signup.discord));
	const discordButton = (variant?: "secondary") => (
		<Button
			variant={variant}
			label={t("invite.continue_discord")}
			loading={discord.isPending}
			onPress={() => discord.mutate()}
		/>
	);
	const signIn = (
		<Button
			variant="secondary"
			label={`${t("auth.have_account")} ${t("auth.sign_in_link")}`}
			onPress={() => {
				resume();
				router.push("/sign-in");
			}}
		/>
	);
	const footer = !signup ? (
		<Spinner />
	) : closed ? (
		signIn
	) : requiresDiscord ? (
		<>
			{signup.discord ? discordButton() : null}
			{signIn}
		</>
	) : signup.email ? (
		<>
			<Button
				label={t("invite.create_account")}
				onPress={() => {
					resume();
					router.push({
						pathname: "/sign-up",
						params: { invite: invite.code },
					});
				}}
			/>
			{signup.discord ? discordButton("secondary") : null}
			{signIn}
		</>
	) : (
		<>
			{discordButton()}
			{signIn}
		</>
	);
	return (
		<SetupStep
			leading="close"
			onBack={close}
			title={t("invite.invited_to_join")}
			lead={
				closed
					? t("invite.signup_closed")
					: requiresDiscord
						? t("invite.requires_discord")
						: undefined
			}
			footer={footer}
		>
			{card}
		</SetupStep>
	);
}

/** Signed out on another server (or none): switch the app to the invite's
 * server; the invite reopens there with its ways in. */
function SignInThere({ invite }: { invite: InviteLink }) {
	const { setServerUrl } = useServer();
	const host = hostOf(invite.server);
	return (
		<SetupStep
			leading="close"
			onBack={close}
			title={t("invite.invited_to_join")}
			footer={
				<Button
					label={t("mobile.invite.continue_on", { host })}
					onPress={async () => {
						setResumeRoute([inviteHref(invite)]);
						await setServerUrl(invite.server);
					}}
				/>
			}
		>
			<ServerCard name={host} logo={null} />
		</SetupStep>
	);
}

function ServerCard({
	name,
	logo,
	detail,
}: {
	name: string;
	logo: string | null;
	detail?: string;
}) {
	const palette = usePalette();
	return (
		<View
			style={{
				flexDirection: "row",
				alignItems: "center",
				gap: space.md,
				padding: space.lg,
				borderRadius: radius.card,
				borderCurve: "continuous",
				borderWidth: 1,
				borderColor: palette.separator,
			}}
		>
			<ServerAvatar name={name} logo={logo} size={56} />
			<View style={{ flex: 1, gap: 2 }}>
				<Text variant="headline" numberOfLines={2}>
					{name}
				</Text>
				{detail ? (
					<Text variant="caption" tone="secondary">
						{detail}
					</Text>
				) : null}
			</View>
		</View>
	);
}
