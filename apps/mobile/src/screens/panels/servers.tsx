import { useMutation, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { ScrollView, View } from "react-native";
import { GroupedList, GroupedRow } from "@/components/grouped-list";
import { Icon, icons } from "@/components/icon";
import { askChoice, showNotice } from "@/components/prompt";
import { ServerAvatar } from "@/components/server-avatar";
import { Spinner } from "@/components/states";
import { useIsAppOwner } from "@/lib/abilities";
import { t } from "@/lib/i18n";
import { mediaUrl } from "@/lib/media";
import { serverHost } from "@/lib/server-reachability";
import { useMiniPlayerInset } from "@/player/mini-player";
import { usePlayer } from "@/player/provider";
import { useConnection, useServerStatus } from "@/providers/app-provider";
import { space, usePalette } from "@/theme";

/** Leaves the current server: stops playback, drops its cache, back to Home. */
export function useSwitchServer() {
	const { auth, serverUrl } = useConnection();
	const server = useServerStatus();
	const queryClient = useQueryClient();
	const player = usePlayer();
	return useMutation({
		mutationFn: async (organizationId: string) => {
			// Known gone: fail before stopping playback for a switch that can't happen.
			if (server.status === "unreachable" && !(await server.check()))
				throw new Error("server unreachable");
			await player.stop();
			const result = await auth.organization.setActive({ organizationId });
			if (result.error) throw new Error(result.error.message);
			await queryClient.cancelQueries();
			queryClient.clear();
			if (router.canDismiss()) router.dismissAll();
			router.replace("/(tabs)/(index)");
		},
		onError: async (error) => {
			console.warn("[switch-server]", error);
			// Switching asks the server; when it doesn't answer, say so and where.
			const up = await server.check();
			showNotice(
				up
					? t("toast.switch_server_failed")
					: t("mobile.server.switch_unreachable", {
							host: serverHost(serverUrl),
						}),
			);
		},
	});
}

/**
 * Settings → Server: every server you belong to, the current one checked, as
 * the language page lists languages; picking one switches to it.
 */
export function ServersSettingsScreen() {
	const { auth, serverUrl } = useConnection();
	const organizations = auth.useListOrganizations();
	const active = auth.useActiveOrganization();
	const switchServer = useSwitchServer();
	const isOwner = useIsAppOwner();
	const miniPlayerInset = useMiniPlayerInset();
	const current = active.data?.id;
	const switching = switchServer.isPending ? switchServer.variables : null;
	return (
		<ScrollView
			showsVerticalScrollIndicator={false}
			contentInsetAdjustmentBehavior="automatic"
			contentContainerStyle={{
				padding: space.lg,
				gap: space.lg,
				paddingBottom: space.lg + miniPlayerInset,
			}}
		>
			{organizations.isPending ? (
				<Spinner />
			) : (
				<GroupedList>
					{(organizations.data ?? []).map((organization, index) => (
						<GroupedRow
							key={organization.id}
							first={index === 0}
							leading={
								<ServerAvatar
									name={organization.name}
									logo={mediaUrl(serverUrl, organization.logo)}
									size={36}
								/>
							}
							label={organization.name}
							checked={organization.id === current}
							trailing={
								organization.id === switching ? <Spinner inline /> : null
							}
							disabled={!!switching}
							onPress={() => {
								if (organization.id !== current)
									switchServer.mutate(organization.id);
							}}
						/>
					))}
				</GroupedList>
			)}
			{isOwner ? (
				<GroupedList>
					<GroupedRow
						first
						icon={icons.plus}
						label={t("server.create")}
						href="/setup/server"
					/>
				</GroupedList>
			) : null}
		</ScrollView>
	);
}

const CREATE_SERVER = "__create_server__";

/**
 * Asks with the sheet every other pick-one list uses (Material on Android,
 * the system action sheet on iOS); the current server carries the check.
 */
export function usePickServer() {
	const { auth, serverUrl } = useConnection();
	const organizations = auth.useListOrganizations();
	const active = auth.useActiveOrganization();
	const switchServer = useSwitchServer();
	const isOwner = useIsAppOwner();
	const palette = usePalette();
	return async () => {
		const current = active.data?.id;
		const picked = await askChoice({
			title: t("server.select"),
			options: [
				...(organizations.data ?? []).map((organization) => ({
					id: organization.id,
					label: organization.name,
					leading: (
						<ServerAvatar
							name={organization.name}
							logo={mediaUrl(serverUrl, organization.logo)}
							size={36}
						/>
					),
					selected: organization.id === current,
				})),
				...(isOwner
					? [
							{
								id: CREATE_SERVER,
								label: t("server.create"),
								// In the avatars' slot, so its label lines up with theirs.
								leading: (
									<View
										style={{
											width: 36,
											height: 36,
											alignItems: "center",
											justifyContent: "center",
										}}
									>
										<Icon
											name={icons.plus}
											size={24}
											color={palette.textSecondary}
										/>
									</View>
								),
							},
						]
					: []),
			],
		});
		if (picked === CREATE_SERVER) router.push("/setup/server");
		else if (picked && picked !== current) switchServer.mutate(picked);
	};
}
