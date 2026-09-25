import {
	CaretLeft,
	CaretRight,
	ChartBar,
	CheckCircle,
	TrendDown,
	TrendUp,
} from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { type CSSProperties, type ReactNode, useState } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { readingDuration } from "@/features/reading-sessions/reading-duration";
import { FigureGrid } from "@/features/reading-sessions/reading-overview";
import { Segmented } from "@/features/reading-sessions/segmented";
import { PAGE_SHELL } from "@/lib/page-layout";
import { cn } from "@/lib/utils";
import { m } from "@/paraglide/messages";
import { getLocale } from "@/paraglide/runtime";
import { type client, orpc } from "@/utils/orpc";
import { ActivityHeatmap } from "./activity-heatmap";
import { BookShareList } from "./book-share-list";
import { GoalEditor } from "./goal-editor";
import { GoalGauge, TONE_BG, type Tone } from "./goal-gauge";
import { HourChart } from "./hour-chart";
import {
	averageChange,
	bestDay,
	bookShares,
	dayQualifies,
	finishedIn,
	goalRatios,
	goalStreaks,
	hasGoal,
	heatmap,
	hoursFor,
	peakPart,
	periodCount,
	periodRange,
	periodSeries,
	periodSummary,
	type SeriesPoint,
	type StatsDay,
	type StatsGoals,
	type StatsPeriod,
	type StatsView,
	secondsIn,
	sessionsIn,
	viewValue,
} from "./stats-model";
import { TrendChart } from "./trend-chart";

const VIEWS: { value: StatsView; label: () => string }[] = [
	{ value: "all", label: m.stats_view_all },
	{ value: "reading", label: m.stats_view_reading },
	{ value: "listening", label: m.stats_view_listening },
];
const PERIODS: { value: StatsPeriod; label: () => string }[] = [
	{ value: "week", label: m.stats_period_week },
	{ value: "month", label: m.stats_period_month },
	{ value: "year", label: m.stats_period_year },
];

// Listening is the primary pushed toward the page's contrast side, so it reads as its own medium in both themes.
const TONES = {
	"--stats-reading": "var(--primary)",
	"--stats-listening":
		"light-dark(color-mix(in oklab, var(--primary) 42%, var(--background)), color-mix(in oklab, var(--primary) 45%, var(--foreground)))",
	"--stats-empty": "color-mix(in oklab, var(--foreground) 7%, transparent)",
	"--stats-average": "color-mix(in oklab, var(--foreground) 55%, transparent)",
} as CSSProperties;
const CARD =
	"rounded-3xl bg-[color-mix(in_oklab,var(--muted)_30%,var(--background))] p-5 sm:p-6";

function numberFormat(options?: Intl.NumberFormatOptions) {
	return new Intl.NumberFormat(getLocale(), {
		useGrouping: "always",
		maximumFractionDigits: 0,
		...options,
	});
}
const date = (day: string) => new Date(`${day}T00:00:00Z`);
function formatDay(day: string, options: Intl.DateTimeFormatOptions) {
	return new Intl.DateTimeFormat(getLocale(), {
		...options,
		timeZone: "UTC",
	}).format(date(day));
}

function Section({
	title,
	subtitle,
	actions,
	children,
}: {
	title: string;
	subtitle?: string;
	actions?: ReactNode;
	children: ReactNode;
}) {
	return (
		<section className="min-w-0 space-y-3">
			<div className="flex flex-wrap items-end justify-between gap-3 px-1">
				<div className="min-w-0">
					<h2 className="font-semibold text-xl tracking-tight">{title}</h2>
					{subtitle && (
						<p className="text-muted-foreground text-sm first-letter:uppercase">
							{subtitle}
						</p>
					)}
				</div>
				{actions}
			</div>
			{children}
		</section>
	);
}

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

type Overview = Awaited<ReturnType<typeof client.readingSessions.overview>>;

function StatsContent({ data, view }: { data: Overview; view: StatsView }) {
	const [goalOpen, setGoalOpen] = useState(false);
	const days = data.days as StatsDay[];
	const goals = data.goals as StatsGoals;
	const today = data.today;
	if (days.length === 0)
		return (
			<>
				<TodayCard
					days={days}
					goals={goals}
					today={today}
					view={view}
					onEditGoal={() => setGoalOpen(true)}
				/>
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
				{goalOpen && (
					<GoalEditor
						goals={goals}
						media={mediaOf(view)}
						onClose={() => setGoalOpen(false)}
					/>
				)}
			</>
		);
	return (
		<>
			<TodayCard
				days={days}
				goals={goals}
				today={today}
				view={view}
				onEditGoal={() => setGoalOpen(true)}
			/>
			<ActivitySection days={days} today={today} view={view} />
			<PeriodSections data={data} days={days} today={today} view={view} />
			<HabitsSection data={data} days={days} view={view} />
			{goalOpen && (
				<GoalEditor
					goals={goals}
					media={mediaOf(view)}
					onClose={() => setGoalOpen(false)}
				/>
			)}
		</>
	);
}

const mediaOf = (view: StatsView): ("reading" | "listening")[] =>
	view === "all" ? ["reading", "listening"] : [view];
const toneOf = (view: StatsView): Tone =>
	view === "listening" ? "listening" : "reading";

function goalText(
	medium: "reading" | "listening",
	goals: StatsGoals,
	short = false,
) {
	const format = numberFormat();
	if (medium === "listening")
		return goals.listeningMinutes === null
			? null
			: m.stats_goal_minutes_value({
					value: format.format(goals.listeningMinutes),
				});
	if (goals.reading === null) return null;
	return goals.readingUnit === "characters"
		? (short ? m.stats_characters_short : m.stats_goal_characters_value)({
				value: format.format(goals.reading),
			})
		: m.stats_goal_minutes_value({ value: format.format(goals.reading) });
}

function TodayCard({
	days,
	goals,
	today,
	view,
	onEditGoal,
}: {
	days: StatsDay[];
	goals: StatsGoals;
	today: string;
	view: StatsView;
	onEditGoal: () => void;
}) {
	const day = days.find((d) => d.day === today);
	const ratios = goalRatios(day, goals);
	const media = mediaOf(view);
	const arcs = media.map((medium) => ({
		tone: medium,
		ratio: ratios[medium],
	}));
	const withGoal = hasGoal(view, goals);
	const done = withGoal && dayQualifies(day, view, goals);
	const format = numberFormat();
	const characters = day?.characters ?? 0;
	const readSeconds = day?.readingSeconds ?? 0;
	const listenSeconds = day?.listeningSeconds ?? 0;
	const [headline, secondary] =
		view === "reading"
			? goals.readingUnit === "characters"
				? [format.format(characters), readingDuration(readSeconds)]
				: [
						readingDuration(readSeconds),
						m.stats_characters_value({ value: format.format(characters) }),
					]
			: view === "listening"
				? [
						readingDuration(listenSeconds),
						m.stats_sessions_value({ count: day ? sessionsIn(day, view) : 0 }),
					]
				: [
						readingDuration(day?.totalSeconds ?? 0),
						m.stats_characters_value({ value: format.format(characters) }),
					];
	const single =
		media.length === 1 ? goalText(media[0] ?? "reading", goals) : null;
	const streak = goalStreaks(days, today, view, goals);
	const best = bestDay(days, view);
	const gaugeLabel = media
		.map((medium) => {
			const ratio = ratios[medium];
			const name =
				medium === "reading"
					? m.stats_goal_reading()
					: m.stats_goal_listening();
			return ratio === null
				? `${name}: ${m.stats_goal_none()}`
				: `${name}: ${numberFormat({ style: "percent" }).format(Math.min(ratio, 9.99))}`;
		})
		.join(". ");
	return (
		<section aria-labelledby="stats-today" className={cn(CARD, "@container")}>
			<div className="grid @2xl:grid-cols-[minmax(0,22rem)_1fr] items-center @2xl:gap-10 gap-6">
				<div className="space-y-3">
					<GoalGauge arcs={arcs} label={gaugeLabel}>
						<h2
							id="stats-today"
							className="flex items-center gap-1.5 font-semibold text-sm"
						>
							{m.stats_today()}
							{done && (
								<CheckCircle
									aria-label={m.stats_goal_done()}
									weight="fill"
									className="size-4 text-[var(--stats-reading)]"
								/>
							)}
						</h2>
						<p className="font-normal text-4xl tabular-nums tracking-tight sm:text-5xl">
							{headline}
						</p>
						<p className="text-muted-foreground text-sm">{secondary}</p>
					</GoalGauge>
					{media.length > 1 ? (
						<ul className="mx-auto grid max-w-[22rem] grid-cols-2 gap-2 text-sm">
							{media.map((medium) => {
								const seconds =
									medium === "reading" ? readSeconds : listenSeconds;
								const target = goalText(medium, goals, true);
								const amount =
									medium === "reading" && goals.readingUnit === "characters"
										? m.stats_characters_short({
												value: format.format(characters),
											})
										: readingDuration(seconds);
								return (
									<li key={medium} className="flex min-w-0 items-start gap-2">
										<span
											aria-hidden="true"
											className={cn(
												"mt-1.5 size-2 shrink-0 rounded-full",
												TONE_BG[medium],
											)}
										/>
										<span className="min-w-0">
											<span className="block text-muted-foreground text-xs">
												{medium === "reading"
													? m.stats_view_reading()
													: m.stats_view_listening()}
											</span>
											<span className="block truncate font-medium tabular-nums">
												{amount}
												{target && (
													<span className="font-normal text-muted-foreground">
														{" "}
														/ {target}
													</span>
												)}
											</span>
										</span>
									</li>
								);
							})}
						</ul>
					) : null}
					<div className="flex justify-center">
						<button
							type="button"
							onClick={onEditGoal}
							className="flex min-h-10 items-center gap-0.5 rounded-lg px-2 text-muted-foreground text-sm hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
						>
							{media.length > 1
								? withGoal
									? m.stats_goal_edit_all()
									: m.stats_goal_set()
								: single
									? m.stats_goal_link({ goal: single })
									: m.stats_goal_set()}
							<CaretRight aria-hidden="true" className="size-4" />
						</button>
					</div>
				</div>
				<FigureGrid
					className="@2xl:grid-cols-2! self-stretch"
					figures={[
						{
							label: m.stats_streak_current(),
							value: m.stats_days_value({ count: streak.current }),
							detail: withGoal
								? m.stats_streak_goal_hint()
								: m.stats_streak_activity_hint(),
						},
						{
							label: m.stats_streak_best(),
							value: m.stats_days_value({ count: streak.best }),
						},
						{
							label: withGoal ? m.stats_goal_met_days() : m.stats_active_days(),
							value: format.format(streak.metDays),
						},
						{
							label: m.stats_best_day(),
							value: best ? readingDuration(secondsIn(best, view)) : "—",
							detail: best
								? formatDay(best.day, {
										day: "numeric",
										month: "short",
										year: "numeric",
									})
								: undefined,
						},
					]}
				/>
			</div>
		</section>
	);
}

function ActivitySection({
	days,
	today,
	view,
}: {
	days: StatsDay[];
	today: string;
	view: StatsView;
}) {
	const weeks = heatmap(days, today, view);
	const activeDays = weeks.flat().filter((c) => c.seconds > 0).length;
	return (
		<Section
			title={m.stats_activity_title()}
			subtitle={m.stats_activity_subtitle()}
		>
			<div className={CARD}>
				<ActivityHeatmap
					weeks={weeks}
					tone={toneOf(view)}
					activeDays={activeDays}
				/>
			</div>
		</Section>
	);
}

function PeriodSections({
	data,
	days,
	today,
	view,
}: {
	data: Overview;
	days: StatsDay[];
	today: string;
	view: StatsView;
}) {
	const [period, setPeriod] = useState<StatsPeriod>("week");
	const [offset, setOffset] = useState(0);
	const [selected, setSelected] = useState<string | null>(null);
	const count = periodCount(period, days[0]?.day, today);
	const range = periodRange(period, today, offset);
	const points = periodSeries(days, range, today);
	const summary = periodSummary(days, range, today, view);
	const previous = periodSummary(
		days,
		periodRange(period, today, offset + 1),
		today,
		view,
	);
	const change = averageChange(summary.dailyAverage, previous.dailyAverage);
	// A first year averages only the months since history began.
	const first = days[0]?.day ?? today;
	const lived = points.filter((p) => !p.future && p.to >= first);
	const average =
		period === "year"
			? lived.reduce((sum, p) => sum + viewValue(p, view), 0) /
				Math.max(1, lived.length)
			: summary.dailyAverage;
	const point = points.find((p) => p.key === selected);
	const locale = getLocale();
	const rangeLabel =
		period === "week"
			? new Intl.DateTimeFormat(locale, {
					day: "numeric",
					month: "short",
					year: "numeric",
					timeZone: "UTC",
				}).formatRange(date(range.from), date(range.to))
			: period === "month"
				? formatDay(range.from, { month: "long", year: "numeric" })
				: range.from.slice(0, 4);
	const bucketLabel = (p: SeriesPoint) =>
		period === "year"
			? formatDay(p.from, { month: "long", year: "numeric" })
			: formatDay(p.from, { weekday: "long", day: "numeric", month: "long" });
	const tickLabel = (p: SeriesPoint, index: number) => {
		if (period === "week") return formatDay(p.from, { weekday: "short" });
		if (period === "year") return formatDay(p.from, { month: "narrow" });
		return index % 7 === 0 ? String(Number(p.from.slice(8))) : null;
	};
	const shares = bookShares(
		data.bookDays,
		{ from: range.from, to: range.to },
		view,
	);
	const choosePeriod = (next: StatsPeriod) => {
		setPeriod(next);
		setOffset(0);
		setSelected(null);
	};
	const step = (delta: number) => {
		setOffset(offset + delta);
		setSelected(null);
	};
	const percent = numberFormat({ style: "percent" });
	const format = numberFormat();
	const compareLabel =
		period === "week"
			? m.stats_compare_week()
			: period === "month"
				? m.stats_compare_month()
				: m.stats_compare_year();
	return (
		<>
			<Section
				title={m.stats_trend_title()}
				actions={
					<Segmented
						label={m.stats_period_label()}
						value={period}
						options={PERIODS}
						onChange={choosePeriod}
					/>
				}
			>
				<div className={cn(CARD, "space-y-6")}>
					<div className="flex flex-wrap items-start justify-between gap-4">
						<div className="min-w-0 space-y-1" aria-live="polite">
							<p className="text-muted-foreground text-sm first-letter:uppercase">
								{point
									? bucketLabel(point)
									: period === "year"
										? m.stats_average_monthly()
										: m.stats_average_daily()}
							</p>
							<p className="font-semibold text-3xl tabular-nums tracking-tight">
								{readingDuration(point ? viewValue(point, view) : average)}
							</p>
							{!point && change !== null && (
								<p
									className={cn(
										"flex items-center gap-1 text-sm",
										change >= 0 ? "text-foreground" : "text-muted-foreground",
									)}
								>
									{change >= 0 ? (
										<TrendUp aria-hidden="true" className="size-4" />
									) : (
										<TrendDown aria-hidden="true" className="size-4" />
									)}
									<span className="tabular-nums">
										{change >= 0 ? "+" : "−"}
										{percent.format(Math.abs(change))}
									</span>
									<span className="text-muted-foreground">{compareLabel}</span>
								</p>
							)}
						</div>
						<div className="flex items-center gap-1">
							<Button
								variant="ghost"
								size="icon"
								aria-label={m.stats_previous_period()}
								disabled={offset >= count - 1}
								onClick={() => step(1)}
							>
								<CaretLeft aria-hidden="true" />
							</Button>
							<span className="min-w-28 text-center font-medium text-sm first-letter:uppercase">
								{rangeLabel}
							</span>
							<Button
								variant="ghost"
								size="icon"
								aria-label={m.stats_next_period()}
								disabled={offset === 0}
								onClick={() => step(-1)}
							>
								<CaretRight aria-hidden="true" />
							</Button>
						</div>
					</div>
					<TrendChart
						points={points}
						view={view}
						period={period}
						average={average}
						selected={selected}
						onSelect={setSelected}
						tickLabel={tickLabel}
						valueLabel={(p) =>
							`${bucketLabel(p)}: ${readingDuration(viewValue(p, view))}`
						}
					/>
					{view === "all" && (
						<div className="flex flex-wrap gap-4 text-muted-foreground text-xs">
							<Legend tone="reading" label={m.stats_view_reading()} />
							<Legend tone="listening" label={m.stats_view_listening()} />
							<span className="flex items-center gap-1.5">
								<span
									aria-hidden="true"
									className="w-4 border-[var(--stats-average)] border-t-2 border-dotted"
								/>
								{m.stats_legend_average()}
							</span>
						</div>
					)}
					<FigureGrid
						figures={[
							{
								label: m.stats_total_time(),
								value: readingDuration(summary.seconds),
							},
							{
								label: m.stats_active_days(),
								value: format.format(summary.activeDays),
							},
							...(view === "listening"
								? []
								: [
										{
											label: m.stats_characters(),
											value: format.format(summary.characters),
										},
									]),
							{
								label: m.stats_finished(),
								value: format.format(summary.finished),
							},
						]}
					/>
				</div>
			</Section>
			<Section title={m.stats_books_title()} subtitle={rangeLabel}>
				<div className={cn(CARD, "px-3 py-3 sm:px-3 sm:py-3")}>
					<BookShareList
						shares={shares.filter((share) => share.seconds >= 60)}
						books={data.books}
					/>
				</div>
			</Section>
		</>
	);
}

function Legend({ tone, label }: { tone: Tone; label: string }) {
	return (
		<span className="flex items-center gap-1.5">
			<span
				aria-hidden="true"
				className={cn("size-2 rounded-full", TONE_BG[tone])}
			/>
			{label}
		</span>
	);
}

function HabitsSection({
	data,
	days,
	view,
}: {
	data: Overview;
	days: StatsDay[];
	view: StatsView;
}) {
	const hours = hoursFor(data.hours, view);
	const part = peakPart(hours);
	const format = numberFormat();
	let seconds = 0;
	let finished = 0;
	let sessions = 0;
	let active = 0;
	for (const day of days) {
		const value = secondsIn(day, view);
		seconds += value;
		finished += finishedIn(day, view);
		sessions += sessionsIn(day, view);
		if (value > 0) active++;
	}
	const partLabel = part
		? {
				morning: m.stats_part_morning,
				afternoon: m.stats_part_afternoon,
				evening: m.stats_part_evening,
				night: m.stats_part_night,
			}[part]()
		: null;
	const headline = partLabel
		? view === "listening"
			? m.stats_habit_listening({ part: partLabel })
			: view === "reading"
				? m.stats_habit_reading({ part: partLabel })
				: m.stats_habit_all({ part: partLabel })
		: m.stats_habit_none();
	return (
		<Section title={m.stats_habits_title()}>
			<div className="grid @3xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-4">
				<div className={cn(CARD, "space-y-4")}>
					<p className="font-semibold text-lg tracking-tight">{headline}</p>
					<HourChart
						values={hours}
						tone={toneOf(view)}
						label={m.stats_hours_label()}
					/>
				</div>
				<FigureGrid
					className="@3xl:grid-cols-2! content-stretch"
					figures={[
						{ label: m.stats_all_time(), value: readingDuration(seconds) },
						{ label: m.stats_finished(), value: format.format(finished) },
						...(view === "listening" || data.speed === null
							? []
							: [
									{
										label: m.stats_speed(),
										value: m.stats_speed_value({
											value: format.format(data.speed),
										}),
									},
								]),
						{ label: m.stats_sessions(), value: format.format(sessions) },
						{
							label: m.stats_active_days(),
							value: format.format(active),
							detail: days[0]
								? m.stats_since({
										date: formatDay(days[0].day, {
											day: "numeric",
											month: "short",
											year: "numeric",
										}),
									})
								: undefined,
						},
					]}
				/>
			</div>
		</Section>
	);
}
