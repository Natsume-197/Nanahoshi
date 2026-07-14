import { CalendarDots } from "@phosphor-icons/react";
import { useMemo } from "react";

export type CalendarDay = { day: string; count: number };

interface ReadingHeatmapProps {
	data: CalendarDay[];
	isLoading: boolean;
}

type Cell = { key: string; date: Date; count: number; level: number };

/** Weeks shown in the compact sidebar grid (AniList-style, fits without scroll). */
const WEEKS_SHOWN = 18;

/** Tailwind classes for each intensity level (0 = empty). */
const LEVEL_CLASSES = [
	"bg-muted",
	"bg-primary/30",
	"bg-primary/55",
	"bg-primary/80",
	"bg-primary",
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

/** Builds the last WEEKS_SHOWN week columns (7 days each) ending today. */
function buildWeeks(data: CalendarDay[]): Cell[][] {
	const countByDay = new Map(data.map((d) => [d.day, d.count]));

	const today = new Date();
	today.setHours(0, 0, 0, 0);
	const start = new Date(today);
	start.setDate(start.getDate() - (WEEKS_SHOWN * 7 - 1));
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
	return weeks.slice(-WEEKS_SHOWN);
}

export function ReadingHeatmap({ data, isLoading }: ReadingHeatmapProps) {
	const weeks = useMemo(() => buildWeeks(data), [data]);

	return (
		<div className="rounded-xl bg-card/60 p-4 sm:p-5">
			<span className="flex items-center gap-1.5 font-semibold text-muted-foreground text-xs uppercase tracking-wide">
				<CalendarDots className="size-3.5 text-chart-1" />
				Reading activity
			</span>

			<div
				className="mt-3 grid gap-[3px]"
				style={{ gridTemplateColumns: `repeat(${weeks.length}, 1fr)` }}
			>
				{weeks.map((week) => (
					<div key={week[0]?.key} className="grid grid-rows-7 gap-[3px]">
						{week.map((cell) => (
							<span
								key={cell.key}
								title={`${cell.count} ${
									cell.count === 1 ? "activity" : "activities"
								} on ${cell.date.toLocaleDateString(undefined, {
									weekday: "short",
									month: "short",
									day: "numeric",
								})}`}
								className={`aspect-square w-full rounded-[2px] ${
									isLoading ? "bg-muted" : LEVEL_CLASSES[cell.level]
								}`}
							/>
						))}
					</div>
				))}
			</div>
		</div>
	);
}
