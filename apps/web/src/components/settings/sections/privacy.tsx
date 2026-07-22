import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
	SettingControlRow,
	SettingRows,
} from "@/components/settings/setting-rows";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { m } from "@/paraglide/messages";
import { getErrorMessage } from "@/utils/format";
import { client, orpc, queryClient } from "@/utils/orpc";

export function PrivacySettings() {
	const { data: privacy, isLoading } = useQuery(
		orpc.profile.getPrivacy.queryOptions(),
	);

	const updateMutation = useMutation({
		mutationFn: (data: { shareReadingActivity: boolean }) =>
			client.profile.updatePrivacy(data),
		onSuccess: () => {
			toast.success(m["settings.privacy.updated"]());
			queryClient.invalidateQueries({
				queryKey: orpc.profile.getPrivacy.queryOptions().queryKey,
			});
			// Members panels show the current book; a toggle changes them right away.
			queryClient.invalidateQueries({
				queryKey: orpc.members.withPresence.key(),
			});
		},
		onError: (err) =>
			toast.error(getErrorMessage(err, m["settings.privacy.update_failed"]())),
	});

	const shareReadingActivity = privacy?.shareReadingActivity ?? true;

	return (
		<div className="flex flex-col gap-8">
			<p className="max-w-2xl text-muted-foreground text-sm leading-relaxed">
				{m["settings.privacy.desc"]()}
			</p>

			<SettingRows>
				<SettingControlRow
					label={
						<h3 className="font-medium text-base text-foreground">
							{m["settings.privacy.share_activity"]()}
						</h3>
					}
					description={m["settings.privacy.share_activity_desc"]()}
				>
					{isLoading ? (
						<Skeleton className="h-[18px] w-8 shrink-0 rounded-full" />
					) : (
						<Switch
							aria-label={m["settings.privacy.share_activity"]()}
							checked={shareReadingActivity}
							onCheckedChange={(checked) =>
								updateMutation.mutate({ shareReadingActivity: checked })
							}
							disabled={updateMutation.isPending}
						/>
					)}
				</SettingControlRow>
			</SettingRows>
		</div>
	);
}
