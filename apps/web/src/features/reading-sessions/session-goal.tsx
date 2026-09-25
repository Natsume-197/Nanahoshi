import { Check, PencilSimple, Target } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { m } from "@/paraglide/messages";
import { getLocale } from "@/paraglide/runtime";
import { readingDuration } from "./reading-duration";
import type { ReadingGoalProgress, TodayTotals } from "./session-panel-model";

/** A full ring that fills with a ratio; past 1 it stays closed. */
export function ProgressRing({
	ratio,
	size,
	stroke,
	className,
	glow,
	animate,
	track = 0.18,
	children,
}: {
	ratio: number;
	size: number;
	stroke: number;
	className?: string;
	glow?: boolean;
	// Fill from empty on mount, like the stats page gauge.
	animate?: boolean;
	track?: number;
	children?: React.ReactNode;
}) {
	const radius = (size - stroke) / 2;
	const filled = Math.max(0, Math.min(1, ratio));
	return (
		<span
			className={cn(
				"relative inline-grid shrink-0 place-items-center",
				className,
			)}
			style={{ width: size, height: size }}
		>
			<svg
				aria-hidden="true"
				viewBox={`0 0 ${size} ${size}`}
				className={cn("absolute inset-0 -rotate-90", glow && "stats-goal-glow")}
			>
				<circle
					cx={size / 2}
					cy={size / 2}
					r={radius}
					fill="none"
					stroke="currentColor"
					strokeOpacity={track}
					strokeWidth={stroke}
				/>
				{filled > 0 && (
					<circle
						cx={size / 2}
						cy={size / 2}
						r={radius}
						fill="none"
						stroke="currentColor"
						strokeWidth={stroke}
						strokeLinecap="round"
						pathLength={1}
						strokeDasharray={`${filled} 1`}
						className={cn(
							"transition-[stroke-dasharray] duration-700 ease-out-quart motion-reduce:transition-none",
							animate && "stats-arc-in",
						)}
					/>
				)}
			</svg>
			{children}
		</span>
	);
}

const number = (value: number) =>
	new Intl.NumberFormat(getLocale(), { useGrouping: "always" }).format(value);

function amount(value: number, unit: ReadingGoalProgress["unit"]) {
	return unit === "characters"
		? m.reading_amount_chars({ value: number(value) })
		: m.reading_minutes_value({ value: number(value) });
}

/** Today's daily goal across every book, or today's total with a way to set one. */
export function DailyGoalCard({
	goal,
	day,
	loading,
	onEdit,
}: {
	goal: ReadingGoalProgress | null;
	day: TodayTotals | null | undefined;
	loading: boolean;
	onEdit: () => void;
}) {
	if (!goal)
		return (
			<div className="flex items-center justify-between gap-3">
				<div className="min-w-0">
					<p className="text-muted-foreground text-xs">
						{m.reading_today_total()}
					</p>
					<p className="font-medium tabular-nums">
						{loading ? "…" : readingDuration(day?.readingSeconds ?? 0)}
						{!!day?.characters && (
							<span className="font-normal text-muted-foreground text-xs">
								{" "}
								· {m.reading_amount_chars({ value: number(day.characters) })}
							</span>
						)}
					</p>
				</div>
				<button
					type="button"
					onClick={onEdit}
					className="flex min-h-9 shrink-0 items-center gap-1.5 rounded-full bg-foreground/[0.06] px-3 text-xs hover:bg-foreground/[0.1] focus-visible:outline-2 focus-visible:outline-ring"
				>
					<Target aria-hidden="true" className="size-4" />
					{m.stats_goal_set()}
				</button>
			</div>
		);
	const done = goal.ratio >= 1;
	const percent = new Intl.NumberFormat(getLocale(), {
		style: "percent",
		maximumFractionDigits: 0,
	}).format(Math.min(goal.ratio, 9.99));
	return (
		<div
			className="flex items-center gap-4"
			title={m.reading_daily_goal_hint()}
		>
			<ProgressRing
				ratio={goal.ratio}
				size={52}
				stroke={5}
				glow={done}
				animate
				className="text-[var(--stats-reading)]"
			>
				{done ? (
					<Check
						aria-label={m.stats_goal_done()}
						weight="bold"
						className="zoom-in-50 fade-in size-5 animate-in duration-500 motion-reduce:animate-none"
					/>
				) : (
					<span className="font-medium text-[11px] text-foreground tabular-nums">
						{percent}
					</span>
				)}
			</ProgressRing>
			<div className="min-w-0 flex-1">
				<p className="text-muted-foreground text-xs">
					{m.reading_daily_goal_today()}
				</p>
				<p className="truncate font-medium tabular-nums">
					{amount(goal.done, goal.unit)}{" "}
					<span className="font-normal text-muted-foreground text-xs">
						{m.reading_daily_goal_of({
							target: amount(goal.target, goal.unit),
						})}
					</span>
				</p>
				<p className="truncate text-muted-foreground text-xs tabular-nums">
					{done
						? m.stats_goal_done()
						: goal.remainingSeconds !== null && goal.unit === "characters"
							? m.reading_daily_goal_left_time({
									amount: amount(goal.remaining, goal.unit),
									duration: readingDuration(
										Math.max(60, goal.remainingSeconds),
									),
								})
							: m.reading_daily_goal_left({
									amount: amount(goal.remaining, goal.unit),
								})}
				</p>
			</div>
			<button
				type="button"
				onClick={onEdit}
				aria-label={m.reading_daily_goal_edit()}
				title={m.reading_daily_goal_edit()}
				className="grid size-9 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
			>
				<PencilSimple aria-hidden="true" className="size-4" />
			</button>
		</div>
	);
}
