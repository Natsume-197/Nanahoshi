import { readingDuration } from "@/features/reading-sessions/reading-duration";
import { cn } from "@/lib/utils";
import { m } from "@/paraglide/messages";
import { getLocale } from "@/paraglide/runtime";
import type { Tone } from "./goal-gauge";
import { HoverTip } from "./hover-tip";
import type { HeatCell } from "./stats-model";
import { rovingKey } from "./stats-shared";

const LEVEL_MIX = ["", "30%", "55%", "78%", "100%"];

function cellColor(level: number, tone: Tone) {
	if (level === 0) return undefined;
	return `color-mix(in oklab, var(--stats-${tone}) ${LEVEL_MIX[level]}, var(--stats-empty))`;
}

// Opens on the current week; a stable ref so choosing a day never scrolls back.
function scrollToEnd(node: HTMLDivElement | null) {
	if (node) node.scrollLeft = node.scrollWidth;
}

export function ActivityHeatmap({
	weeks,
	tone,
	activeDays,
	selected,
	onSelect,
}: {
	weeks: HeatCell[][];
	tone: Tone;
	activeDays: number;
	selected: string | null;
	onSelect: (day: string | null) => void;
}) {
	const locale = getLocale();
	const monthFormat = new Intl.DateTimeFormat(locale, {
		month: "short",
		timeZone: "UTC",
	});
	const dayFormat = new Intl.DateTimeFormat(locale, {
		weekday: "long",
		day: "numeric",
		month: "long",
		year: "numeric",
		timeZone: "UTC",
	});
	const shortDay = new Intl.DateTimeFormat(locale, {
		weekday: "short",
		day: "numeric",
		month: "short",
		timeZone: "UTC",
	});
	const weekdayFormat = new Intl.DateTimeFormat(locale, {
		weekday: "narrow",
		timeZone: "UTC",
	});
	const firstWeek = weeks[0] ?? [];
	const date = (day: string) => new Date(`${day}T00:00:00Z`);
	const lived = weeks.flat().filter((c) => !c.future);
	// One tab stop for the whole grid: the chosen day, else today.
	const focusDay = selected ?? lived.at(-1)?.day;
	return (
		<div className="space-y-3">
			<HoverTip>
				<div
					className="-mx-1 overflow-x-auto px-1 py-1 [scrollbar-width:thin]"
					ref={scrollToEnd}
				>
					<fieldset
						aria-label={m.stats_heatmap_label()}
						onKeyDown={(event) =>
							rovingKey(event, {
								ArrowDown: 1,
								ArrowUp: -1,
								ArrowRight: 7,
								ArrowLeft: -7,
							})
						}
						className="m-0 inline-grid min-w-full grid-flow-col grid-rows-[auto_repeat(7,minmax(0,1fr))] gap-[3px] border-0 p-0 [grid-auto-columns:minmax(11px,1fr)]"
					>
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
								...week.map((cell) =>
									cell.future ? (
										<span key={cell.day} aria-hidden="true" />
									) : (
										<button
											key={cell.day}
											type="button"
											data-roving
											tabIndex={cell.day === focusDay ? 0 : -1}
											aria-pressed={cell.day === selected}
											aria-label={`${dayFormat.format(date(cell.day))}: ${
												cell.seconds > 0
													? readingDuration(cell.seconds)
													: m.stats_heatmap_none()
											}`}
											data-tip={shortDay.format(date(cell.day))}
											data-tip-detail={
												cell.seconds > 0
													? readingDuration(cell.seconds)
													: m.stats_heatmap_none()
											}
											onClick={() =>
												onSelect(cell.day === selected ? null : cell.day)
											}
											className={cn(
												"aspect-square min-h-[11px] cursor-pointer rounded-[3px] outline-offset-1 transition-shadow hover:ring-2 hover:ring-foreground/40 focus-visible:outline-2 focus-visible:outline-ring",
												cell.level === 0 && "bg-[var(--stats-empty)]",
												cell.day === selected &&
													"ring-2 ring-foreground ring-offset-1 ring-offset-background",
											)}
											style={{ backgroundColor: cellColor(cell.level, tone) }}
										/>
									),
								),
							];
						})}
					</fieldset>
				</div>
			</HoverTip>
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
