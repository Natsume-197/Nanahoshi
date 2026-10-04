import { useMutation, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { FlatList, View } from "react-native";
import { Button } from "@/components/button";
import { icons } from "@/components/icon";
import { askChoice, showNotice } from "@/components/prompt";
import { RowSkeleton } from "@/components/skeleton";
import { ErrorState } from "@/components/states";
import { useIsAppOwner } from "@/lib/abilities";
import { t } from "@/lib/i18n";
import { usePlayer } from "@/player/provider";
import { useConnection } from "@/providers/app-provider";
import { space } from "@/theme";

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
			router.dismissAll();
			router.replace("/(tabs)/(index)");
		},
		onError: () => showNotice(t("toast.switch_server_failed")),
	});
}

const CREATE_SERVER = "__create_server__";
const JOIN_SERVER = "__join_server__";

/**
 * Android asks with the Material sheet every other pick-one list uses; the
 * current server carries the check.
 */
export function usePickServer() {
	const { auth } = useConnection();
	const organizations = auth.useListOrganizations();
	const active = auth.useActiveOrganization();
	const switchServer = useSwitchServer();
	const isOwner = useIsAppOwner();
	return async () => {
		const current = active.data?.id;
		const picked = await askChoice({
			title: t("server.select"),
			options: [
				...(organizations.data ?? []).map((organization) => ({
					id: organization.id,
					label: organization.name,
					selected: organization.id === current,
				})),
				...(isOwner
					? [
							{
								id: CREATE_SERVER,
								label: t("server.create"),
								icon: icons.plus,
							},
						]
					: []),
				{
					id: JOIN_SERVER,
					label: t("mobile.join.action"),
					icon: icons.link,
				},
			],
		});
		if (picked === CREATE_SERVER) router.push("/setup/server");
		else if (picked === JOIN_SERVER) router.push("/join");
		else if (picked && picked !== current) switchServer.mutate(picked);
	};
}

/** The server switcher: a sheet, since picking a server is a quick choice. */
export function ServersScreen() {
	const { auth } = useConnection();
	const organizations = auth.useListOrganizations();
	const active = auth.useActiveOrganization();
	const switchServer = useSwitchServer();
	const isOwner = useIsAppOwner();
	if (organizations.isPending)
		return (
			<View style={{ paddingVertical: space.lg }}>
				<RowSkeleton count={3} square />
			</View>
		);
	if (organizations.error)
		return <ErrorState onRetry={() => organizations.refetch()} />;
	return (
		<FlatList
			data={organizations.data ?? []}
			keyExtractor={(item) => item.id}
			contentContainerStyle={{ padding: 16, gap: 12 }}
			renderItem={({ item }) => (
				<Button
					variant={active.data?.id === item.id ? "primary" : "secondary"}
					label={item.name}
					disabled={switchServer.isPending || active.data?.id === item.id}
					onPress={() => switchServer.mutate(item.id)}
				/>
			)}
			ListFooterComponent={
				<View style={{ paddingTop: space.sm, gap: 12 }}>
					{isOwner ? (
						<Button
							variant="outline"
							label={t("server.create")}
							disabled={switchServer.isPending}
							onPress={() => {
								// Out of the sheet first: the setup is a page of its own.
								router.back();
								router.push("/setup/server");
							}}
						/>
					) : null}
					<Button
						variant="outline"
						label={t("mobile.join.action")}
						disabled={switchServer.isPending}
						onPress={() => {
							router.back();
							router.push("/join");
						}}
					/>
				</View>
			}
		/>
	);
}
