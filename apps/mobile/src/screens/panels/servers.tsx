import { useMutation, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { View } from "react-native";
import { Icon, icons } from "@/components/icon";
import { askChoice, showNotice } from "@/components/prompt";
import { ServerAvatar } from "@/components/server-avatar";
import { useIsAppOwner } from "@/lib/abilities";
import { t } from "@/lib/i18n";
import { mediaUrl } from "@/lib/media";
import { usePlayer } from "@/player/provider";
import { useConnection } from "@/providers/app-provider";
import { usePalette } from "@/theme";

/** Leaves the current server: stops playback, drops its cache, back to Home. */
export function useSwitchServer() {
	const { auth } = useConnection();
	const queryClient = useQueryClient();
	const player = usePlayer();
	return useMutation({
		mutationFn: async (organizationId: string) => {
			await player.stop();
			const result = await auth.organization.setActive({ organizationId });
			if (result.error) throw new Error(result.error.message);
			await queryClient.cancelQueries();
			queryClient.clear();
			if (router.canDismiss()) router.dismissAll();
			router.replace("/(tabs)/(index)");
		},
		onError: () => showNotice(t("toast.switch_server_failed")),
	});
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
