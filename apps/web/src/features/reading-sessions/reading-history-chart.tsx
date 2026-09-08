import { useId, useRef, useState } from "react";
import { m } from "@/paraglide/messages";
import { getLocale } from "@/paraglide/runtime";
import { readingDuration } from "./reading-duration";
import type { ReadingHistoryData } from "./reading-history";

export function ReadingHistoryChart({
	days,
	view,
	selectedDay,
	onSelectDay,
}: {
	days: ReadingHistoryData["days"];
	view: "position" | "time";
	selectedDay?: string;
	onSelectDay: (day: string) => void;
}) {
	const gradientId = useId();
	const buttons = useRef<(HTMLButtonElement | null)[]>([]);
	const [previewDay, setPreviewDay] = useState<string>();
	const selectedIndex = days.findIndex(
		(day) => day.day === (previewDay ?? selectedDay),
	);
	const activeIndex = selectedIndex < 0 ? days.length - 1 : selectedIndex;
	const active = days[activeIndex];
	const formatDate = (ms: number, full = false) =>
		new Intl.DateTimeFormat(getLocale(), {
			month: "short",
			day: "numeric",
			year: full ? "numeric" : undefined,
			timeZone: "UTC",
		}).format(ms);
	const timestamp = (day: string) => Date.parse(`${day}T12:00:00Z`);
	const position = (value: number | null) =>
		value === null ? m.reading_unknown() : `${Math.round(value * 100)} %`;
	const dayValue = (day: ReadingHistoryData["days"][number]) =>
		view === "position" ? day.endPosition : day.seconds;
	const start = days[0] ? timestamp(days[0].day) : 0;
	const end = days.at(-1) ? timestamp(days.at(-1)?.day ?? "") : start;
	const span = Math.max(86400_000, end - start);
	const peak = Math.max(0, ...days.map((day) => day.seconds));
	// Four equal, whole-minute intervals keep the axis readable (no 12.5 → 12 min labels).
	const timeStep =
		peak <= 240
			? 60
			: peak <= 1200
				? 300
				: peak <= 3600
					? 900
					: 1800 * Math.ceil(peak / 7200);
	const maximum = view === "position" ? 1 : timeStep * 4;
	const x = (day: string) =>
		days.length === 1 ? 50 : 3 + ((timestamp(day) - start) / span) * 94;
	const y = (value: number) => 94 - (value / maximum) * 88;
	let connected = false;
	const path = days
		.map((day) => {
			if (day.endPosition === null) {
				connected = false;
				return "";
			}
			const command = connected ? "L" : "M";
			connected = true;
			return `${command}${x(day.day)},${y(day.endPosition)}`;
		})
		.join(" ");
	const barWidth = Math.min(4, (86400_000 / span) * 64);
	const ticks =
		end === start
			? [0.5]
			: span < 4 * 86400_000
				? [0, 1]
				: [0, 0.25, 0.5, 0.75, 1];

	return (
		<div className="min-w-0" data-reading-chart>
			<div
				className="mb-6 flex flex-wrap items-end justify-between gap-x-6 gap-y-4 text-sm"
				aria-live="polite"
				aria-atomic="true"
			>
				<time
					className="font-medium text-base tracking-tight"
					dateTime={active?.day}
				>
					{active ? formatDate(timestamp(active.day), true) : "—"}
				</time>
				<dl className="flex flex-wrap gap-x-6 gap-y-2">
					<div className="space-y-1">
						<dt className="text-muted-foreground text-xs">
							{m.reading_time()}
						</dt>
						<dd className="font-medium text-2xl text-primary tabular-nums tracking-tight">
							{active ? readingDuration(active.seconds) : "—"}
						</dd>
					</div>
					<div className="space-y-1">
						<dt className="text-muted-foreground text-xs">
							{m.reading_position()}
						</dt>
						<dd className="font-medium tabular-nums">
							{active ? position(active.endPosition) : "—"}
						</dd>
					</div>
				</dl>
			</div>
			<div className="flex gap-3">
				<div
					aria-hidden="true"
					className="relative w-12 shrink-0 text-right text-[11px] text-muted-foreground tabular-nums"
				>
					{[1, 0.5, 0].map((step) => (
						<span
							key={step}
							className="absolute right-0 -translate-y-1/2"
							style={{ top: `${y(maximum * step)}%` }}
						>
							{view === "position"
								? `${step * 100}%`
								: readingDuration(maximum * step)}
						</span>
					))}
				</div>
				<div className="relative h-48 min-w-0 flex-1 sm:h-56">
					<svg
						aria-hidden="true"
						viewBox="0 0 100 100"
						preserveAspectRatio="none"
						className="absolute inset-0 h-full w-full overflow-visible text-primary"
					>
						<defs>
							<linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
								<stop offset="0%" stopColor="currentColor" stopOpacity="0.9" />
								<stop
									offset="100%"
									stopColor="currentColor"
									stopOpacity="0.8"
								/>
							</linearGradient>
						</defs>
						{[1, 0.5, 0].map((step) => (
							<line
								key={step}
								x1="0"
								x2="100"
								y1={y(maximum * step)}
								y2={y(maximum * step)}
								stroke="currentColor"
								strokeOpacity="0.12"
								vectorEffect="non-scaling-stroke"
								strokeDasharray={step ? "2 5" : undefined}
							/>
						))}
						{active && (
							<line
								x1={x(active.day)}
								x2={x(active.day)}
								y1="3"
								y2="94"
								stroke="currentColor"
								strokeOpacity="0.3"
								strokeDasharray="3 4"
								vectorEffect="non-scaling-stroke"
							/>
						)}
						{view === "position" ? (
							<path
								d={path}
								fill="none"
								stroke="currentColor"
								strokeWidth="2"
								vectorEffect="non-scaling-stroke"
								strokeLinecap="round"
								strokeLinejoin="round"
							/>
						) : (
							days.map((day) => (
								<rect
									key={day.day}
									x={x(day.day) - barWidth / 2}
									y={y(day.seconds)}
									width={barWidth}
									height={94 - y(day.seconds)}
									rx="0.5"
									fill={
										active?.day === day.day
											? "currentColor"
											: `url(#${gradientId})`
									}
								/>
							))
						)}
					</svg>
					{days.map((day, index) => {
						const value = dayValue(day);
						const previous = days[index - 1];
						const next = days[index + 1];
						const left = previous ? (x(previous.day) + x(day.day)) / 2 : 0;
						const right = next ? (x(next.day) + x(day.day)) / 2 : 100;
						return (
							<button
								key={day.day}
								ref={(node) => {
									buttons.current[index] = node;
								}}
								type="button"
								tabIndex={activeIndex === index ? 0 : -1}
								aria-label={`${formatDate(timestamp(day.day), true)}: ${view === "position" ? position(value) : readingDuration(day.seconds)}`}
								aria-pressed={activeIndex === index}
								onMouseEnter={() => setPreviewDay(day.day)}
								onMouseLeave={() => setPreviewDay(undefined)}
								onBlur={() => setPreviewDay(undefined)}
								onFocus={() => setPreviewDay(day.day)}
								onClick={() => {
									setPreviewDay(undefined);
									onSelectDay(day.day);
								}}
								onKeyDown={(event) => {
									const target =
										event.key === "ArrowRight"
											? Math.min(days.length - 1, index + 1)
											: event.key === "ArrowLeft"
												? Math.max(0, index - 1)
												: event.key === "Home"
													? 0
													: event.key === "End"
														? days.length - 1
														: null;
									if (event.key === "Escape") setPreviewDay(undefined);
									if (target !== null) {
										event.preventDefault();
										buttons.current[target]?.focus();
									}
								}}
								className="absolute top-0 bottom-0 rounded-sm transition-colors duration-150 hover:bg-primary/5 focus-visible:bg-primary/10 focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-[-2px] motion-reduce:transition-none"
								style={{ left: `${left}%`, width: `${right - left}%` }}
							>
								{view === "position" && value !== null && (
									<span
										className={`absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-background bg-primary ${activeIndex === index ? "ring-4 ring-primary/20" : "ring-1 ring-primary/25"}`}
										style={{
											left: `${((x(day.day) - left) / (right - left)) * 100}%`,
											top: `${y(value)}%`,
										}}
									/>
								)}
							</button>
						);
					})}
				</div>
			</div>
			<div
				aria-hidden="true"
				className="relative mt-3 ml-15 h-8 text-[11px] text-muted-foreground"
			>
				{ticks.map((step, index) => (
					<span
						key={step}
						className={`${index % 2 ? "hidden sm:block" : ""} absolute whitespace-nowrap`}
						style={{
							left: `${step * 100}%`,
							transform: `translateX(-${step * 100}%)`,
						}}
					>
						{formatDate(
							start +
								Math.round(((end - start) * step) / 86400_000) * 86400_000,
						)}
					</span>
				))}
			</div>
		</div>
	);
}
