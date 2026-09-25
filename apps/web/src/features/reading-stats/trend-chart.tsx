import { readingDuration } from "@/features/reading-sessions/reading-duration";
import { timeMaximum } from "@/features/reading-sessions/reading-history-model";
import { cn } from "@/lib/utils";
import { m } from "@/paraglide/messages";
import { TONE_BG } from "./goal-gauge";
import {
	type SeriesPoint,
	type StatsPeriod,
	type StatsView,
	viewValue,
} from "./stats-model";

export function TrendChart({
	points,
	view,
	period,
	average,
	selected,
	onSelect,
	tickLabel,
	valueLabel,
}: {
	points: SeriesPoint[];
	view: StatsView;
	period: StatsPeriod;
	average: number;
	selected: string | null;
	onSelect: (key: string | null) => void;
	tickLabel: (point: SeriesPoint, index: number) => string | null;
	valueLabel: (point: SeriesPoint) => string;
}) {
	const peak = Math.max(0, average, ...points.map((p) => viewValue(p, view)));
	const max = timeMaximum(peak);
	const dense = points.length > 12;
	return (
		<div className="flex gap-2">
			<div className="relative min-w-0 flex-1">
				<div className="relative h-48">
					{[1, 0.5].map((fraction) => (
						<div
							key={fraction}
							aria-hidden="true"
							className="absolute inset-x-0 border-border/60 border-t border-dashed"
							style={{ bottom: `${fraction * 100}%` }}
						/>
					))}
					<div
						aria-hidden="true"
						className="absolute inset-x-0 bottom-0 border-border border-t"
					/>
					{average > 0 && (
						<div
							aria-hidden="true"
							className="absolute inset-x-0 z-10 border-[var(--stats-average)] border-t-2 border-dotted"
							style={{ bottom: `${(average / max) * 100}%` }}
						/>
					)}
					<div
						className={cn(
							"absolute inset-0 flex items-end",
							dense ? "gap-[2px]" : "gap-1.5 sm:gap-3",
						)}
					>
						{points.map((point) => {
							const value = viewValue(point, view);
							const both = point.reading + point.listening;
							const listeningShare =
								view === "all" && both > 0 ? point.listening / both : 0;
							const active = selected === point.key;
							const dimmed = selected !== null && !active;
							return (
								<button
									key={point.key}
									type="button"
									disabled={point.future}
									aria-pressed={active}
									aria-label={valueLabel(point)}
									onClick={() => onSelect(active ? null : point.key)}
									className="group relative flex h-full min-w-0 flex-1 cursor-pointer items-end justify-center rounded-md focus-visible:outline-2 focus-visible:outline-ring disabled:cursor-default"
								>
									<span
										className={cn(
											"flex w-full max-w-10 flex-col overflow-hidden rounded-t-[5px] transition-[height,opacity] duration-300 ease-out motion-reduce:transition-none",
											dense && "rounded-t-[2px]",
											dimmed && "opacity-35",
											!point.future && !dimmed && "group-hover:opacity-80",
										)}
										style={{
											height:
												value > 0 ? `max(3px, ${(value / max) * 100}%)` : 0,
										}}
									>
										{listeningShare > 0 && (
											<span
												className={TONE_BG.listening}
												style={{ height: `${listeningShare * 100}%` }}
											/>
										)}
										<span
											className={cn(
												"flex-1",
												TONE_BG[view === "listening" ? "listening" : "reading"],
											)}
										/>
									</span>
								</button>
							);
						})}
					</div>
				</div>
				<div
					aria-hidden="true"
					className={cn(
						"mt-2 flex text-muted-foreground text-xs tabular-nums",
						dense ? "gap-[2px]" : "gap-1.5 sm:gap-3",
					)}
				>
					{points.map((point, index) => {
						const label = tickLabel(point, index);
						return (
							<span
								key={point.key}
								className={cn(
									"min-w-0 flex-1 overflow-visible whitespace-nowrap text-center",
									dense && "text-start",
									selected === point.key && "font-medium text-foreground",
								)}
							>
								{label ?? " "}
							</span>
						);
					})}
				</div>
			</div>
			<div
				aria-hidden="true"
				className="relative h-48 w-12 shrink-0 text-muted-foreground text-xs tabular-nums"
			>
				<span className="absolute top-0 -translate-y-1/2">
					{readingDuration(max)}
				</span>
				<span className="absolute top-1/2 -translate-y-1/2">
					{readingDuration(max / 2)}
				</span>
				<span className="absolute bottom-0 translate-y-1/2">0</span>
			</div>
			<span className="sr-only">
				{period === "year"
					? m.stats_average_monthly()
					: m.stats_average_daily()}
				: {readingDuration(average)}
			</span>
		</div>
	);
}
