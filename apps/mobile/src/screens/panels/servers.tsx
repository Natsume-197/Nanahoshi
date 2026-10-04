import { useMutation, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { FlatList } from "react-native";
import { Button } from "@/components/button";
import { showNotice } from "@/components/prompt";
import { ErrorState, Spinner } from "@/components/states";
import { t } from "@/lib/i18n";
import { usePlayer } from "@/player/provider";
import { useConnection } from "@/providers/app-provider";

/** The server switcher: a sheet, since picking a server is a quick choice. */
export function ServersScreen() {
	const { auth } = useConnection();
	const queryClient = useQueryClient();
	const player = usePlayer();
	const organizations = auth.useListOrganizations();
	const active = auth.useActiveOrganization();
	const switchServer = useMutation({
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
	if (organizations.isPending) return <Spinner />;
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
		/>
	);
}
