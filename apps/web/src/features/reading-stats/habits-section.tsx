import { readingDuration } from "@/features/reading-sessions/reading-duration";
import { FigureGrid } from "@/features/reading-sessions/reading-overview";
import { cn } from "@/lib/utils";
import { m } from "@/paraglide/messages";
import { getLocale } from "@/paraglide/runtime";
import { TONE_BG, type Tone } from "./goal-gauge";
import { HourChart } from "./hour-chart";
import { HoverTip } from "./hover-tip";
import {
	finishedIn,
	hoursFor,
	peakPart,
	peakWeekday,
	type StatsDay,
	type StatsView,
	secondsIn,
	sessionsIn,
	weekGrid,
} from "./stats-model";
import {
	CARD,
	numberFormat,
	type Overview,
	Section,
	shortDate,
	toneOf,
} from "./stats-shared";

// 2024-01-01 was a Monday; the week clock is Monday first.
const weekdayName = (index: number, style: "long" | "short") =>
	new Intl.DateTimeFormat(getLocale(), {
		weekday: style,
		timeZone: "UTC",
	}).format(new Date(Date.UTC(2024, 0, 1 + index)));

/** When in the week the time goes: a dot per weekday and hour, sized by its share. */
function WeekClock({ grid, tone }: { grid: number[][]; tone: Tone }) {
	const max = Math.max(0, ...grid.flat());
	return (
		<figure aria-label={m.stats_week_clock_label()} className="space-y-2">
			<HoverTip className="grid grid-cols-[auto_repeat(24,minmax(0,1fr))] items-center gap-x-[2px] gap-y-1">
				{grid.map((row, d) => [
					<span
						key={`label-${weekdayName(d, "short")}`}
						className="pe-2 text-muted-foreground text-xs first-letter:uppercase"
					>
						{weekdayName(d, "short")}
					</span>,
					...row.map((value, h) => {
						const share = max > 0 ? value / max : 0;
						return (
							<span
								// biome-ignore lint/suspicious/noArrayIndexKey: the index is the hour.
								key={h}
								data-tip={`${weekdayName(d, "long")} · ${String(h).padStart(2, "0")}:00`}
								data-tip-detail={readingDuration(value)}
								className="group/dot grid aspect-square place-items-center"
							>
								<span
									className={cn(
										"block rounded-full transition-transform group-hover/dot:scale-125",
										share > 0 ? TONE_BG[tone] : "bg-[var(--stats-empty)]",
									)}
									style={{
										width: share > 0 ? `${30 + share * 70}%` : "22%",
										height: share > 0 ? `${30 + share * 70}%` : "22%",
										opacity: share > 0 ? 0.35 + share * 0.65 : 1,
									}}
								/>
							</span>
						);
					}),
				])}
			</HoverTip>
			<div
				aria-hidden="true"
				className="grid grid-cols-[auto_repeat(4,minmax(0,1fr))] text-muted-foreground text-xs tabular-nums"
			>
				<span className="invisible pe-2">{weekdayName(0, "short")}</span>
				{["00", "06", "12", "18"].map((hour) => (
					<span key={hour}>{hour}</span>
				))}
			</div>
		</figure>
	);
}

export function HabitsSection({
	data,
	days,
	view,
}: {
	data: Overview;
	days: StatsDay[];
	view: StatsView;
}) {
	const hours = hoursFor(data.weekHours, view);
	const grid = weekGrid(data.weekHours, view);
	const part = peakPart(hours);
	const weekday = peakWeekday(data.weekHours, view);
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
			<div className="grid @3xl:grid-cols-2 gap-4">
				<div className={cn(CARD, "space-y-4")}>
					<p className="font-semibold text-lg tracking-tight">{headline}</p>
					<HourChart
						values={hours}
						tone={toneOf(view)}
						label={m.stats_hours_label()}
					/>
				</div>
				<div className={cn(CARD, "space-y-4")}>
					<p className="font-semibold text-lg tracking-tight first-letter:uppercase">
						{weekday === null
							? m.stats_week_clock_title()
							: m.stats_week_clock_peak({
									weekday: weekdayName(weekday, "long"),
								})}
					</p>
					<WeekClock grid={grid} tone={toneOf(view)} />
				</div>
			</div>
			<FigureGrid
				figures={[
					{ label: m.stats_all_time(), value: readingDuration(seconds) },
					{ label: m.stats_finished(), value: format.format(finished) },
					{ label: m.stats_sessions(), value: format.format(sessions) },
					{
						label: m.stats_active_days(),
						value: format.format(active),
						detail: days[0]
							? m.stats_since({ date: shortDate(days[0].day) })
							: undefined,
					},
				]}
			/>
		</Section>
	);
}
