import { useId, useRef, useState, useSyncExternalStore } from "react";
import { cn } from "@/lib/utils";
import { m } from "@/paraglide/messages";
import { getLocale } from "@/paraglide/runtime";
import type { DayStore } from "./day-store";
import { readingDuration } from "./reading-duration";
import {
	type ChartSlot,
	daysBetween,
	niceMaximum,
	type Projection,
	type ReadingUnit,
	timeMaximum,
} from "./reading-history-model";

const TOP = 6;
const BOTTOM = 100;
const noSubscription = () => () => {};

export const HATCH =
	"repeating-linear-gradient(135deg, currentColor 0 1.5px, transparent 1.5px 5px)";

export function formatAmount(
	value: number,
	unit: ReadingUnit,
	compact = false,
) {
	if (unit === "percent")
		return `${new Intl.NumberFormat(getLocale(), { maximumFractionDigits: value < 10 ? 1 : 0 }).format(value)} %`;
	return new Intl.NumberFormat(getLocale(), {
		notation: compact ? "compact" : "standard",
		maximumFractionDigits: 1,
		// Spanish skips the separator for four digits; "6.094" next to "68.625" reads as inconsistent.
		useGrouping: "always",
	}).format(value);
}

export function ReadingHistoryChart({
	slots,
	unit,
	metric,
	selectedDay,
	onSelectDay,
	projection,
	highlight,
}: {
	slots: ChartSlot[];
	projection?: Projection | null;
	// A day hovered elsewhere (the diary), shown like a local hover.
	highlight?: DayStore;
	unit: ReadingUnit;
	metric: "amount" | "time";
	selectedDay?: string;
	onSelectDay: (day: string) => void;
}) {
	const gradientId = useId();
	const buttons = useRef<(HTMLButtonElement | null)[]>([]);
	const [previewDay, setPreviewDay] = useState<string>();
	const highlightDay = useSyncExternalStore(
		highlight?.subscribe ?? noSubscription,
		() => highlight?.get(),
		() => undefined,
	);
	const activeDay = previewDay ?? highlightDay ?? selectedDay;
	const activeIndex = slots.findIndex((slot) => slot.day === activeDay);
	const active = slots[activeIndex];
	const focusIndex =
		activeIndex < 0 ? slots.findLastIndex((slot) => slot.read) : activeIndex;
	const value = (slot: ChartSlot) =>
		metric === "time" ? slot.seconds : slot.amount;
	const manualValue = (slot: ChartSlot) =>
		metric === "time" ? slot.manualSeconds : slot.manualAmount;
	const hasManual = slots.some((slot) => manualValue(slot) > 0);
	const peak = Math.max(0, ...slots.map(value));
	const maximum = metric === "time" ? timeMaximum(peak) : niceMaximum(peak);
	const readSlots = slots.filter((slot) => slot.read);
	const average = readSlots.length
		? readSlots.reduce((sum, slot) => sum + value(slot), 0) / readSlots.length
		: 0;
	const width = 100 / slots.length;
	const center = (index: number) => (index + 0.5) * width;
	const barWidth = Math.min(width * 0.64, 6);
	const y = (fraction: number) => BOTTOM - fraction * (BOTTOM - TOP);
	const label = (amount: number, compact = true) =>
		metric === "time"
			? readingDuration(amount)
			: unit === "chars"
				? formatAmount(amount, unit, compact)
				: formatAmount(amount, unit);
	let connected = false;
	const line = slots
		.map((slot, index) => {
			if (slot.position === null) {
				connected = false;
				return "";
			}
			const command = connected ? "L" : "M";
			connected = true;
			return `${command}${center(index)},${y(slot.position)}`;
		})
		.join(" ");
	const firstPoint = slots.findIndex((slot) => slot.position !== null);
	const lastPoint = slots.findLastIndex((slot) => slot.position !== null);
	const area =
		firstPoint >= 0 && lastPoint > firstPoint
			? `${line} L${center(lastPoint)},${BOTTOM} L${center(firstPoint)},${BOTTOM} Z`
			: "";
	const date = (day: string, options: Intl.DateTimeFormatOptions) =>
		new Intl.DateTimeFormat(getLocale(), {
			...options,
			timeZone: "UTC",
		}).format(new Date(`${day}T12:00:00Z`));
	const tickEvery =
		slots.length <= 7
			? 1
			: Math.ceil(slots.length / (slots.length <= 31 ? 5 : 6));
	const ticks = slots
		.map((slot, index) => ({ slot, index }))
		.filter(
			({ index }) =>
				(slots.length - 1 - index) % tickEvery === 0 &&
				(index >= tickEvery / 2 || slots.length <= 7),
		);
	const percent = (position: number | null) =>
		position === null ? "—" : `${Math.round(position * 100)} %`;
	const best = readSlots.reduce<ChartSlot | undefined>(
		(top, slot) => (!top || value(slot) > value(top) ? slot : top),
		undefined,
	);
	// What a sighted reader takes in at a glance, for screen readers.
	const summary = [
		m.reading_chart_sr({
			days: readSlots.length,
			average: label(Math.round(average), false),
			best: best ? date(best.day, { dateStyle: "long" }) : "—",
			bestAmount: best ? label(value(best), false) : "—",
			position: percent(slots[lastPoint]?.position ?? null),
		}),
		projection
			? m.reading_chart_sr_finish({
					date: date(projection.finishDay, { dateStyle: "long" }),
				})
			: "",
	].join(" ");
	const tooltipLeft = active ? center(activeIndex) : 0;
	const lastSlot = slots.length - 1;
	const goal = projection
		? (() => {
				const reached = projection.targetIndex <= lastSlot;
				const endIndex = reached ? projection.targetIndex : lastSlot;
				const t =
					(endIndex - projection.fromIndex) /
					(projection.targetIndex - projection.fromIndex);
				return {
					reached,
					x: center(endIndex),
					y: y(projection.fromPosition + t * (1 - projection.fromPosition)),
					label: date(
						projection.finishDay,
						daysBetween(
							slots[projection.fromIndex]?.day ?? "",
							projection.finishDay,
						) < 7
							? { weekday: "long" }
							: { day: "numeric", month: "short" },
					),
				};
			})()
		: null;

	return (
		<div className="min-w-0" data-reading-chart>
			<p className="sr-only">{summary}</p>
			<div aria-hidden="true" className="mb-6 space-y-0.5">
				<p className="font-medium text-muted-foreground text-xs uppercase tracking-wider">
					{m.reading_daily_average()}
				</p>
				<p className="font-semibold text-3xl tabular-nums tracking-tight">
					{readSlots.length ? label(Math.round(average), false) : "—"}
					<span className="ml-1.5 font-medium text-base text-muted-foreground">
						{metric === "amount" && unit === "chars"
							? m.reading_per_day_chars()
							: m.reading_per_day()}
					</span>
				</p>
				{readSlots[0] && (
					<p className="text-muted-foreground text-sm first-letter:uppercase">
						{new Intl.DateTimeFormat(getLocale(), {
							day: "numeric",
							month: "short",
							timeZone: "UTC",
						}).formatRange(
							new Date(`${slots[0]?.day ?? readSlots[0].day}T12:00:00Z`),
							new Date(
								`${readSlots.at(-1)?.day ?? readSlots[0].day}T12:00:00Z`,
							),
						)}
					</p>
				)}
			</div>
			<div className="flex gap-2">
				<div
					aria-hidden="true"
					className="relative w-11 shrink-0 text-right text-[11px] text-muted-foreground tabular-nums"
				>
					{[1, 0.5].map((step) => (
						<span
							key={step}
							className="absolute right-0 -translate-y-1/2"
							style={{ top: `${y(step)}%` }}
						>
							{label(maximum * step)}
						</span>
					))}
				</div>
				<div className="relative h-52 min-w-0 flex-1 sm:h-60">
					<svg
						aria-hidden="true"
						viewBox="0 0 100 100"
						preserveAspectRatio="none"
						className="absolute inset-0 h-full w-full overflow-visible"
					>
						<defs>
							<linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
								<stop offset="0%" stopColor="currentColor" stopOpacity="0.14" />
								<stop offset="100%" stopColor="currentColor" stopOpacity="0" />
							</linearGradient>
						</defs>
						{[1, 0.5, 0].map((step) => (
							<line
								key={step}
								className="text-foreground"
								x1="0"
								x2="100"
								y1={y(step)}
								y2={y(step)}
								stroke="currentColor"
								strokeOpacity={step ? 0.08 : 0.16}
								vectorEffect="non-scaling-stroke"
							/>
						))}
						<g className="text-foreground">
							{area && <path d={area} fill={`url(#${gradientId})`} />}
						</g>
					</svg>
					{slots.map((slot, index) => {
						const total = value(slot);
						if (!slot.read || total <= 0) return null;
						const manual = Math.min(total, manualValue(slot));
						return (
							<span
								key={slot.day}
								aria-hidden="true"
								className="pointer-events-none absolute bottom-0 flex flex-col overflow-hidden rounded-t-[3px] text-primary transition-opacity duration-150 motion-reduce:transition-none"
								style={{
									left: `${center(index) - barWidth / 2}%`,
									width: `${barWidth}%`,
									height: `max(2px, ${Math.min(1, total / maximum) * (BOTTOM - TOP)}%)`,
									opacity: activeIndex < 0 || activeIndex === index ? 1 : 0.4,
								}}
							>
								{manual > 0 && (
									<span
										className="shrink-0 border border-current"
										style={{
											height: `${(manual / total) * 100}%`,
											background: HATCH,
										}}
									/>
								)}
								<span className="flex-1 bg-current" />
							</span>
						);
					})}
					{goal && (
						<>
							{goal.reached && (
								<span
									aria-hidden="true"
									className="pointer-events-none absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-foreground/60 bg-background"
									style={{ left: `${goal.x}%`, top: `${goal.y}%` }}
								/>
							)}
							<span
								className="pointer-events-none absolute -translate-y-full whitespace-nowrap pb-1.5 font-medium text-[11px] text-foreground first-letter:uppercase"
								style={{
									top: `${goal.y}%`,
									...(goal.x > 70
										? { right: `${100 - goal.x}%` }
										: { left: `${goal.x}%` }),
								}}
							>
								{m.reading_projection_goal({ date: goal.label })}
								{!goal.reached && " →"}
							</span>
						</>
					)}
					{lastPoint >= 0 && (
						<span
							aria-hidden="true"
							className="pointer-events-none absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-foreground/60 ring-2 ring-background"
							style={{
								left: `${center(lastPoint)}%`,
								top: `${y(slots[lastPoint]?.position ?? 0)}%`,
							}}
						/>
					)}
					{/* The progress line sits above the bars, which would otherwise hide it. */}
					<svg
						aria-hidden="true"
						viewBox="0 0 100 100"
						preserveAspectRatio="none"
						className="pointer-events-none absolute inset-0 h-full w-full overflow-visible text-foreground"
					>
						<path
							className="text-background"
							d={line}
							fill="none"
							stroke="currentColor"
							strokeWidth="4.5"
							strokeLinejoin="round"
							strokeLinecap="round"
							vectorEffect="non-scaling-stroke"
						/>
						<path
							d={line}
							fill="none"
							stroke="currentColor"
							strokeOpacity="0.7"
							strokeWidth="1.75"
							strokeLinejoin="round"
							strokeLinecap="round"
							vectorEffect="non-scaling-stroke"
						/>
						{projection && goal && (
							<line
								x1={center(projection.fromIndex)}
								y1={y(projection.fromPosition)}
								x2={goal.x}
								y2={goal.y}
								stroke="currentColor"
								strokeOpacity="0.45"
								strokeWidth="1.5"
								strokeDasharray="3 5"
								strokeLinecap="round"
								vectorEffect="non-scaling-stroke"
							/>
						)}
					</svg>
					{average > 0 && readSlots.length > 1 && (
						<span
							aria-hidden="true"
							className="pointer-events-none absolute inset-x-0 border-primary/70 border-t border-dashed"
							style={{ top: `${y(average / maximum)}%` }}
						/>
					)}
					{average > 0 && readSlots.length > 1 && (
						<span
							aria-hidden="true"
							className="pointer-events-none absolute left-1 z-[1] -translate-y-[calc(100%+2px)] rounded-md bg-[color-mix(in_oklab,var(--muted)_30%,var(--background))] px-1.5 py-0.5 text-[11px] text-primary tabular-nums"
							style={{ top: `${y(average / maximum)}%` }}
						>
							{m.reading_average()} {label(average)}
						</span>
					)}
					{slots.map((slot, index) => (
						<button
							key={slot.day}
							ref={(node) => {
								buttons.current[index] = node;
							}}
							type="button"
							tabIndex={focusIndex === index ? 0 : -1}
							disabled={!slot.read}
							aria-label={`${date(slot.day, { dateStyle: "medium" })}: ${slot.read ? `${readingDuration(slot.seconds)}, ${label(slot.amount, false)}` : m.reading_no_reading()}`}
							aria-pressed={selectedDay === slot.day}
							onMouseEnter={() => setPreviewDay(slot.day)}
							onMouseLeave={() => setPreviewDay(undefined)}
							onFocus={() => setPreviewDay(slot.day)}
							onBlur={() => setPreviewDay(undefined)}
							onClick={() => {
								setPreviewDay(undefined);
								onSelectDay(slot.day);
							}}
							onKeyDown={(event) => {
								const step =
									event.key === "ArrowRight"
										? 1
										: event.key === "ArrowLeft"
											? -1
											: 0;
								if (!step) return;
								event.preventDefault();
								let next = index + step;
								while (slots[next] && !slots[next]?.read) next += step;
								if (slots[next]) buttons.current[next]?.focus();
							}}
							className="absolute top-0 bottom-0 cursor-pointer rounded-md transition-colors duration-150 hover:bg-foreground/[0.04] focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-[-2px] disabled:cursor-default disabled:hover:bg-transparent motion-reduce:transition-none"
							style={{ left: `${index * width}%`, width: `${width}%` }}
						/>
					))}
					{active && (
						<div
							aria-live="polite"
							className="pointer-events-none absolute top-0 z-10 w-max rounded-xl border border-border/60 bg-popover px-3 py-2 text-popover-foreground text-xs shadow-lg"
							style={{
								left: `${tooltipLeft}%`,
								transform: `translateX(-${Math.min(100, Math.max(0, tooltipLeft))}%)`,
							}}
						>
							<p className="font-medium first-letter:uppercase">
								{date(active.day, {
									weekday: "long",
									day: "numeric",
									month: "long",
								})}
							</p>
							{active.read ? (
								<dl className="mt-1.5 space-y-1 tabular-nums">
									<div className="flex justify-between gap-4">
										<dt className="text-muted-foreground">
											{unit === "chars"
												? m.reading_legend_chars()
												: m.reading_legend_percent()}
										</dt>
										<dd className="font-medium text-primary">
											{unit === "chars"
												? formatAmount(active.amount, unit)
												: `+${formatAmount(active.amount, unit)}`}
										</dd>
									</div>
									{(active.manualAmount > 0 || active.manualSeconds > 0) && (
										<div className="flex justify-between gap-4">
											<dt className="text-muted-foreground">
												{m.reading_manual_part()}
											</dt>
											<dd>
												{metric === "time" || active.manualAmount <= 0
													? readingDuration(active.manualSeconds)
													: formatAmount(active.manualAmount, unit)}
											</dd>
										</div>
									)}
									<div className="flex justify-between gap-4">
										<dt className="text-muted-foreground">
											{m.reading_time()}
										</dt>
										<dd>{readingDuration(active.seconds)}</dd>
									</div>
									<div className="flex justify-between gap-4">
										<dt className="text-muted-foreground">
											{m.reading_position()}
										</dt>
										<dd>
											{m.reading_until({
												position: percent(active.endPosition),
											})}
										</dd>
									</div>
								</dl>
							) : (
								<p className="mt-1 text-muted-foreground">
									{m.reading_no_reading()}
								</p>
							)}
						</div>
					)}
				</div>
				{metric === "time" || unit === "chars" ? (
					<div
						aria-hidden="true"
						className="relative w-9 shrink-0 text-[11px] text-muted-foreground/70 tabular-nums"
					>
						{[1, 0.5].map((step) => (
							<span
								key={step}
								className="absolute left-0 -translate-y-1/2"
								style={{ top: `${y(step)}%` }}
							>
								{step * 100} %
							</span>
						))}
					</div>
				) : null}
			</div>
			<div
				aria-hidden="true"
				className={cn(
					"relative mt-2 ml-13 h-5 text-[11px] text-muted-foreground",
					(metric === "time" || unit === "chars") && "mr-11",
				)}
			>
				{ticks.map(({ slot, index }) => (
					<span
						key={slot.day}
						className="absolute whitespace-nowrap first-letter:uppercase"
						style={{
							left: `${center(index)}%`,
							// Edge labels hug the plot so they never overflow the card.
							transform: `translateX(-${index === slots.length - 1 && slots.length > 7 ? 100 : index === 0 && slots.length > 7 ? 0 : 50}%)`,
						}}
					>
						{slots.length <= 7
							? date(slot.day, { weekday: "short" })
							: date(slot.day, { day: "numeric", month: "short" })}
					</span>
				))}
			</div>
			<div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-muted-foreground text-xs">
				<span className="flex items-center gap-2">
					<span aria-hidden="true" className="size-2.5 rounded-sm bg-primary" />
					{metric === "time"
						? m.reading_time()
						: unit === "chars"
							? m.reading_legend_chars()
							: m.reading_legend_percent()}
				</span>
				{hasManual && (
					<span className="flex items-center gap-2">
						<span
							aria-hidden="true"
							className="size-2.5 rounded-sm border border-primary text-primary"
							style={{ background: HATCH }}
						/>
						{m.reading_manual_part()}
					</span>
				)}
				<span className="flex items-center gap-2">
					<span
						aria-hidden="true"
						className="h-0.5 w-3.5 rounded-full bg-foreground/45"
					/>
					{m.reading_legend_progress()}
					{lastPoint >= 0 &&
						` · ${percent(slots[lastPoint]?.position ?? null)}`}
				</span>
				{projection && (
					<span className="flex items-center gap-2">
						<span
							aria-hidden="true"
							className="w-3.5 border-foreground/45 border-t-2 border-dashed"
						/>
						{m.reading_legend_projection()}
					</span>
				)}
			</div>
		</div>
	);
}
