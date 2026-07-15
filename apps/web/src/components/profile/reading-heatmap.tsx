import { useMemo } from "react";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export type CalendarDay = { day: string; count: number };

interface ReadingHeatmapProps {
	data: CalendarDay[];
	isLoading: boolean;
}

type Cell = { key: string; date: Date; count: number; level: number };

/** Weeks shown in the compact sidebar grid (AniList-style, fits without scroll). */
const WEEKS_SHOWN = 28;

/**
 * Tailwind classes for each intensity level (0 = empty). Cells take the
 * profile accent (set by the profile page from the user's color) and fall
 * back to the theme primary.
 */
const LEVEL_CLASSES = [
	"bg-background/80",
	"bg-[var(--profile-accent,var(--primary))]/25",
	"bg-[var(--profile-accent,var(--primary))]/45",
	"bg-[var(--profile-accent,var(--primary))]/70",
	"bg-[var(--profile-accent,var(--primary))]",
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
		<div className="rounded-lg bg-card/60 p-4 sm:p-5">
			<h2 className="mb-3 font-semibold text-base">Activity History</h2>

			<div
				className="grid gap-1"
				style={{ gridTemplateColumns: `repeat(${weeks.length}, 1fr)` }}
			>
				{weeks.map((week) => (
					<div key={week[0]?.key} className="grid grid-rows-7 gap-1">
						{week.map((cell) => {
							const cellClassName = cn(
								"aspect-square w-full rounded-[3px]",
								isLoading ? "bg-background/80" : LEVEL_CLASSES[cell.level],
							);

							if (isLoading || cell.count === 0) {
								return (
									<span
										key={cell.key}
										aria-hidden="true"
										className={cellClassName}
									/>
								);
							}

							const tooltipLabel = `${cell.date.toLocaleDateString(undefined, {
								weekday: "long",
								month: "long",
								day: "numeric",
							})} · ${cell.count} ${
								cell.count === 1 ? "activity" : "activities"
							}`;

							return (
								<Tooltip key={cell.key}>
									<TooltipTrigger asChild>
										<span
											role="img"
											aria-label={tooltipLabel}
											className={cellClassName}
										/>
									</TooltipTrigger>
									<TooltipContent side="top" sideOffset={6}>
										{tooltipLabel}
									</TooltipContent>
								</Tooltip>
							);
						})}
					</div>
				))}
			</div>
		</div>
	);
}
