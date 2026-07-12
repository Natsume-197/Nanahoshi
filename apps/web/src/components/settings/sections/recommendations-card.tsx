import { ArrowsClockwise, CircleNotch, Sparkle } from "@phosphor-icons/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { m } from "@/paraglide/messages";
import { getErrorMessage } from "@/utils/format";
import { client, orpc, queryClient } from "@/utils/orpc";

export function RecommendationsCard() {
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
		<Card>
			<CardHeader className="flex flex-row items-center justify-between border-b">
				<div className="flex items-center gap-2">
					<Sparkle className="size-4" />
					<CardTitle>{m["settings.recs.title"]()}</CardTitle>
				</div>
				{isLoading ? (
					<Skeleton className="h-[18px] w-8 rounded-full" />
				) : (
					<Switch
						checked={enabled}
						onCheckedChange={(checked) =>
							updateMutation.mutate({ enabled: checked })
						}
						disabled={updateMutation.isPending}
					/>
				)}
			</CardHeader>
			<CardContent className="flex items-center justify-between gap-4">
				<p className="text-muted-foreground text-sm">
					{m["settings.recs.desc"]()}
				</p>
				<Button
					variant="outline"
					size="sm"
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
			</CardContent>
		</Card>
	);
}
