import {
	CaretLeft,
	CaretRight,
	TrendDown,
	TrendUp,
} from "@phosphor-icons/react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { readingDuration } from "@/features/reading-sessions/reading-duration";
import { FigureGrid } from "@/features/reading-sessions/reading-overview";
import { Segmented } from "@/features/reading-sessions/segmented";
import { cn } from "@/lib/utils";
import { m } from "@/paraglide/messages";
import { getLocale } from "@/paraglide/runtime";
import { BookShareList } from "./book-share-list";
import { TONE_BG, type Tone } from "./goal-gauge";
import {
	averageChange,
	bookShares,
	dayQualifies,
	hasGoal,
	periodCount,
	periodRange,
	periodSeries,
	periodSummary,
	type SeriesPoint,
	type StatsDay,
	type StatsGoals,
	type StatsPeriod,
	type StatsView,
	viewValue,
} from "./stats-model";
import {
	CARD,
	date,
	formatDay,
	numberFormat,
	type Overview,
	Section,
} from "./stats-shared";
import { TrendChart, type TrendMetric } from "./trend-chart";

const PERIODS: { value: StatsPeriod; label: () => string }[] = [
	{ value: "week", label: m.stats_period_week },
	{ value: "month", label: m.stats_period_month },
	{ value: "year", label: m.stats_period_year },
];
const METRICS: { value: TrendMetric; label: () => string }[] = [
	{ value: "time", label: m.stats_metric_time },
	{ value: "characters", label: m.stats_metric_characters },
];

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

/** Which daily goal, in the chart's own unit, a bar is measured against. */
function goalFor(view: StatsView, metric: TrendMetric, goals: StatsGoals) {
	if (metric === "characters")
		return view !== "listening" &&
			goals.readingUnit === "characters" &&
			goals.reading !== null
			? goals.reading
			: null;
	if (view === "reading" && goals.readingUnit === "minutes" && goals.reading)
		return goals.reading * 60;
	if (view === "listening" && goals.listeningMinutes)
		return goals.listeningMinutes * 60;
	return null;
}

export function TrendSection({
	data,
	days,
	goals,
	today,
	view,
}: {
	data: Overview;
	days: StatsDay[];
	goals: StatsGoals;
	today: string;
	view: StatsView;
}) {
	const [period, setPeriod] = useState<StatsPeriod>("week");
	const [chosenMetric, setMetric] = useState<TrendMetric>("time");
	const [offset, setOffset] = useState(0);
	const [selected, setSelected] = useState<string | null>(null);
	const [hovered, setHovered] = useState<string | null>(null);
	const metric: TrendMetric = view === "listening" ? "time" : chosenMetric;
	const format = numberFormat();
	const compact = numberFormat({
		notation: "compact",
		maximumFractionDigits: 1,
	});
	const value = (p: SeriesPoint) =>
		metric === "characters" ? p.characters : viewValue(p, view);
	const show = (v: number) =>
		metric === "characters" ? format.format(v) : readingDuration(v);
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
	const perDay = (s: typeof summary) =>
		metric === "characters"
			? s.elapsedDays > 0
				? s.characters / s.elapsedDays
				: 0
			: s.dailyAverage;
	const change = averageChange(perDay(summary), perDay(previous));
	// A first year averages only the months since history began.
	const first = days[0]?.day ?? today;
	const lived = points.filter((p) => !p.future && p.to >= first);
	const average =
		period === "year"
			? lived.reduce((sum, p) => sum + value(p), 0) / Math.max(1, lived.length)
			: perDay(summary);
	const daily = period !== "year";
	const goal = daily ? goalFor(view, metric, goals) : null;
	const byDay = new Map(days.map((d) => [d.day, d]));
	const marksGoals = daily && hasGoal(view, goals);
	const point = points.find((p) => p.key === (hovered ?? selected));
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
	const compareLabel =
		period === "week"
			? m.stats_compare_week()
			: period === "month"
				? m.stats_compare_month()
				: m.stats_compare_year();
	// What sits behind a previewed bar, in the units the headline does not show.
	const detailOf = (p: SeriesPoint) =>
		[
			metric === "characters" ? readingDuration(viewValue(p, view)) : null,
			view === "all" && metric === "time"
				? `${m.stats_view_reading()} ${readingDuration(p.reading)} · ${m.stats_view_listening()} ${readingDuration(p.listening)}`
				: null,
			view === "reading" && metric === "time" && p.characters > 0
				? m.stats_characters_value({ value: format.format(p.characters) })
				: null,
		]
			.filter(Boolean)
			.join(" · ");
	const averageLabel =
		period === "year" ? m.stats_average_monthly() : m.stats_average_daily();
	return (
		<>
			<Section
				title={m.stats_trend_title()}
				actions={
					<div className="flex flex-wrap gap-2">
						{view !== "listening" && (
							<Segmented
								label={m.stats_metric_label()}
								value={metric}
								options={METRICS}
								onChange={(next) => {
									setMetric(next);
									setSelected(null);
								}}
							/>
						)}
						<Segmented
							label={m.stats_period_label()}
							value={period}
							options={PERIODS}
							onChange={choosePeriod}
						/>
					</div>
				}
			>
				<div className={cn(CARD, "@container space-y-6")}>
					<div className="flex @lg:flex-row flex-col-reverse @lg:items-start @lg:justify-between gap-3">
						<div className="min-w-0 space-y-1" aria-live="polite">
							<p className="text-muted-foreground text-sm first-letter:uppercase">
								{point ? bucketLabel(point) : averageLabel}
							</p>
							<p className="font-semibold text-3xl tabular-nums tracking-tight">
								{show(point ? value(point) : average)}
							</p>
							{/* Always one line tall, so previewing a bar never shifts the chart. */}
							<div className="min-h-5 text-sm">
								{point ? (
									<p className="text-muted-foreground tabular-nums">
										{detailOf(point)}
									</p>
								) : (
									change !== null && (
										<p
											className={cn(
												"flex flex-wrap items-center gap-x-1",
												change >= 0
													? "text-foreground"
													: "text-muted-foreground",
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
											<span className="text-muted-foreground">
												{compareLabel}
											</span>
										</p>
									)
								)}
							</div>
						</div>
						<div className="-mx-2 @lg:mx-0 flex items-center @lg:justify-end justify-between gap-1">
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
						metric={metric}
						value={value}
						format={(v) =>
							metric === "characters" ? compact.format(v) : readingDuration(v)
						}
						average={average}
						goal={goal}
						met={(p) =>
							marksGoals && dayQualifies(byDay.get(p.from), view, goals)
						}
						selected={selected}
						onSelect={setSelected}
						hovered={hovered}
						onHover={setHovered}
						tickLabel={tickLabel}
						valueLabel={(p) =>
							`${bucketLabel(p)}: ${show(value(p))}${
								marksGoals && dayQualifies(byDay.get(p.from), view, goals)
									? `, ${m.stats_goal_done()}`
									: ""
							}`
						}
						label={m.stats_trend_chart_label({ range: rangeLabel })}
					/>
					<div className="flex flex-wrap gap-x-4 gap-y-2 text-muted-foreground text-xs">
						{view === "all" && metric === "time" && (
							<>
								<Legend tone="reading" label={m.stats_view_reading()} />
								<Legend tone="listening" label={m.stats_view_listening()} />
							</>
						)}
						<span className="flex items-center gap-1.5">
							<span
								aria-hidden="true"
								className="w-4 border-[var(--stats-average)] border-t-2 border-dotted"
							/>
							{m.stats_legend_average()}
						</span>
						{goal !== null && (
							<span className="flex items-center gap-1.5">
								<span
									aria-hidden="true"
									className="w-4 border-[var(--stats-reading)] border-t-2 border-dashed"
								/>
								{m.stats_legend_goal()}
							</span>
						)}
						{marksGoals && (
							<span className="flex items-center gap-1.5">
								<span
									aria-hidden="true"
									className="size-1.5 rounded-full bg-[var(--stats-reading)]"
								/>
								{m.stats_legend_goal_met()}
							</span>
						)}
					</div>
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
