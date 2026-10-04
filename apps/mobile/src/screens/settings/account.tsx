import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ScrollView, View } from "react-native";
import { Button } from "@/components/button";
import { GroupedList, GroupedRow } from "@/components/grouped-list";
import { icons } from "@/components/icon";
import { askChoice, showNotice } from "@/components/prompt";
import { RowSkeleton } from "@/components/states";
import { Text } from "@/components/text";
import { TextField } from "@/components/text-field";
import { clearDownloads } from "@/downloads/files";
import { locale, t } from "@/lib/i18n";
import { describeSessionDevice } from "@/lib/session-device";
import { useMiniPlayerInset } from "@/player/mini-player";
import { useApi, useConnection } from "@/providers/app-provider";
import { space } from "@/theme";

/** Connected accounts, where you're signed in, signing out, and deleting the
 * account. Every way out ends the session; the root guard then shows sign-in. */
export function AccountSettingsScreen() {
	const miniPlayerInset = useMiniPlayerInset();
	const { client } = useApi();
	const { auth } = useConnection();
	const session = auth.useSession();
	const currentToken = session.data?.session.token;

	const accounts = useQuery({
		queryKey: ["auth", "accounts"],
		queryFn: async () => (await auth.listAccounts()).data ?? [],
	});
	const sessions = useQuery({
		queryKey: ["auth", "sessions"],
		queryFn: async () => (await auth.listSessions()).data ?? [],
	});
	const discord = accounts.data?.find((a) => a.providerId === "discord");

	// The Expo auth client opens Discord in the system's auth browser and
	// stores the returned cookie; the callback only has to be an app URL.
	const linkDiscord = useMutation({
		mutationFn: async () => {
			const result = await auth.linkSocial({
				provider: "discord",
				callbackURL: "/settings/account",
			});
			if (result?.error) throw new Error(result.error.message);
		},
		onSettled: () => void accounts.refetch(),
		onError: () => showNotice(t("toast.discord_link_failed")),
	});
	const unlinkDiscord = useMutation({
		mutationFn: async (accountId: string) => {
			const result = await auth.unlinkAccount({ accountId });
			if (result.error) throw new Error(result.error.message);
		},
		onSettled: () => void accounts.refetch(),
		onError: () => showNotice(t("toast.discord_unlink_failed")),
	});
	const revoke = useMutation({
		mutationFn: async (token: string) => {
			const result = await auth.revokeSession({ token });
			if (result.error) throw new Error(result.error.message);
		},
		onSettled: () => void sessions.refetch(),
		onError: () => showNotice(t("toast.session_revoke_failed")),
	});
	const signOutAll = useMutation({
		mutationFn: async () => {
			await client.sessions.revokeAll();
			await auth.signOut();
			clearDownloads();
		},
		onError: () => showNotice(t("toast.sign_out_all_failed")),
	});

	const onDiscord = () => {
		if (!discord) {
			linkDiscord.mutate();
			return;
		}
		void askChoice({
			title: "Discord",
			message: t("settings.account.discord_linked"),
			options: [
				{
					id: "disconnect",
					label: t("settings.account.disconnect"),
					destructive: true,
				},
			],
		}).then((answer) => {
			if (answer === "disconnect") unlinkDiscord.mutate(discord.id);
		});
	};

	return (
		<ScrollView
			contentInsetAdjustmentBehavior="automatic"
			keyboardShouldPersistTaps="handled"
			automaticallyAdjustKeyboardInsets
			contentContainerStyle={{
				padding: space.lg,
				paddingBottom: space.lg + miniPlayerInset,
				gap: space.xl,
			}}
		>
			<GroupedList
				title={t("settings.account.connected_accounts")}
				footer={t("settings.account.connected_accounts_desc")}
			>
				<GroupedRow
					first
					icon={icons.link}
					label="Discord"
					subtitle={
						discord
							? t("settings.account.discord_linked")
							: t("settings.account.discord_connect")
					}
					value={
						accounts.isPending
							? undefined
							: discord
								? t("settings.account.connected")
								: t("settings.account.connect")
					}
					disabled={
						accounts.isPending ||
						linkDiscord.isPending ||
						unlinkDiscord.isPending
					}
					onPress={onDiscord}
				/>
			</GroupedList>

			<GroupedList
				title={t("settings.account.active_sessions")}
				footer={t("settings.account.active_sessions_desc")}
			>
				{sessions.isPending ? (
					<View style={{ paddingVertical: space.md }}>
						<RowSkeleton count={2} />
					</View>
				) : (sessions.data ?? []).length === 0 ? (
					<GroupedRow first label={t("settings.account.no_active_sessions")} />
				) : (
					(sessions.data ?? []).map((item, index) => {
						const device = deviceLabel(item.userAgent);
						const isCurrent = item.token === currentToken;
						return (
							<GroupedRow
								key={item.token}
								first={index === 0}
								icon={
									describeSessionDevice(item.userAgent).mobile
										? icons.device
										: icons.desktop
								}
								label={device}
								subtitle={`${item.ipAddress ?? t("settings.account.unknown_ip")} · ${t(
									"settings.account.signed_in",
									{
										date: new Date(item.createdAt).toLocaleDateString(locale, {
											dateStyle: "medium",
										}),
									},
								)}`}
								value={isCurrent ? t("settings.account.current") : undefined}
								onPress={
									isCurrent
										? undefined
										: () =>
												void askChoice({
													title: t("settings.account.revoke_session", {
														device,
													}),
													options: [
														{
															id: "revoke",
															label: t("common.delete"),
															destructive: true,
														},
													],
												}).then((answer) => {
													if (answer === "revoke") revoke.mutate(item.token);
												})
								}
							/>
						);
					})
				)}
			</GroupedList>

			<GroupedList title={t("settings.account.sign_out_title")}>
				<GroupedRow
					first
					icon={icons.signOut}
					label={t("settings.account.sign_out")}
					subtitle={t("settings.account.sign_out_desc")}
					onPress={() => void auth.signOut().then(clearDownloads)}
				/>
				<GroupedRow
					icon={icons.signOut}
					label={t("settings.account.sign_out_all")}
					subtitle={t("settings.account.sign_out_all_desc")}
					destructive
					disabled={signOutAll.isPending}
					onPress={() =>
						void askChoice({
							title: t("settings.account.sign_out_all_title"),
							message: t("settings.account.sign_out_all_confirm_desc"),
							options: [
								{
									id: "sign-out",
									label: t("settings.account.sign_out_all"),
									destructive: true,
								},
							],
						}).then((answer) => {
							if (answer === "sign-out") signOutAll.mutate();
						})
					}
				/>
			</GroupedList>

			<DeleteAccount />
		</ScrollView>
	);
}

function deviceLabel(userAgent: string | null | undefined) {
	const { client, os } = describeSessionDevice(userAgent);
	const name = client ?? t("settings.account.unknown");
	return os ? t("settings.account.device_on", { browser: name, os }) : name;
}

/** Deleting is permanent, so, as on the web, it asks for a typed phrase. */
function DeleteAccount() {
	const { auth } = useConnection();
	const [confirming, setConfirming] = useState(false);
	const [typed, setTyped] = useState("");
	const phrase = t("settings.account.confirm_phrase");
	const remove = useMutation({
		mutationFn: async () => {
			const result = await auth.deleteUser();
			if (result.error) throw new Error(result.error.message);
			clearDownloads();
		},
		onError: () => showNotice(t("toast.delete_account_failed")),
	});

	return (
		<GroupedList
			title={t("settings.account.danger_zone")}
			footer={confirming ? undefined : t("settings.account.danger_desc")}
		>
			<GroupedRow
				first
				icon={icons.trash}
				label={t("settings.account.delete_account")}
				destructive
				onPress={confirming ? undefined : () => setConfirming(true)}
			/>
			{confirming ? (
				<View style={{ padding: space.lg, gap: space.lg }}>
					<Text variant="subhead" tone="secondary">
						{t("settings.account.delete_desc")}
					</Text>
					<TextField
						label={t("settings.account.confirm_type", { phrase })}
						placeholder={phrase}
						onChangeText={setTyped}
						autoCapitalize="none"
						autoCorrect={false}
						autoFocus
					/>
					<Button
						label={t("settings.account.delete_account")}
						disabled={typed.trim().toLowerCase() !== phrase.toLowerCase()}
						loading={remove.isPending}
						onPress={() => remove.mutate()}
					/>
					<Button
						variant="secondary"
						label={t("common.cancel")}
						onPress={() => {
							setConfirming(false);
							setTyped("");
						}}
					/>
				</View>
			) : null}
		</GroupedList>
	);
}
