import { useMemo } from "react";

export type CalendarDay = { day: string; count: number };

interface ReadingHeatmapProps {
	data: CalendarDay[];
	isLoading: boolean;
}

type Cell = { key: string; date: Date; count: number; level: number };

/** Days of history shown (≈ one year / 53 columns once aligned to Sunday).
 * Matches the server's calendar window in profile.repository.getActivityCalendar. */
const CALENDAR_DAYS = 364;

/** Tailwind classes for each intensity level (0 = empty). */
const LEVEL_CLASSES = [
	"bg-muted",
	"bg-primary/30",
	"bg-primary/55",
	"bg-primary/80",
	"bg-primary",
];

const DAY_ROWS = [
	{ key: "sun", label: "" },
	{ key: "mon", label: "Mon" },
	{ key: "tue", label: "" },
	{ key: "wed", label: "Wed" },
	{ key: "thu", label: "" },
	{ key: "fri", label: "Fri" },
	{ key: "sat", label: "" },
];
const MONTHS = [
	"Jan",
	"Feb",
	"Mar",
	"Apr",
	"May",
	"Jun",
	"Jul",
	"Aug",
	"Sep",
	"Oct",
	"Nov",
	"Dec",
];

function isoDay(date: Date): string {
	const y = date.getFullYear();
	const m = String(date.getMonth() + 1).padStart(2, "0");
	const d = String(date.getDate()).padStart(2, "0");
	return `${y}-${m}-${d}`;
}

function levelFor(count: number): number {
	if (count <= 0) return 0;
	if (count <= 1) return 1;
	if (count <= 3) return 2;
	if (count <= 6) return 3;
	return 4;
}

/** Builds the 53-week × 7-day grid (columns of weeks) ending today, plus the
 * per-column month labels (shown when a week starts a new month). */
function buildWeeks(data: CalendarDay[]): {
	weeks: Cell[][];
	total: number;
	monthLabels: string[];
} {
	const countByDay = new Map(data.map((d) => [d.day, d.count]));
	let total = 0;
	for (const d of data) total += d.count;

	const today = new Date();
	today.setHours(0, 0, 0, 0);
	const start = new Date(today);
	start.setDate(start.getDate() - CALENDAR_DAYS);
	start.setDate(start.getDate() - start.getDay()); // back to Sunday

	const weeks: Cell[][] = [];
	const cursor = new Date(start);
	while (cursor <= today) {
		const week: Cell[] = [];
		for (let i = 0; i < 7 && cursor <= today; i++) {
			const key = isoDay(cursor);
			const count = countByDay.get(key) ?? 0;
			week.push({ key, date: new Date(cursor), count, level: levelFor(count) });
			cursor.setDate(cursor.getDate() + 1);
		}
		weeks.push(week);
	}

	const monthLabels = weeks.map((week, index) => {
		const month = week[0]?.date.getMonth();
		const prevMonth = weeks[index - 1]?.[0]?.date.getMonth();
		return month !== undefined && month !== prevMonth ? MONTHS[month] : "";
	});

	return { weeks, total, monthLabels };
}

export function ReadingHeatmap({ data, isLoading }: ReadingHeatmapProps) {
	const { weeks, total, monthLabels } = useMemo(() => buildWeeks(data), [data]);

	return (
		<div className="rounded-lg border border-border/70 bg-card/40 p-4">
			<h3 className="mb-3 font-semibold text-sm">
				{isLoading ? (
					<span className="text-muted-foreground">
						Loading reading activity…
					</span>
				) : (
					<>
						{total.toLocaleString()} reading{" "}
						{total === 1 ? "activity" : "activities"} in the last year
					</>
				)}
			</h3>

			<div className="overflow-x-auto pb-1">
				<div className="inline-flex min-w-max flex-col gap-1">
					{/* Month labels */}
					<div className="flex gap-[3px]">
						<div className="w-7 shrink-0" />
						<div className="grid auto-cols-[11px] grid-flow-col gap-[3px]">
							{monthLabels.map((label, index) => (
								<span
									key={weeks[index]?.[0]?.key ?? index}
									className="h-3 whitespace-nowrap text-[10px] text-muted-foreground leading-3"
								>
									{label}
								</span>
							))}
						</div>
					</div>

					{/* Day labels + cells */}
					<div className="flex gap-[3px]">
						<div className="grid w-7 shrink-0 grid-rows-7 gap-[3px]">
							{DAY_ROWS.map((row) => (
								<span
									key={row.key}
									className="h-[11px] text-[9px] text-muted-foreground leading-[11px]"
								>
									{row.label}
								</span>
							))}
						</div>
						<div className="grid grid-flow-col grid-rows-7 gap-[3px]">
							{weeks.flatMap((week) =>
								week.map((cell) => (
									<span
										key={cell.key}
										title={`${cell.count} ${
											cell.count === 1 ? "activity" : "activities"
										} on ${cell.date.toLocaleDateString(undefined, {
											weekday: "short",
											month: "short",
											day: "numeric",
										})}`}
										className={`size-[11px] rounded-[2px] ring-1 ring-foreground/[0.04] ring-inset ${
											isLoading ? "bg-muted" : LEVEL_CLASSES[cell.level]
										}`}
									/>
								)),
							)}
						</div>
					</div>
				</div>
			</div>

			{/* Legend */}
			<div className="mt-3 flex items-center justify-end gap-1.5 text-[10px] text-muted-foreground">
				<span>Less</span>
				{LEVEL_CLASSES.map((cls) => (
					<span
						key={cls}
						aria-hidden
						className={`size-[11px] rounded-[2px] ring-1 ring-foreground/[0.04] ring-inset ${cls}`}
					/>
				))}
				<span>More</span>
			</div>
		</div>
	);
}
