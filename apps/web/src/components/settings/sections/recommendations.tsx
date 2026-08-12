import {
	ArrowsClockwise,
	Books,
	CaretDown,
	CircleNotch,
	Funnel,
	Heart,
	Sparkle,
} from "@phosphor-icons/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
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

function ExplanationStep({
	icon,
	title,
	description,
}: {
	icon: ReactNode;
	title: string;
	description: string;
}) {
	return (
		<div className="rounded-lg bg-muted/60 p-3">
			<div className="mb-2 grid size-8 place-items-center rounded-md bg-primary/10 text-primary">
				{icon}
			</div>
			<h4 className="font-medium text-foreground text-sm">{title}</h4>
			<p className="mt-1 text-muted-foreground text-xs leading-relaxed">
				{description}
			</p>
		</div>
	);
}

function ExplanationSection({
	title,
	summary,
	children,
	open = false,
}: {
	title: string;
	summary: string;
	children: ReactNode;
	open?: boolean;
}) {
	return (
		<details className="group/section border-border border-t" open={open}>
			<summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-4 rounded-lg px-1 py-3 outline-none marker:hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 [&::-webkit-details-marker]:hidden">
				<span className="min-w-0">
					<span className="block font-medium text-foreground text-sm">
						{title}
					</span>
					<span className="mt-0.5 block text-muted-foreground text-xs">
						{summary}
					</span>
				</span>
				<CaretDown
					aria-hidden="true"
					className="size-4 shrink-0 text-muted-foreground transition-transform group-open/section:rotate-180"
				/>
			</summary>
			<div className="pb-4">{children}</div>
		</details>
	);
}

function WeightBar({
	label,
	value,
	scale = 100,
}: {
	label: string;
	value: number;
	scale?: number;
}) {
	return (
		<div className="grid grid-cols-[minmax(0,1fr)_2.5rem] gap-x-3 gap-y-1">
			<span className="truncate text-foreground text-xs">{label}</span>
			<span className="text-end font-medium text-xs tabular-nums">
				{value}%
			</span>
			<div
				aria-hidden="true"
				className="col-span-2 h-1.5 overflow-hidden rounded-full bg-muted"
			>
				<div
					className="h-full rounded-full bg-primary"
					style={{ width: `${(value / scale) * 100}%` }}
				/>
			</div>
		</div>
	);
}

export function RecommendationsSettings() {
	const { data: config, isLoading } = useQuery(
		orpc.settings.getRecommendations.queryOptions(),
	);

	const updateMutation = useMutation({
		mutationFn: (data: {
			personalizedEnabled?: boolean;
			similarEnabled?: boolean;
		}) => client.settings.updateRecommendations(data),
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
	const personalizedEnabled = config?.personalizedEnabled ?? true;
	const similarEnabled = config?.similarEnabled ?? true;
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
							{m["settings.recs.personalized_label"]()}
						</h3>
					}
					description={m["settings.recs.personalized_desc"]()}
				>
					{isLoading ? (
						<Skeleton className="h-[18px] w-8 shrink-0 rounded-full" />
					) : (
						<Switch
							aria-label={m["settings.recs.personalized_label"]()}
							checked={personalizedEnabled}
							onCheckedChange={(checked) =>
								updateMutation.mutate({ personalizedEnabled: checked })
							}
							disabled={updateMutation.isPending}
						/>
					)}
				</SettingControlRow>

				<SettingControlRow
					label={
						<h3 className="font-medium text-base text-foreground">
							{m["settings.recs.similar_label"]()}
						</h3>
					}
					description={m["settings.recs.similar_desc"]()}
				>
					{isLoading ? (
						<Skeleton className="h-[18px] w-8 shrink-0 rounded-full" />
					) : (
						<Switch
							aria-label={m["settings.recs.similar_label"]()}
							checked={similarEnabled}
							onCheckedChange={(checked) =>
								updateMutation.mutate({ similarEnabled: checked })
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
						disabled={
							!personalizedEnabled ||
							isLoading ||
							refreshFeedsMutation.isPending
						}
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

			<details className="group rounded-xl border border-border bg-muted/20 open:bg-muted/30">
				<summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-4 rounded-xl px-4 py-3 font-medium text-sm outline-none marker:hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 [&::-webkit-details-marker]:hidden">
					{m["settings.recs.how_it_works"]()}
					<CaretDown
						aria-hidden="true"
						className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
					/>
				</summary>
				<div className="border-border border-t px-4 py-4">
					<p className="max-w-2xl text-muted-foreground text-sm leading-relaxed">
						{m["settings.recs.overview_desc"]()}
					</p>

					<div className="mt-4 grid gap-2 sm:grid-cols-3">
						<ExplanationStep
							icon={<Heart aria-hidden="true" className="size-4" />}
							title={m["settings.recs.step_taste_title"]()}
							description={m["settings.recs.step_taste_desc"]()}
						/>
						<ExplanationStep
							icon={<Books aria-hidden="true" className="size-4" />}
							title={m["settings.recs.step_compare_title"]()}
							description={m["settings.recs.step_compare_desc"]()}
						/>
						<ExplanationStep
							icon={<Funnel aria-hidden="true" className="size-4" />}
							title={m["settings.recs.step_filter_title"]()}
							description={m["settings.recs.step_filter_desc"]()}
						/>
					</div>

					<div className="mt-4">
						<ExplanationSection
							open
							title={m["settings.recs.similarity_score_title"]()}
							summary={m["settings.recs.similarity_section_summary"]()}
						>
							<div className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
								{[
									[m["settings.recs.weight_semantic"](), 27],
									[m["settings.recs.weight_authors"](), 25],
									[m["settings.recs.weight_genres"](), 18],
									[m["settings.recs.weight_tags"](), 15],
									[m["settings.recs.weight_readers"](), 12],
									[m["settings.recs.weight_publisher"](), 3],
								].map(([label, value]) => (
									<WeightBar
										key={label}
										label={String(label)}
										value={Number(value)}
										scale={30}
									/>
								))}
							</div>
							<p className="mt-3 text-muted-foreground text-xs leading-relaxed">
								{m["settings.recs.similarity_notes"]()}
							</p>
						</ExplanationSection>

						<ExplanationSection
							title={m["settings.recs.personalization_title"]()}
							summary={m["settings.recs.activity_section_summary"]()}
						>
							<div className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
								{[
									[m["settings.recs.signal_like"](), 100],
									[m["settings.recs.signal_completed"](), 80],
									[m["settings.recs.signal_half_read"](), 60],
									[m["settings.recs.signal_want"](), 40],
									[m["settings.recs.signal_shelf"](), 30],
								].map(([label, value]) => (
									<WeightBar
										key={label}
										label={String(label)}
										value={Number(value)}
									/>
								))}
							</div>
							<p className="mt-3 text-muted-foreground text-xs leading-relaxed">
								{m["settings.recs.personalization_notes"]()}
							</p>
						</ExplanationSection>

						<ExplanationSection
							title={m["settings.recs.exclusions_title"]()}
							summary={m["settings.recs.exclusions_summary"]()}
						>
							<ul className="list-disc space-y-2 pl-5 text-muted-foreground text-xs leading-relaxed">
								<li>{m["settings.recs.exclusion_consumed"]()}</li>
								<li>{m["settings.recs.exclusion_feedback"]()}</li>
								<li>{m["settings.recs.exclusion_diversity"]()}</li>
							</ul>
						</ExplanationSection>

						<ExplanationSection
							title={m["settings.recs.technical_title"]()}
							summary={m["settings.recs.technical_summary"]()}
						>
							<dl className="grid gap-3 text-xs sm:grid-cols-2">
								{[
									[
										m["settings.recs.technical_ranking_label"](),
										m["settings.recs.technical_ranking_value"](),
									],
									[
										m["settings.recs.technical_live_label"](),
										m["settings.recs.technical_live_value"](),
									],
									[
										m["settings.recs.technical_language_label"](),
										m["settings.recs.technical_language_value"](),
									],
									[
										m["settings.recs.technical_decay_label"](),
										m["settings.recs.technical_decay_value"](),
									],
								].map(([label, value]) => (
									<div key={label}>
										<dt className="font-medium text-foreground">{label}</dt>
										<dd className="mt-0.5 text-muted-foreground leading-relaxed">
											{value}
										</dd>
									</div>
								))}
							</dl>
						</ExplanationSection>
					</div>
				</div>
			</details>
		</div>
	);
}
