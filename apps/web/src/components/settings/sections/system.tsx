import {
	ArrowsClockwise,
	CircleNotch,
	MagnifyingGlass,
	Palette,
} from "@phosphor-icons/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
	SettingControlRow,
	SettingRows,
	SettingStatRow,
} from "@/components/settings/setting-rows";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { m } from "@/paraglide/messages";
import { getErrorMessage } from "@/utils/format";
import { client, orpc, queryClient } from "@/utils/orpc";

export function AdminSystem() {
	const { data: stats, isLoading } = useQuery(
		orpc.admin.getSystemStats.queryOptions(),
	);
	const { data: sso } = useQuery(orpc.setup.ssoStatus.queryOptions());

	const reindexMutation = useMutation({
		mutationFn: () => client.admin.triggerBookReindex(),
		onSuccess: () => toast.success(m["toast.book_reindex_started"]()),
		onError: (err) =>
			toast.error(getErrorMessage(err, m["toast.book_reindex_failed"]())),
	});

	const backfillColorsMutation = useMutation({
		mutationFn: () => client.admin.backfillCoverColors(),
		onSuccess: (data) => {
			if (data.enqueued === 0) {
				toast.info(m["toast.cover_colors_already_extracted"]());
			} else {
				toast.success(
					m["toast.cover_color_extraction_started"]({
						count: data.enqueued,
					}),
				);
			}
		},
		onError: (err) =>
			toast.error(
				getErrorMessage(err, m["toast.cover_color_extraction_failed"]()),
			),
	});

	const rebuildRecommendationsMutation = useMutation({
		mutationFn: () => client.admin.triggerRecommendationsRebuild(),
		onSuccess: (data) => {
			if (data.started) {
				toast.success(
					m["toast.recommendations_rebuild_all_started"]({
						count: data.count,
					}),
				);
				queryClient.invalidateQueries({
					queryKey: orpc.tasks.getAllTasks.queryOptions().queryKey,
				});
				return;
			}
			if (data.reason === "already-running") {
				toast.info(m["toast.recommendations_rebuild_already_running"]());
				return;
			}
			toast.info(m["toast.recommendations_rebuild_none_enabled"]());
		},
		onError: (err) =>
			toast.error(
				getErrorMessage(err, m["toast.recommendations_rebuild_failed"]()),
			),
	});

	const searchProvider = stats?.searchProvider ?? "pgroonga";
	const isElasticsearch = searchProvider === "elasticsearch";

	const statCards = [
		{
			label: m["settings.system.users"](),
			value: stats?.userCount ?? 0,
		},
		{
			label: m["settings.system.servers"](),
			value: stats?.organizationCount ?? 0,
		},
		{
			label: m["settings.system.books"](),
			value: stats?.bookCount ?? 0,
		},
		{
			label: m["settings.system.libraries"](),
			value: stats?.libraryCount ?? 0,
		},
	];

	return (
		<div className="flex flex-col gap-12">
			<section className="flex flex-col gap-6">
				<div className="flex flex-col gap-1">
					<h2 className="font-semibold text-foreground text-xl">
						{m["settings.nav.overview"]()}
					</h2>
					<p className="text-muted-foreground text-sm">
						{m["settings.system.desc"]()}
					</p>
				</div>
				<SettingRows>
					{statCards.map(({ label, value }) => (
						<SettingStatRow
							key={label}
							label={label}
							value={value}
							loading={isLoading}
						/>
					))}
				</SettingRows>
			</section>

			<section className="flex flex-col gap-6">
				<h2 className="font-semibold text-foreground text-xl">
					{m["settings.system.search_engine"]()}
				</h2>
				<SettingRows>
					<SettingControlRow
						label={
							<span className="font-medium text-sm">
								{m["settings.system.search_engine"]()}
							</span>
						}
						description={
							isElasticsearch
								? m["settings.system.search_elasticsearch_desc"]()
								: m["settings.system.search_pgroonga_desc"]()
						}
					>
						{isLoading ? (
							<Skeleton className="h-6 w-32 rounded" />
						) : (
							<span className="inline-flex items-center rounded-full bg-primary/10 px-2.5 py-0.5 font-medium text-primary text-sm">
								{isElasticsearch ? "Elasticsearch" : "PGroonga"}
							</span>
						)}
					</SettingControlRow>
				</SettingRows>
			</section>

			<section className="flex flex-col gap-6">
				<h2 className="font-semibold text-foreground text-xl">
					{m["settings.system.sso"]()}
				</h2>
				<SettingRows>
					<SettingControlRow
						label={<span className="font-medium text-sm">SSO</span>}
						description={
							sso?.enabled
								? m["settings.system.sso_enabled_desc"]({ label: sso.label })
								: m["settings.system.sso_disabled_desc"]()
						}
					>
						<span
							className={`inline-flex items-center rounded-full px-2.5 py-0.5 font-medium text-sm ${
								sso?.enabled
									? "bg-primary/10 text-primary"
									: "bg-muted text-muted-foreground"
							}`}
						>
							{sso?.enabled
								? m["settings.system.enabled"]()
								: m["settings.system.disabled"]()}
						</span>
					</SettingControlRow>
				</SettingRows>
			</section>

			<section className="flex flex-col gap-6">
				<h2 className="font-semibold text-foreground text-xl">
					{m["settings.system.queue_dashboard"]()}
				</h2>
				<SettingRows>
					<SettingControlRow
						label={<span className="font-medium text-sm">Bull Board</span>}
						description={m["settings.system.queue_desc"]()}
					>
						<a
							href="/admin/queues/"
							target="_blank"
							rel="noopener noreferrer"
							className="inline-flex items-center rounded-md bg-primary px-3 py-2 font-medium text-primary-foreground text-sm hover:bg-primary/90"
						>
							{m["settings.system.open_bull_board"]()}
						</a>
					</SettingControlRow>
				</SettingRows>
			</section>

			<section className="flex flex-col gap-6">
				<h2 className="font-semibold text-foreground text-xl">
					{m["settings.system.maintenance"]()}
				</h2>
				<SettingRows>
					<SettingControlRow
						label={
							<div className="flex items-center gap-3">
								<div className="flex size-9 items-center justify-center rounded-lg bg-chart-2/10">
									<ArrowsClockwise className="size-4.5 text-chart-2" />
								</div>
								<div>
									<p className="font-medium text-sm">
										{m["settings.system.rebuild_recommendations"]()}
									</p>
									<p className="text-muted-foreground text-xs">
										{m["settings.system.rebuild_recommendations_desc"]()}
									</p>
								</div>
							</div>
						}
					>
						<Button
							variant="outline"
							size="sm"
							onClick={() => rebuildRecommendationsMutation.mutate()}
							disabled={rebuildRecommendationsMutation.isPending}
						>
							{rebuildRecommendationsMutation.isPending ? (
								<CircleNotch
									data-icon="inline-start"
									className="animate-spin"
								/>
							) : (
								<ArrowsClockwise data-icon="inline-start" />
							)}
							{m["settings.system.rebuild"]()}
						</Button>
					</SettingControlRow>
					<SettingControlRow
						label={
							<div className="flex items-center gap-3">
								<div className="flex size-9 items-center justify-center rounded-lg bg-primary/10">
									<MagnifyingGlass className="size-4.5 text-primary" />
								</div>
								<div>
									<p className="font-medium text-sm">
										{m["settings.system.reindex_books"]()}
									</p>
									<p className="text-muted-foreground text-xs">
										{isElasticsearch
											? m["settings.system.reindex_elasticsearch_desc"]()
											: m["settings.system.reindex_pgroonga_desc"]()}
									</p>
								</div>
							</div>
						}
					>
						<Button
							variant="outline"
							size="sm"
							onClick={() => reindexMutation.mutate()}
							disabled={reindexMutation.isPending || !isElasticsearch}
						>
							{reindexMutation.isPending ? (
								<CircleNotch className="mr-1.5 size-4 animate-spin" />
							) : (
								<MagnifyingGlass className="mr-1.5 size-4" />
							)}
							{m["settings.system.reindex"]()}
						</Button>
					</SettingControlRow>
					<SettingControlRow
						label={
							<div className="flex items-center gap-3">
								<div className="flex size-9 items-center justify-center rounded-lg bg-chart-5/10">
									<Palette className="size-4.5 text-chart-5" />
								</div>
								<div>
									<p className="font-medium text-sm">
										{m["settings.system.extract_cover_colors"]()}
									</p>
									<p className="text-muted-foreground text-xs">
										{m["settings.system.extract_cover_colors_desc"]()}
									</p>
								</div>
							</div>
						}
					>
						<Button
							variant="outline"
							size="sm"
							onClick={() => backfillColorsMutation.mutate()}
							disabled={backfillColorsMutation.isPending}
						>
							{backfillColorsMutation.isPending ? (
								<CircleNotch className="mr-1.5 size-4 animate-spin" />
							) : (
								<Palette className="mr-1.5 size-4" />
							)}
							{m["settings.system.extract"]()}
						</Button>
					</SettingControlRow>
				</SettingRows>
			</section>
		</div>
	);
}
