import { CaretRight, CheckCircle } from "@phosphor-icons/react";
import { readingDuration } from "@/features/reading-sessions/reading-duration";
import { FigureGrid } from "@/features/reading-sessions/reading-overview";
import { cn } from "@/lib/utils";
import { m } from "@/paraglide/messages";
import { GoalGauge, TONE_BG } from "./goal-gauge";
import {
	bestDay,
	dayQualifies,
	goalRatios,
	goalStreaks,
	hasGoal,
	type StatsDay,
	type StatsGoals,
	type StatsView,
	secondsIn,
	sessionsIn,
	typicalDay,
} from "./stats-model";
import {
	CARD,
	goalText,
	mediaOf,
	numberFormat,
	shortDate,
} from "./stats-shared";

export function TodayCard({
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
	const readsInCharacters = goals.readingUnit === "characters";
	// Without a goal the ring measures today against a typical recent day.
	const typical = {
		reading: typicalDay(days, today, (d) =>
			readsInCharacters && goals.reading !== null
				? d.characters
				: d.readingSeconds,
		),
		listening: typicalDay(days, today, (d) => d.listeningSeconds),
	};
	const measured = {
		reading:
			readsInCharacters && goals.reading !== null
				? (day?.characters ?? 0)
				: (day?.readingSeconds ?? 0),
		listening: day?.listeningSeconds ?? 0,
	};
	const arcs = media.map((medium) => {
		const base = typical[medium];
		return {
			tone: medium,
			ratio: ratios[medium] ?? (base ? measured[medium] / base : null),
		};
	});
	const withGoal = hasGoal(view, goals);
	const done = withGoal && dayQualifies(day, view, goals);
	const format = numberFormat();
	const percent = numberFormat({ style: "percent" });
	const characters = day?.characters ?? 0;
	const readSeconds = day?.readingSeconds ?? 0;
	const listenSeconds = day?.listeningSeconds ?? 0;
	const [headline, secondary] =
		view === "reading"
			? readsInCharacters
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
	const typicalSingle =
		!withGoal && media.length === 1 ? typical[media[0] ?? "reading"] : null;
	const streak = goalStreaks(days, today, view, goals);
	const best = bestDay(days, view);
	const gaugeLabel = media
		.map((medium, i) => {
			const name =
				medium === "reading"
					? m.stats_goal_reading()
					: m.stats_goal_listening();
			const ratio = arcs[i]?.ratio ?? null;
			return ratio === null
				? `${name}: ${m.stats_goal_none()}`
				: ratios[medium] === null
					? `${name}: ${m.stats_typical_share({ share: percent.format(ratio) })}`
					: `${name}: ${percent.format(Math.min(ratio, 9.99))}`;
		})
		.join(". ");
	return (
		<section aria-labelledby="stats-today" className={cn(CARD, "@container")}>
			<div className="grid @2xl:grid-cols-[minmax(0,22rem)_1fr] items-center @2xl:gap-10 gap-6">
				<div className="space-y-3">
					<GoalGauge arcs={arcs} label={gaugeLabel} done={done}>
						<h2
							id="stats-today"
							className="flex items-center gap-1.5 font-semibold text-sm"
						>
							{m.stats_today()}
							{done && (
								<CheckCircle
									aria-label={m.stats_goal_done()}
									weight="fill"
									className="zoom-in-50 fade-in size-4 animate-in text-[var(--stats-reading)] duration-500 motion-reduce:animate-none"
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
									medium === "reading" &&
									readsInCharacters &&
									goals.reading !== null
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
					) : typicalSingle ? (
						<p className="text-center text-muted-foreground text-xs">
							{m.stats_typical_day({
								amount:
									media[0] === "reading" &&
									readsInCharacters &&
									goals.reading !== null
										? m.stats_characters_short({
												value: format.format(typicalSingle),
											})
										: readingDuration(typicalSingle),
							})}
						</p>
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
							detail: best ? shortDate(best.day) : undefined,
						},
					]}
				/>
			</div>
		</section>
	);
}
