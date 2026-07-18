import { ArrowsClockwise, CircleNotch, Sparkle } from "@phosphor-icons/react";
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

	const refreshFeedsMutation = useMutation({
		mutationFn: () => client.settings.refreshRecommendationFeeds(),
		onSuccess: (data) => {
			if (data.started) {
				toast.success(m["toast.recommendations_feeds_started"]());
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
	const lastRun = config?.lastRun ?? null;

	const formatDuration = (ms: number) => {
		if (ms < 1000) return "<1s";
		const totalSeconds = Math.round(ms / 1000);
		if (totalSeconds < 60) return `${totalSeconds}s`;
		return `${Math.floor(totalSeconds / 60)}min ${totalSeconds % 60}s`;
	};
	const modeLabel =
		lastRun?.mode === "feeds"
			? m["settings.recs.mode_feeds"]()
			: lastRun?.mode === "full"
				? m["settings.recs.mode_full"]()
				: m["settings.recs.mode_incremental"]();
	const lastRunStats = lastRun
		? [
				modeLabel,
				formatDuration(lastRun.durationMs),
				m["settings.recs.stat_works"]({ count: lastRun.works }),
				...(lastRun.catalogChanged
					? [
							m["settings.recs.stat_similarities"]({
								count: lastRun.similarities,
							}),
						]
					: []),
				m["settings.recs.stat_members"]({ count: lastRun.members }),
			].join(" · ")
		: null;

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
							{m["settings.recs.refresh_feeds_label"]()}
						</h3>
					}
					description={m["settings.recs.refresh_feeds_desc"]()}
				>
					<Button
						variant="outline"
						size="sm"
						className="shrink-0 self-start sm:self-auto"
						onClick={() => refreshFeedsMutation.mutate()}
						disabled={!enabled || isLoading || refreshFeedsMutation.isPending}
					>
						{refreshFeedsMutation.isPending ? (
							<CircleNotch data-icon="inline-start" className="animate-spin" />
						) : (
							<Sparkle data-icon="inline-start" />
						)}
						{m["settings.recs.refresh_feeds"]()}
					</Button>
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

				{lastRun ? (
					<SettingControlRow
						label={
							<h3 className="font-medium text-base text-foreground">
								{m["settings.recs.last_run_label"]()}
							</h3>
						}
						description={lastRunStats ?? undefined}
					>
						<span className="shrink-0 text-muted-foreground text-sm">
							{new Date(lastRun.finishedAt).toLocaleString()}
						</span>
					</SettingControlRow>
				) : null}
			</SettingRows>
		</div>
	);
}
