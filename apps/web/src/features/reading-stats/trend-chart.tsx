import {
	niceMaximum,
	timeMaximum,
} from "@/features/reading-sessions/reading-history-model";
import { cn } from "@/lib/utils";
import { TONE_BG } from "./goal-gauge";
import type { SeriesPoint, StatsView } from "./stats-model";
import { rovingKey } from "./stats-shared";

export type TrendMetric = "time" | "characters";

export function TrendChart({
	points,
	view,
	metric,
	value,
	format,
	average,
	goal,
	met,
	selected,
	onSelect,
	hovered,
	onHover,
	tickLabel,
	valueLabel,
	label,
}: {
	points: SeriesPoint[];
	view: StatsView;
	metric: TrendMetric;
	value: (point: SeriesPoint) => number;
	format: (value: number) => string;
	average: number;
	goal: number | null;
	met: (point: SeriesPoint) => boolean;
	selected: string | null;
	onSelect: (key: string | null) => void;
	hovered: string | null;
	onHover: (key: string | null) => void;
	tickLabel: (point: SeriesPoint, index: number) => string | null;
	valueLabel: (point: SeriesPoint) => string;
	label: string;
}) {
	const peak = Math.max(0, average, goal ?? 0, ...points.map(value));
	const max = metric === "time" ? timeMaximum(peak) : niceMaximum(peak);
	const dense = points.length > 12;
	const lived = points.filter((p) => !p.future);
	const focusKey = selected ?? lived.at(-1)?.key;
	// Hover previews a bar the way a click pins it.
	const shown = hovered ?? selected;
	const line = (at: number, className: string) => (
		<div
			aria-hidden="true"
			className={cn("absolute inset-x-0 z-10 border-t-2", className)}
			style={{ bottom: `${Math.min(100, (at / max) * 100)}%` }}
		/>
	);
	return (
		<div className="flex gap-2">
			<div className="relative min-w-0 flex-1">
				<div className="relative mt-3 h-48">
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
					{average > 0 &&
						line(average, "border-[var(--stats-average)] border-dotted")}
					{goal !== null &&
						goal > 0 &&
						line(goal, "border-[var(--stats-reading)] border-dashed")}
					<fieldset
						aria-label={label}
						onKeyDown={(event) =>
							rovingKey(event, { ArrowRight: 1, ArrowLeft: -1 })
						}
						onPointerLeave={() => onHover(null)}
						className={cn(
							"absolute inset-0 m-0 flex min-w-0 items-end border-0 p-0",
							dense ? "gap-[2px]" : "gap-1.5 sm:gap-3",
						)}
					>
						{points.map((point) => {
							const amount = value(point);
							const both = point.reading + point.listening;
							const listeningShare =
								view === "all" && metric === "time" && both > 0
									? point.listening / both
									: 0;
							const active = selected === point.key;
							const dimmed = shown !== null && shown !== point.key;
							const reached = !point.future && met(point);
							return (
								<button
									key={point.key}
									type="button"
									data-roving
									tabIndex={point.key === focusKey ? 0 : -1}
									disabled={point.future}
									aria-pressed={active}
									aria-label={valueLabel(point)}
									onClick={() => onSelect(active ? null : point.key)}
									onPointerEnter={(event) => {
										if (event.pointerType !== "touch" && !point.future)
											onHover(point.key);
									}}
									className="group relative flex h-full min-w-0 flex-1 cursor-pointer flex-col items-center justify-end rounded-md focus-visible:outline-2 focus-visible:outline-ring disabled:cursor-default"
								>
									{reached && (
										<span
											aria-hidden="true"
											className={cn(
												"mb-1 size-1.5 shrink-0 rounded-full bg-[var(--stats-reading)]",
												dense && "size-1",
												dimmed && "opacity-35",
											)}
										/>
									)}
									<span
										className={cn(
											"flex w-full max-w-10 flex-col overflow-hidden rounded-t-[5px] transition-[height,opacity] duration-300 ease-out motion-reduce:transition-none",
											dense && "rounded-t-[2px]",
											dimmed && "opacity-35",
										)}
										style={{
											height:
												amount > 0 ? `max(3px, ${(amount / max) * 100}%)` : 0,
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
					</fieldset>
				</div>
				<div
					aria-hidden="true"
					className={cn(
						"mt-2 flex text-muted-foreground text-xs tabular-nums",
						dense ? "gap-[2px]" : "gap-1.5 sm:gap-3",
					)}
				>
					{points.map((point, index) => {
						const tick = tickLabel(point, index);
						return (
							<span
								key={point.key}
								className={cn(
									"min-w-0 flex-1 overflow-visible whitespace-nowrap text-center",
									dense && "text-start",
									shown === point.key && "font-medium text-foreground",
								)}
							>
								{tick ?? " "}
							</span>
						);
					})}
				</div>
			</div>
			<div
				aria-hidden="true"
				className="relative mt-3 h-48 w-12 shrink-0 text-muted-foreground text-xs tabular-nums"
			>
				<span className="absolute top-0 -translate-y-1/2">{format(max)}</span>
				<span className="absolute top-1/2 -translate-y-1/2">
					{format(max / 2)}
				</span>
				<span className="absolute bottom-0 translate-y-1/2">0</span>
			</div>
		</div>
	);
}
