import { ArrowsClockwise, CircleNotch } from "@phosphor-icons/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
	SettingControlRow,
	SettingRows,
} from "@/components/settings/setting-rows";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { m } from "@/paraglide/messages";
import { getErrorMessage } from "@/utils/format";
import { client, orpc, queryClient } from "@/utils/orpc";

export function RecommendationsSettings() {
	const { data: config, isLoading } = useQuery(
		orpc.settings.getRecommendations.queryOptions(),
	);

	const updateMutation = useMutation({
		mutationFn: (data: { enabled: boolean }) =>
			client.settings.updateRecommendations(data),
		onSuccess: () => {
			toast.success(m["settings.recs.updated"]());
			queryClient.invalidateQueries({
				queryKey: orpc.settings.getRecommendations.queryOptions().queryKey,
			});
			queryClient.invalidateQueries({ queryKey: orpc.recommendations.key() });
		},
		onError: (err) =>
			toast.error(getErrorMessage(err, m["settings.recs.update_failed"]())),
	});

	const rebuildMutation = useMutation({
		mutationFn: () => client.settings.rebuildRecommendations(),
		onSuccess: (data) => {
			if (data.started) {
				toast.success(m["toast.recommendations_rebuild_started"]());
				queryClient.invalidateQueries({
					queryKey: orpc.tasks.getAllTasks.queryOptions().queryKey,
				});
				return;
			}
			if (data.reason === "already-running") {
				toast.info(m["toast.recommendations_rebuild_already_running"]());
				return;
			}
			toast.info(m["toast.recommendations_rebuild_disabled"]());
		},
		onError: (err) =>
			toast.error(
				getErrorMessage(err, m["toast.recommendations_rebuild_failed"]()),
			),
	});

	const enabled = config?.enabled ?? true;

	return (
		<div className="flex flex-col gap-8">
			<p className="max-w-2xl text-muted-foreground text-sm leading-relaxed">
				{m["settings.recs.desc"]()}
			</p>

			<SettingRows>
				<SettingControlRow
					label={
						<h3 className="font-medium text-base text-foreground">
							{m["settings.recs.toggle_label"]()}
						</h3>
					}
				>
					{isLoading ? (
						<Skeleton className="h-[18px] w-8 shrink-0 rounded-full" />
					) : (
						<Switch
							aria-label={m["settings.recs.toggle_label"]()}
							checked={enabled}
							onCheckedChange={(checked) =>
								updateMutation.mutate({ enabled: checked })
							}
							disabled={updateMutation.isPending}
						/>
					)}
				</SettingControlRow>

				<SettingControlRow
					label={
						<h3 className="font-medium text-base text-foreground">
							{m["settings.recs.rebuild_label"]()}
						</h3>
					}
					description={m["settings.recs.rebuild_desc"]()}
				>
					<Button
						variant="outline"
						size="sm"
						className="shrink-0 self-start sm:self-auto"
						onClick={() => rebuildMutation.mutate()}
						disabled={!enabled || isLoading || rebuildMutation.isPending}
					>
						{rebuildMutation.isPending ? (
							<CircleNotch data-icon="inline-start" className="animate-spin" />
						) : (
							<ArrowsClockwise data-icon="inline-start" />
						)}
						{m["settings.recs.rebuild"]()}
					</Button>
				</SettingControlRow>
			</SettingRows>
		</div>
	);
}
