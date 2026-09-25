import { readingDuration } from "@/features/reading-sessions/reading-duration";
import { cn } from "@/lib/utils";
import { m } from "@/paraglide/messages";
import { getLocale } from "@/paraglide/runtime";
import type { Tone } from "./goal-gauge";
import type { HeatCell } from "./stats-model";

const LEVEL_MIX = ["", "30%", "55%", "78%", "100%"];

function cellColor(level: number, tone: Tone) {
	if (level === 0) return undefined;
	return `color-mix(in oklab, var(--stats-${tone}) ${LEVEL_MIX[level]}, var(--stats-empty))`;
}

export function ActivityHeatmap({
	weeks,
	tone,
	activeDays,
}: {
	weeks: HeatCell[][];
	tone: Tone;
	activeDays: number;
}) {
	const locale = getLocale();
	const monthFormat = new Intl.DateTimeFormat(locale, {
		month: "short",
		timeZone: "UTC",
	});
	const dayFormat = new Intl.DateTimeFormat(locale, {
		weekday: "short",
		day: "numeric",
		month: "long",
		year: "numeric",
		timeZone: "UTC",
	});
	const weekdayFormat = new Intl.DateTimeFormat(locale, {
		weekday: "narrow",
		timeZone: "UTC",
	});
	const firstWeek = weeks[0] ?? [];
	const date = (day: string) => new Date(`${day}T00:00:00Z`);
	return (
		<div className="space-y-3">
			<div
				className="-mx-1 overflow-x-auto px-1 pb-1 [scrollbar-width:thin]"
				// Opens on the current week; older weeks scroll into view to the left.
				ref={(node) => {
					if (node) node.scrollLeft = node.scrollWidth;
				}}
			>
				<div className="inline-grid min-w-full grid-flow-col grid-rows-[auto_repeat(7,minmax(0,1fr))] gap-[3px] [grid-auto-columns:minmax(11px,1fr)]">
					<span aria-hidden="true" />
					{firstWeek.map((cell, d) => (
						<span
							key={cell.day}
							aria-hidden="true"
							className="pe-1 text-[10px] text-muted-foreground leading-[11px]"
						>
							{d % 2 === 0 ? weekdayFormat.format(date(cell.day)) : ""}
						</span>
					))}
					{weeks.map((week, w) => {
						const first = week[0]?.day ?? "";
						const previous = weeks[w - 1]?.[0]?.day;
						const newMonth =
							w > 0 && previous?.slice(5, 7) !== first.slice(5, 7);
						return [
							<span
								key={`label-${first}`}
								aria-hidden="true"
								className="h-4 overflow-visible whitespace-nowrap text-[10px] text-muted-foreground"
							>
								{newMonth ? monthFormat.format(date(first)) : ""}
							</span>,
							...week.map((cell) => (
								<span
									key={cell.day}
									title={
										cell.future
											? undefined
											: `${dayFormat.format(date(cell.day))} · ${
													cell.seconds > 0
														? readingDuration(cell.seconds)
														: m.stats_heatmap_none()
												}`
									}
									className={cn(
										"aspect-square min-h-[11px] rounded-[3px]",
										cell.future
											? "bg-transparent"
											: cell.level === 0 && "bg-[var(--stats-empty)]",
									)}
									style={{ backgroundColor: cellColor(cell.level, tone) }}
								/>
							)),
						];
					})}
				</div>
			</div>
			<div className="flex flex-wrap items-center justify-between gap-3 text-muted-foreground text-xs">
				<span>{m.stats_heatmap_active({ count: activeDays })}</span>
				<span className="flex items-center gap-1.5" aria-hidden="true">
					{m.stats_heatmap_less()}
					{[0, 1, 2, 3, 4].map((level) => (
						<span
							key={level}
							className="size-[11px] rounded-[3px] bg-[var(--stats-empty)]"
							style={{ backgroundColor: cellColor(level, tone) }}
						/>
					))}
					{m.stats_heatmap_more()}
				</span>
			</div>
		</div>
	);
}
