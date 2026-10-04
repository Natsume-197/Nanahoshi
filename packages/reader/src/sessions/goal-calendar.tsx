import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@nanahoshi/ui/components/popover";
import { cn } from "@nanahoshi/ui/lib/utils";
import { CaretLeft, CaretRight, Flag } from "@phosphor-icons/react";
import { type CSSProperties, type ReactNode, useState } from "react";
import { m } from "../i18n/paraglide/messages";
import { getLocale } from "../i18n/paraglide/runtime";
import {
	addDays,
	daysBetween,
	type GoalCalendarDay,
	goalDayCompletion,
} from "./reading-history-model";

const SURFACE = "color-mix(in oklab, var(--muted) 30%, var(--background))";
const MET_COLOR = "oklch(0.72 0.17 150)";
const PARTIAL_COLOR = "oklch(0.82 0.15 85)";

const utc = (day: string) => new Date(`${day}T12:00:00Z`);
const format = (day: string, options: Intl.DateTimeFormatOptions) =>
	new Intl.DateTimeFormat(getLocale(), { ...options, timeZone: "UTC" }).format(
		utc(day),
	);
const percent = (fraction: number) => Math.round(fraction * 100);
// A day's share of a book is often a few percent, so small ones keep a decimal.
const dayPercent = (fraction: number) => {
	const value = fraction * 100;
	return `${value < 10 ? Math.round(value * 10) / 10 : Math.round(value)} %`;
};
const bookShare = (fraction: number) =>
	new Intl.NumberFormat(getLocale(), {
		style: "percent",
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
	}).format(fraction);
const firstOfMonth = (day: string) => `${day.slice(0, 7)}-01`;

function shiftMonth(month: string, by: number) {
	const date = utc(month);
	date.setUTCMonth(date.getUTCMonth() + by, 1);
	return date.toISOString().slice(0, 10);
}

/** Whole weeks, Monday first, covering the month. */
function monthGrid(month: string) {
	const lead = (utc(month).getUTCDay() + 6) % 7;
	const length = daysBetween(month, shiftMonth(month, 1));
	return Array.from({ length: Math.ceil((lead + length) / 7) * 7 }, (_, i) =>
		addDays(month, i - lead),
	);
}

/** The goal's plan on a month calendar: where the book stood each day against the straight-line minimum. */
export function GoalCalendar({
	plan,
	today,
	goalDate,
	amount,
	compactAmount,
	withShare = false,
}: {
	plan: GoalCalendarDay[];
	today: string;
	goalDate: string;
	// Formats a book fraction in the reader's unit (characters, time or percent).
	amount: (fraction: number) => string;
	// Short form for a cell; null when the book only measures in percent.
	compactAmount: ((fraction: number) => string) | null;
	// Adds the day's share of the book under its figure.
	withShare?: boolean;
}) {
	const value = compactAmount ?? dayPercent;
	const first = plan[0]?.day ?? today;
	const firstMonth = firstOfMonth(first);
	const lastMonth = firstOfMonth(goalDate);
	const todayMonth = firstOfMonth(today);
	const [month, setMonth] = useState(
		todayMonth < firstMonth
			? firstMonth
			: todayMonth > lastMonth
				? lastMonth
				: todayMonth,
	);
	const byDay = new Map(plan.map((d) => [d.day, d]));
	const cells = monthGrid(month);
	const weekdays = cells
		.slice(0, 7)
		.map((day) => format(day, { weekday: "short" }));
	const range = new Intl.DateTimeFormat(getLocale(), {
		day: "numeric",
		month: "short",
		timeZone: "UTC",
	}).formatRange(utc(first), utc(goalDate));
	const nav =
		"grid size-8 cursor-pointer place-items-center rounded-full hover:bg-foreground/8 disabled:cursor-default disabled:opacity-30";

	return (
		<section className="space-y-3">
			<div className="flex flex-wrap items-center justify-between gap-2">
				<div className="flex items-center gap-1">
					<button
						type="button"
						disabled={month <= firstMonth}
						onClick={() => setMonth(shiftMonth(month, -1))}
						className={nav}
						aria-label={m.reading_goal_calendar_previous()}
					>
						<CaretLeft />
					</button>
					<h4 className="min-w-40 text-center font-semibold text-lg first-letter:uppercase">
						{format(month, { month: "long", year: "numeric" })}
					</h4>
					<button
						type="button"
						disabled={month >= lastMonth}
						onClick={() => setMonth(shiftMonth(month, 1))}
						className={nav}
						aria-label={m.reading_goal_calendar_next()}
					>
						<CaretRight />
					</button>
				</div>
				<span className="text-muted-foreground text-sm">
					{m.reading_goal_calendar_plan({ range })}
				</span>
			</div>
			<div className="overflow-hidden rounded-3xl border border-foreground/12">
				<div className="grid grid-cols-7 gap-px bg-foreground/[0.06]">
					{weekdays.map((w) => (
						<span
							key={w}
							className="py-2.5 text-center font-medium text-muted-foreground text-xs first-letter:uppercase sm:text-sm"
							style={{ background: SURFACE }}
						>
							{w}
						</span>
					))}
					{cells.map((day) => (
						<DayCell
							key={day}
							day={day}
							inMonth={day.slice(0, 7) === month.slice(0, 7)}
							entry={byDay.get(day)}
							today={today}
							goalDate={goalDate}
							amount={amount}
							value={value}
							withShare={withShare}
						/>
					))}
				</div>
			</div>
			<Legend />
		</section>
	);
}

function DayCell({
	day,
	inMonth,
	entry,
	today,
	goalDate,
	amount,
	value,
	withShare,
}: {
	day: string;
	inMonth: boolean;
	entry: GoalCalendarDay | undefined;
	today: string;
	goalDate: string;
	amount: (fraction: number) => string;
	// The cell's figure, in the reader's unit or book percent.
	value: (fraction: number) => string;
	withShare: boolean;
}) {
	const plan = inMonth ? entry : undefined;
	const isToday = day === today;
	const ahead = plan?.status === "ahead";
	const completion = plan ? goalDayCompletion(plan) : null;
	// Days outside the plan sit on the page background, so the plan reads as one block.
	const style: CSSProperties = {
		backgroundColor: plan ? SURFACE : "var(--background)",
		boxShadow: isToday
			? "inset 0 0 0 1.5px color-mix(in oklab, var(--foreground) 55%, transparent)"
			: undefined,
	};
	const className =
		"flex min-h-16 w-full min-w-0 flex-col justify-between p-1.5 text-left sm:min-h-24 sm:p-2.5";
	// Fixed anatomy: date top-left, markers and the day's ring top-right, its figure along the bottom.
	const body: ReactNode = (
		<>
			<span className="flex items-center justify-between gap-1">
				<span className="flex items-center gap-1.5">
					<span
						className={cn(
							"grid size-6 place-items-center rounded-full text-xs tabular-nums sm:size-7 sm:text-sm",
							isToday
								? "bg-foreground font-semibold text-background"
								: plan
									? "text-muted-foreground"
									: inMonth
										? "text-muted-foreground/60"
										: "text-muted-foreground/25",
						)}
					>
						{Number(day.slice(8))}
					</span>
					{isToday && (
						<span className="hidden font-medium text-sm sm:inline">
							{m.reading_goal_timeline_today()}
						</span>
					)}
				</span>
				<span className="flex items-center gap-1">
					{plan && day === goalDate && (
						<span className="flex items-center gap-1 rounded-full bg-foreground/10 px-1.5 py-0.5 font-medium text-[11px] leading-none sm:px-2 sm:py-1 sm:text-xs">
							<Flag
								weight="fill"
								aria-hidden="true"
								className="size-2.5 sm:size-3"
							/>
							<span className="hidden sm:inline">
								{m.reading_goal_calendar_goal_day()}
							</span>
						</span>
					)}
					{completion !== null && <DayRing completion={completion} />}
				</span>
			</span>
			{plan && (
				<span
					className={cn(
						// Too narrow on a phone: the ring and the goal panel's "left today" carry it there.
						"min-w-0 px-0.5 tabular-nums leading-tight max-sm:hidden",
						ahead ? "text-muted-foreground/60" : "text-foreground",
					)}
				>
					{/* What the day asked for, and for days lived what was read of it. */}
					<span className="block truncate text-sm">
						{!ahead && (
							<span className="font-medium">
								{value(plan.read ?? 0)}
								<span className="text-muted-foreground">/</span>
							</span>
						)}
						<span className={ahead ? undefined : "text-muted-foreground"}>
							{value(plan.target)}
						</span>
					</span>
					{withShare && (
						<span className="block truncate text-muted-foreground text-xs">
							({bookShare(ahead ? plan.target : (plan.read ?? 0))})
						</span>
					)}
				</span>
			)}
		</>
	);
	if (!plan)
		return (
			<div className={className} style={style}>
				{body}
			</div>
		);
	return (
		<Popover>
			<PopoverTrigger
				className={cn(className, "cursor-pointer hover:brightness-110")}
				style={style}
			>
				{body}
			</PopoverTrigger>
			<PopoverContent className="w-64 space-y-1 p-3 text-sm">
				<p className="font-medium first-letter:uppercase">
					{format(day, { weekday: "long", day: "numeric", month: "long" })}
				</p>
				<p className="text-muted-foreground">
					{ahead
						? m.reading_goal_calendar_planned({ amount: amount(plan.target) })
						: m.reading_goal_calendar_read({
								read: amount(plan.read ?? 0),
								target: amount(plan.target),
							})}
				</p>
				<p className="text-muted-foreground">
					{ahead
						? m.reading_goal_calendar_will_reach({
								percent: percent(plan.position),
							})
						: m.reading_goal_calendar_reached({
								percent: percent(plan.position),
							})}
				</p>
				{!ahead && (
					<p className="text-muted-foreground">
						{m.reading_goal_calendar_minimum_detail({
							percent: percent(plan.minimum),
						})}
					</p>
				)}
			</PopoverContent>
		</Popover>
	);
}

/** Fills with the day's share read: green once met, yellow part way, an empty gray track when nothing was read. */
function DayRing({
	completion,
	className,
}: {
	completion: number;
	className?: string;
}) {
	const radius = 7;
	const length = 2 * Math.PI * radius;
	const color = completion >= 1 ? MET_COLOR : PARTIAL_COLOR;
	return (
		<svg
			viewBox="0 0 18 18"
			aria-hidden="true"
			className={cn("size-3.5 shrink-0 -rotate-90 sm:size-4.5", className)}
		>
			<circle
				cx="9"
				cy="9"
				r={radius}
				fill="none"
				strokeWidth="2.5"
				className="stroke-foreground/15"
			/>
			{completion > 0 && (
				<circle
					cx="9"
					cy="9"
					r={radius}
					fill="none"
					strokeWidth="2.5"
					strokeLinecap="round"
					stroke={color}
					strokeDasharray={`${length * completion} ${length}`}
				/>
			)}
		</svg>
	);
}

function Legend() {
	return (
		<div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-muted-foreground text-xs">
			<span className="flex items-center gap-1.5">
				<DayRing completion={1} />
				{m.reading_goal_calendar_legend_met()}
			</span>
			<span className="flex items-center gap-1.5">
				<DayRing completion={0.5} />
				{m.reading_goal_calendar_legend_partial()}
			</span>
			<span className="flex items-center gap-1.5">
				<DayRing completion={0} />
				{m.reading_goal_calendar_legend_missed()}
			</span>
			<span className="max-sm:hidden">
				{m.reading_goal_calendar_legend_planned()}
			</span>
			<span className="basis-full sm:ml-auto sm:basis-auto">
				{m.reading_goal_calendar_legend_hint()}
			</span>
		</div>
	);
}
