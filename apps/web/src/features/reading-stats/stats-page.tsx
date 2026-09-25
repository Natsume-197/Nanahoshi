import { ChartBar } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Segmented } from "@/features/reading-sessions/segmented";
import { PAGE_SHELL } from "@/lib/page-layout";
import { cn } from "@/lib/utils";
import { m } from "@/paraglide/messages";
import { orpc } from "@/utils/orpc";
import { ActivitySection } from "./activity-section";
import { GoalEditor } from "./goal-editor";
import { HabitsSection } from "./habits-section";
import { PaceSection } from "./pace-section";
import { RecordsSection } from "./records-section";
import type { StatsDay, StatsGoals, StatsView } from "./stats-model";
import { CARD, mediaOf, type Overview, TONES } from "./stats-shared";
import { TodayCard } from "./today-card";
import { TrendSection } from "./trend-section";

const VIEWS: { value: StatsView; label: () => string }[] = [
	{ value: "all", label: m.stats_view_all },
	{ value: "reading", label: m.stats_view_reading },
	{ value: "listening", label: m.stats_view_listening },
];

export function StatsPage({
	view,
	onViewChange,
}: {
	view: StatsView;
	onViewChange: (view: StatsView) => void;
}) {
	const [timeZone] = useState(
		() => Intl.DateTimeFormat().resolvedOptions().timeZone,
	);
	const query = useQuery(
		orpc.readingSessions.overview.queryOptions({ input: { timeZone } }),
	);
	return (
		<div
			style={TONES}
			className={cn(
				PAGE_SHELL,
				"@container mx-auto w-full max-w-6xl space-y-8",
			)}
		>
			<header className="flex flex-wrap items-center justify-between gap-4">
				<h1 className="font-bold text-3xl tracking-tight">{m.stats_title()}</h1>
				<Segmented
					label={m.stats_view_label()}
					value={view}
					options={VIEWS}
					onChange={onViewChange}
				/>
			</header>
			{query.isPending ? (
				<StatsSkeleton />
			) : query.isError ? (
				<div className={cn(CARD, "space-y-3 text-center")} role="alert">
					<p>{m.stats_error()}</p>
					<Button variant="secondary" onClick={() => query.refetch()}>
						{m.stats_retry()}
					</Button>
				</div>
			) : (
				<StatsContent data={query.data} view={view} />
			)}
		</div>
	);
}

function StatsSkeleton() {
	return (
		<div role="status" className="space-y-8">
			<span className="sr-only">{m.stats_loading()}</span>
			<Skeleton className="h-80 rounded-3xl" />
			<Skeleton className="h-52 rounded-3xl" />
			<div className="space-y-3">
				<Skeleton className="h-7 w-40" />
				<Skeleton className="h-96 rounded-3xl" />
			</div>
		</div>
	);
}

function StatsContent({ data, view }: { data: Overview; view: StatsView }) {
	const [goalOpen, setGoalOpen] = useState(false);
	const [selectedDay, setSelectedDay] = useState<string | null>(null);
	const days = data.days as StatsDay[];
	const goals = data.goals as StatsGoals;
	const today = data.today;
	const editor = goalOpen && (
		<GoalEditor
			goals={goals}
			media={mediaOf(view)}
			onClose={() => setGoalOpen(false)}
		/>
	);
	const todayCard = (
		<TodayCard
			days={days}
			goals={goals}
			today={today}
			view={view}
			onEditGoal={() => setGoalOpen(true)}
		/>
	);
	if (days.length === 0)
		return (
			<>
				{todayCard}
				<div
					className={cn(
						CARD,
						"flex flex-col items-center gap-3 py-12 text-center",
					)}
				>
					<ChartBar
						aria-hidden="true"
						className="size-10 text-muted-foreground"
					/>
					<h2 className="font-semibold text-lg">{m.stats_empty_title()}</h2>
					<p className="max-w-md text-muted-foreground text-sm">
						{m.stats_empty_hint()}
					</p>
					<Button variant="secondary" render={<Link to="/dashboard/books" />}>
						{m.stats_empty_action()}
					</Button>
				</div>
				{editor}
			</>
		);
	return (
		<>
			{todayCard}
			<ActivitySection
				data={data}
				days={days}
				today={today}
				view={view}
				selected={selectedDay}
				onSelect={setSelectedDay}
			/>
			<TrendSection
				data={data}
				days={days}
				goals={goals}
				today={today}
				view={view}
			/>
			{view !== "listening" && <PaceSection days={days} today={today} />}
			<RecordsSection data={data} days={days} view={view} />
			<HabitsSection data={data} days={days} view={view} />
			{editor}
		</>
	);
}
