import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ScrollView } from "react-native";
import { GroupedList, GroupedRow } from "@/components/grouped-list";
import { showNotice } from "@/components/prompt";
import { Toggle } from "@/components/toggle";
import { t } from "@/lib/i18n";
import { useMiniPlayerInset } from "@/player/mini-player";
import { useApi } from "@/providers/app-provider";
import { space } from "@/theme";

export function PrivacySettingsScreen() {
	const miniPlayerInset = useMiniPlayerInset();
	const { orpc } = useApi();
	const queryClient = useQueryClient();
	const privacy = useQuery(orpc.profile.getPrivacy.queryOptions());
	const update = useMutation({
		...orpc.profile.updatePrivacy.mutationOptions(),
		onSuccess: () => {
			void queryClient.invalidateQueries({
				queryKey: orpc.profile.getPrivacy.key(),
			});
			// Member lists show the current book; the toggle changes them now.
			void queryClient.invalidateQueries({
				queryKey: orpc.members.withPresence.key(),
			});
		},
		onError: () => showNotice(t("settings.privacy.update_failed")),
	});
	// Optimistic: the switch shows what was just picked while it saves.
	const shareReadingActivity =
		update.isPending && update.variables
			? update.variables.shareReadingActivity
			: (privacy.data?.shareReadingActivity ?? true);

	return (
		<ScrollView
			showsVerticalScrollIndicator={false}
			contentInsetAdjustmentBehavior="automatic"
			contentContainerStyle={{
				paddingBottom: space.lg + miniPlayerInset,
			}}
		>
			<GroupedList footer={t("settings.privacy.desc")}>
				<GroupedRow
					first
					label={t("settings.privacy.share_activity")}
					subtitle={t("settings.privacy.share_activity_desc")}
					disabled={privacy.isPending}
					trailing={
						<Toggle
							value={shareReadingActivity}
							onValueChange={(checked) =>
								update.mutate({ shareReadingActivity: checked })
							}
						/>
					}
				/>
			</GroupedList>
		</ScrollView>
	);
}
