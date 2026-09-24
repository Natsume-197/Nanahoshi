import { useRef, useState } from "react";
import { m } from "@/paraglide/messages";
import { getLocale } from "@/paraglide/runtime";
import { sessionDuration } from "./reading-duration";
import { formatAmount } from "./reading-history-chart";
import {
	paceChange,
	paceDomain,
	paceTrend,
	type ReadingUnit,
	speedPerHour,
} from "./reading-history-model";

const TOP = 8;
const BOTTOM = 96;

export interface Pace {
	sessionId: string;
	startedAt: string;
	seconds: number;
	rate: number;
}

export function ReadingPaceChart({
	paces,
	unit,
	amountChars,
	timeZone,
}: {
	paces: Pace[];
	unit: ReadingUnit;
	amountChars: number | null;
	timeZone: string;
}) {
	const buttons = useRef<(HTMLButtonElement | null)[]>([]);
	const [activeIndex, setActiveIndex] = useState<number>();
	const speeds = paces.map((pace) => speedPerHour(pace.rate, amountChars) ?? 0);
	const trend = paceTrend(speeds);
	const change = paceChange(speeds);
	const { low, high, ticks } = paceDomain(speeds);
	const longest = Math.max(...paces.map((pace) => pace.seconds));
	const x = (index: number) =>
		paces.length === 1 ? 50 : 3 + (index / (paces.length - 1)) * 94;
	const y = (value: number) =>
		BOTTOM - ((value - low) / (high - low)) * (BOTTOM - TOP);
	const format = (value: number, compact = false) =>
		unit === "chars"
			? m.reading_speed_chars({ value: formatAmount(value, unit, compact) })
			: m.reading_speed_percent({ value: value.toFixed(value < 10 ? 1 : 0) });
	const trendPath = trend
		.map((value, index) => `${index ? "L" : "M"}${x(index)},${y(value)}`)
		.join(" ");
	const headline =
		change !== null && change >= 5
			? m.reading_pace_faster_short()
			: change !== null && change > -5
				? m.reading_pace_steady()
				: m.reading_pace_recent();
	const active = activeIndex === undefined ? undefined : paces[activeIndex];
	const focusIndex = activeIndex ?? paces.length - 1;

	return (
		<div className="min-w-0 space-y-5" data-reading-pace>
			<p className="sr-only">
				{m.reading_pace_sr({
					count: paces.length,
					min: format(Math.min(...speeds)),
					max: format(Math.max(...speeds)),
				})}
			</p>
			<div className="space-y-0.5">
				<p className="font-medium text-muted-foreground text-xs uppercase tracking-wider">
					{m.reading_pace_current()}
				</p>
				<div className="flex flex-wrap items-center gap-2">
					<p className="font-semibold text-3xl tabular-nums tracking-tight">
						{format(trend.at(-1) ?? 0)}
					</p>
					{change !== null && change >= 5 && (
						<span className="rounded-full bg-primary/15 px-2 py-0.5 font-medium text-primary text-xs tabular-nums">
							↑ {change} %
						</span>
					)}
				</div>
				<p className="text-muted-foreground text-sm">{headline}</p>
			</div>
			<div className="flex gap-2">
				<div
					aria-hidden="true"
					className="relative w-16 shrink-0 text-right text-[11px] text-muted-foreground tabular-nums"
				>
					{ticks.map((value) => (
						<span
							key={value}
							className="absolute right-0 -translate-y-1/2"
							style={{ top: `${y(value)}%` }}
						>
							{format(value, true)}
						</span>
					))}
				</div>
				<div className="relative h-44 min-w-0 flex-1">
					<svg
						aria-hidden="true"
						viewBox="0 0 100 100"
						preserveAspectRatio="none"
						className="absolute inset-0 h-full w-full overflow-visible"
					>
						{ticks.map((value) => (
							<line
								key={value}
								className="text-foreground"
								x1="0"
								x2="100"
								y1={y(value)}
								y2={y(value)}
								stroke="currentColor"
								strokeOpacity={value === low ? 0.16 : 0.08}
								vectorEffect="non-scaling-stroke"
							/>
						))}
						{paces.length > 1 && (
							<path
								className="text-primary"
								d={trendPath}
								fill="none"
								stroke="currentColor"
								strokeWidth="2.5"
								strokeLinecap="round"
								strokeLinejoin="round"
								vectorEffect="non-scaling-stroke"
							/>
						)}
					</svg>
					{paces.map((pace, index) => {
						// Area tracks session length, so long sittings weigh visibly more.
						const size = 6 + Math.sqrt(pace.seconds / longest) * 8;
						const isActive = activeIndex === index;
						const isLatest = index === paces.length - 1;
						return (
							<span
								key={pace.sessionId}
								aria-hidden="true"
								className={`pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-background transition-opacity duration-150 motion-reduce:transition-none ${isActive || isLatest ? "bg-primary" : "bg-primary/60"}`}
								style={{
									left: `${x(index)}%`,
									top: `${y(speeds[index] ?? 0)}%`,
									width: size,
									height: size,
								}}
							/>
						);
					})}
					{paces.map((pace, index) => {
						const previous = index ? (x(index - 1) + x(index)) / 2 : 0;
						const next =
							index < paces.length - 1 ? (x(index + 1) + x(index)) / 2 : 100;
						return (
							<button
								key={pace.sessionId}
								ref={(node) => {
									buttons.current[index] = node;
								}}
								type="button"
								tabIndex={focusIndex === index ? 0 : -1}
								aria-label={`${new Intl.DateTimeFormat(getLocale(), { dateStyle: "medium", timeZone }).format(new Date(pace.startedAt))}: ${format(speeds[index] ?? 0)}`}
								onMouseEnter={() => setActiveIndex(index)}
								onMouseLeave={() => setActiveIndex(undefined)}
								onFocus={() => setActiveIndex(index)}
								onBlur={() => setActiveIndex(undefined)}
								onKeyDown={(event) => {
									const step =
										event.key === "ArrowRight"
											? 1
											: event.key === "ArrowLeft"
												? -1
												: 0;
									if (!step) return;
									event.preventDefault();
									buttons.current[index + step]?.focus();
								}}
								className="absolute top-0 bottom-0 rounded-md transition-colors duration-150 hover:bg-foreground/[0.04] focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-[-2px] motion-reduce:transition-none"
								style={{ left: `${previous}%`, width: `${next - previous}%` }}
							/>
						);
					})}
					{active && activeIndex !== undefined && (
						<div
							aria-live="polite"
							className="pointer-events-none absolute top-0 z-10 w-max rounded-xl border border-border/60 bg-popover px-3 py-2 text-popover-foreground text-xs shadow-lg"
							style={{
								left: `${x(activeIndex)}%`,
								transform: `translateX(-${Math.min(100, Math.max(0, x(activeIndex)))}%)`,
							}}
						>
							<p className="font-medium first-letter:uppercase">
								{new Intl.DateTimeFormat(getLocale(), {
									weekday: "long",
									day: "numeric",
									month: "long",
									hour: "numeric",
									minute: "2-digit",
									timeZone,
								}).format(new Date(active.startedAt))}
							</p>
							<dl className="mt-1.5 space-y-1 tabular-nums">
								<div className="flex justify-between gap-4">
									<dt className="text-muted-foreground">{m.reading_speed()}</dt>
									<dd className="font-medium text-primary">
										{format(speeds[activeIndex] ?? 0)}
									</dd>
								</div>
								<div className="flex justify-between gap-4">
									<dt className="text-muted-foreground">{m.reading_time()}</dt>
									<dd>{sessionDuration(active.seconds)}</dd>
								</div>
							</dl>
						</div>
					)}
				</div>
			</div>
			<div className="flex flex-wrap gap-x-5 gap-y-2 text-muted-foreground text-xs">
				<span className="flex items-center gap-2">
					<span
						aria-hidden="true"
						className="size-2.5 rounded-full bg-primary/60"
					/>
					{m.reading_pace_legend_session()}
				</span>
				<span className="flex items-center gap-2">
					<span
						aria-hidden="true"
						className="h-0.5 w-3.5 rounded-full bg-primary"
					/>
					{m.reading_pace_legend_trend()}
				</span>
			</div>
		</div>
	);
}
