import { useMutation, useQuery } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { View } from "react-native";
import { Button } from "@/components/button";
import { Monogram } from "@/components/monogram";
import { showNotice } from "@/components/prompt";
import { SheetBody } from "@/components/sheet-body";
import { Text } from "@/components/text";
import { TextField } from "@/components/text-field";
import { haptics } from "@/lib/haptics";
import { t } from "@/lib/i18n";
import { parseInviteCode } from "@/lib/invite-code";
import { useApi, useConnection } from "@/providers/app-provider";
import { radius, space, usePalette } from "@/theme";
import { useSwitchServer } from "./servers";

const ERRORS = {
	invalid: "invite.err_invalid",
	expired: "invite.err_expired",
	revoked: "invite.err_revoked",
	exhausted: "invite.err_exhausted",
} as const;

/** The web's /invite/$code page for someone already signed in: paste the
 * link, see which server it opens, join and land in it. */
export function JoinServer({ initialCode }: { initialCode?: string }) {
	const { orpc, client } = useApi();
	const { auth } = useConnection();
	const palette = usePalette();
	const user = auth.useSession().data?.user;
	const typed = useRef(initialCode ?? "");
	const [code, setCode] = useState(
		initialCode ? parseInviteCode(initialCode) : null,
	);
	const [unreadable, setUnreadable] = useState(false);
	const preview = useQuery({
		...orpc.inviteLinks.preview.queryOptions({ input: { code: code ?? "" } }),
		enabled: !!code,
	});
	const switchServer = useSwitchServer();
	const join = useMutation({
		mutationFn: (inviteCode: string) =>
			client.inviteLinks.join({ code: inviteCode }),
		onSuccess: (result) => {
			haptics.success();
			auth.$store.notify("$listOrg");
			switchServer.mutate(result.serverId);
		},
		onError: (error) => showNotice(error.message || t("mobile.error.action")),
	});
	const linkDiscord = useMutation({
		mutationFn: async () => {
			const result = await auth.linkSocial({
				provider: "discord",
				callbackURL: "/join",
			});
			if (result?.error) throw new Error(result.error.message);
		},
		onSettled: () => void preview.refetch(),
		onError: () => showNotice(t("toast.discord_link_failed")),
	});

	const lookUp = () => {
		const parsed = parseInviteCode(typed.current);
		setUnreadable(!parsed);
		setCode(parsed);
	};
	const data = preview.data;
	const busy = join.isPending || switchServer.isPending;

	return (
		<SheetBody
			title={t("mobile.join.title")}
			description={t("mobile.join.desc")}
		>
			<TextField
				label={t("mobile.join.code_label")}
				placeholder="https://…/invite/…"
				defaultValue={initialCode}
				onChangeText={(text) => {
					typed.current = text;
					// A different link: back to looking it up.
					if (code !== null) setCode(null);
					if (unreadable) setUnreadable(false);
				}}
				autoCapitalize="none"
				autoCorrect={false}
				keyboardType="url"
				autoFocus={!initialCode}
				returnKeyType="search"
				onSubmitEditing={lookUp}
			/>
			{unreadable || (data && data.status !== "ok") || preview.isError ? (
				<Text variant="subhead" tone="danger" accessibilityLiveRegion="polite">
					{t(
						data && data.status !== "ok"
							? ERRORS[data.status]
							: "invite.err_invalid",
					)}
				</Text>
			) : null}
			{data?.status === "ok" ? (
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
					<Monogram name={data.serverName} size={48} />
					<View style={{ flex: 1, gap: 2 }}>
						<Text variant="caption" tone="secondary">
							{t("invite.invited_to_join")}
						</Text>
						<Text variant="headline" numberOfLines={2}>
							{data.serverName}
						</Text>
						<Text variant="caption" tone="secondary">
							{`${t("invite.member_count", { count: data.memberCount })} · ${t("invite.book_count", { count: data.bookCount })}`}
						</Text>
					</View>
				</View>
			) : null}
			{data?.status !== "ok" ? (
				<Button
					label={t("mobile.join.look_up")}
					onPress={lookUp}
					loading={preview.isFetching}
				/>
			) : data.alreadyMember ? (
				<>
					<Text variant="subhead" tone="secondary">
						{t("invite.already_member")}
					</Text>
					<Button
						label={t("invite.open_server")}
						loading={busy}
						onPress={() => switchServer.mutate(data.serverId)}
					/>
				</>
			) : data.requiresDiscord && !data.discordLinked ? (
				<>
					<Text variant="subhead" tone="secondary">
						{t("invite.link_discord_required")}
					</Text>
					<Button
						label={t("invite.link_discord")}
						loading={linkDiscord.isPending}
						onPress={() => linkDiscord.mutate()}
					/>
				</>
			) : (
				<Button
					label={t("invite.accept_as", {
						name: user?.name || user?.email || "",
					})}
					loading={busy}
					onPress={() => code && join.mutate(code)}
				/>
			)}
		</SheetBody>
	);
}
