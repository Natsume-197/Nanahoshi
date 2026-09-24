import {
	CaretDown,
	Desktop,
	DeviceMobile,
	PencilSimple,
	PencilSimpleLine,
} from "@phosphor-icons/react";
import { Fragment } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { m } from "@/paraglide/messages";
import { getLocale } from "@/paraglide/runtime";
import { readingDuration } from "./reading-duration";
import type { ReadingHistoryData } from "./reading-history";
import { formatAmount, HATCH } from "./reading-history-chart";
import {
	addDays,
	mergeRanges,
	progressAmount,
	type ReadingUnit,
	type ReadRange,
	readRanges,
	rowSpeed,
	weekStart,
} from "./reading-history-model";

type Day = ReadingHistoryData["days"][number];
type Session = ReadingHistoryData["sessions"][number];

// Columns that give way on narrow containers; every row repeats them so cells stay aligned.
const SPEED = "hidden @3xl:table-cell";
const JOURNEY = "hidden @lg:table-cell";
const CELL = "px-3 py-3 align-middle";
// Sits under the book page's 40px sticky tab bar; below md its labels wrap to a varying height.
const STICKY =
	"md:sticky md:top-10 z-10 bg-[color-mix(in_oklab,var(--muted)_30%,var(--background))]";

function shortDuration(seconds: number) {
	return seconds < 60 ? `${Math.round(seconds)} s` : readingDuration(seconds);
}

/** "36 → 43 %", or just the end when the start is unknown. */
function journeyText(from: number | null, to: number | null) {
	if (to === null) return "—";
	return from === null
		? `${Math.round(to * 100)} %`
		: `${Math.round(from * 100)} → ${Math.round(to * 100)} %`;
}

/**
 * The stretches of the book a row covered, on a fixed 0–100 % track shared by
 * every row. Separate blocks reveal skipped chapters; overlapping ones rereads.
 */
function JourneyBar({
	ranges,
	from,
	to,
	muted = false,
}: {
	ranges: ReadRange[];
	from: number | null;
	to: number | null;
	muted?: boolean;
}) {
	// Rows whose segments cross midnight carry no exact ranges; fall back to the span.
	const shown =
		ranges.length > 0
			? ranges
			: to !== null
				? [
						{
							start: Math.min(from ?? to, to),
							end: Math.max(from ?? to, to),
							manual: false,
						},
					]
				: [];
	const { spans, rereads } = mergeRanges(shown);
	const before = spans[0]?.start ?? 0;
	return (
		<span
			aria-hidden="true"
			className="relative @xl:block hidden h-2 min-w-24 flex-1 overflow-hidden rounded-full bg-foreground/[0.07]"
		>
			<span
				className="absolute inset-y-0 left-0 bg-primary/25"
				style={{ width: `${before * 100}%` }}
			/>
			{spans.map((range) => (
				<span
					key={`${range.start}-${range.end}`}
					className={cn(
						"absolute inset-y-0 rounded-full text-primary",
						!range.manual && "bg-primary/75",
						muted && "opacity-60",
					)}
					style={{
						left: `${range.start * 100}%`,
						width: `max(3px, ${(range.end - range.start) * 100}%)`,
						background: range.manual ? HATCH : undefined,
					}}
				/>
			))}
			{rereads.map((range) => (
				<span
					key={`reread-${range.start}-${range.end}`}
					className="absolute inset-y-0 bg-primary"
					style={{
						left: `${range.start * 100}%`,
						width: `max(2px, ${(range.end - range.start) * 100}%)`,
					}}
				/>
			))}
		</span>
	);
}

function Badge({ children }: { children: string }) {
	return (
		<span className="rounded-full bg-primary/15 px-2 py-0.5 font-medium text-[11px] text-primary">
			{children}
		</span>
	);
}

export function ReadingDiary({
	weeks,
	allDays,
	sessionById,
	sessionProgress,
	sessionRanges,
	amountChars,
	unit,
	timeZone,
	today,
	historyId,
	selectedDay,
	expandedDay,
	bestDay,
	longestSessionId,
	onToggleDay,
	onHoverDay,
	onEdit,
}: {
	weeks: { start: string; days: Day[] }[];
	allDays: Day[];
	sessionById: Map<string, Session>;
	sessionProgress: Map<string, number>;
	sessionRanges: Map<string, ReadRange[]>;
	amountChars: number | null;
	unit: ReadingUnit;
	timeZone: string;
	today: string;
	historyId: string;
	selectedDay?: string;
	expandedDay?: string;
	bestDay?: string;
	longestSessionId?: string;
	onToggleDay: (day: string) => void;
	onHoverDay: (day: string | undefined) => void;
	onEdit: (id: string) => void;
}) {
	const locale = getLocale();
	const thisWeek = weekStart(today);
	const utcDate = (day: string, options: Intl.DateTimeFormatOptions) =>
		new Intl.DateTimeFormat(locale, { ...options, timeZone: "UTC" }).format(
			new Date(`${day}T12:00:00Z`),
		);
	const clock = (iso: string) =>
		new Intl.DateTimeFormat(locale, { timeStyle: "short", timeZone }).format(
			new Date(iso),
		);
	const amount = (progress: number) => {
		if (progress <= 0) return "—";
		const value = progressAmount(progress, amountChars);
		return unit === "chars"
			? formatAmount(value, unit)
			: `+${formatAmount(value, unit)}`;
	};
	const speed = (progress: number, seconds: number) => {
		const value = rowSpeed(progress, seconds, amountChars);
		return value === null
			? "—"
			: unit === "chars"
				? formatAmount(value, unit)
				: value.toFixed(value < 10 ? 1 : 0);
	};
	const speedUnit = (
		unit === "chars"
			? m.reading_speed_chars({ value: "" })
			: m.reading_speed_percent({ value: "" })
	).trim();
	const weekLabel = (start: string) =>
		start === thisWeek
			? m.reading_week_this()
			: start === addDays(thisWeek, -7)
				? m.reading_week_last()
				: new Intl.DateTimeFormat(locale, {
						day: "numeric",
						month: "short",
						timeZone: "UTC",
					}).formatRange(
						new Date(`${start}T12:00:00Z`),
						new Date(`${addDays(start, 6)}T12:00:00Z`),
					);
	const relative = (day: string) => {
		const age = Math.round((Date.parse(today) - Date.parse(day)) / 86400_000);
		return age === 0 || age === 1
			? new Intl.RelativeTimeFormat(locale, { numeric: "auto" }).format(
					-age,
					"day",
				)
			: null;
	};
	const sum = (days: Day[], pick: (d: Day) => number) =>
		days.reduce((total, d) => total + pick(d), 0);
	// Days arrive newest first, so a group's journey starts at its last day.
	const span = (days: Day[]) => ({
		from: days.at(-1)?.startPosition ?? null,
		to: days[0]?.endPosition ?? null,
		ranges: readRanges(days.flatMap((d) => d.ranges)),
	});
	const total = span(allDays);
	const totalSeconds = sum(allDays, (d) => d.seconds);
	const totalProgress = sum(allDays, (d) => d.progress);

	return (
		<div className="overflow-clip rounded-3xl bg-muted/30">
			<table
				className="w-full border-collapse text-sm [&_td]:whitespace-nowrap [&_th]:whitespace-nowrap"
				data-reading-diary
			>
				<thead>
					<tr className="text-left text-[11px] text-muted-foreground uppercase tracking-wider">
						<th
							scope="col"
							className={cn(
								STICKY,
								"border-border/50 border-b px-3 py-3 font-medium",
							)}
						>
							{m.reading_col_day()}
						</th>
						<th
							scope="col"
							className={cn(
								STICKY,
								"border-border/50 border-b px-3 py-3 text-right font-medium",
							)}
						>
							{m.reading_time()}
						</th>
						<th
							scope="col"
							className={cn(
								STICKY,
								"border-border/50 border-b px-3 py-3 text-right font-medium",
							)}
						>
							{unit === "chars"
								? m.reading_summary_chars()
								: m.reading_progress_short()}
						</th>
						<th
							scope="col"
							className={cn(
								SPEED,
								STICKY,
								"border-border/50 border-b px-3 py-3 text-right font-medium",
							)}
						>
							{m.reading_speed()}{" "}
							<span className="font-normal normal-case tracking-normal opacity-70">
								{speedUnit}
							</span>
						</th>
						<th
							scope="col"
							className={cn(
								JOURNEY,
								STICKY,
								"@xl:w-[40%] border-border/50 border-b px-3 py-3 font-medium",
							)}
						>
							{m.reading_col_journey()}
						</th>
						<th
							scope="col"
							className={cn(STICKY, "w-12 border-border/50 border-b px-3 py-3")}
						>
							<span className="sr-only">{m.reading_actions()}</span>
						</th>
					</tr>
				</thead>
				{weeks.map((week) => {
					const seconds = sum(week.days, (d) => d.seconds);
					const progress = sum(week.days, (d) => d.progress);
					const journey = span(week.days);
					return (
						<tbody key={week.start} className="border-border/50 border-b">
							<tr className="text-xs tabular-nums">
								<th
									scope="rowgroup"
									className="px-3 pt-6 pb-2 text-left font-medium text-muted-foreground uppercase tracking-wide"
								>
									{weekLabel(week.start)}
								</th>
								<td className="px-3 pt-6 pb-2 text-right font-medium text-muted-foreground">
									{readingDuration(seconds)}
								</td>
								<td className="px-3 pt-6 pb-2 text-right font-medium text-muted-foreground">
									{amount(progress)}
								</td>
								<td
									className={cn(
										SPEED,
										"px-3 pt-6 pb-2 text-right text-muted-foreground",
									)}
								>
									{speed(progress, seconds)}
								</td>
								<td
									className={cn(
										JOURNEY,
										"px-3 pt-6 pb-2 text-muted-foreground",
									)}
								>
									<span className="flex items-center gap-3">
										<JourneyBar {...journey} muted />
										<span className="min-w-20 text-right">
											{journeyText(journey.from, journey.to)}
										</span>
									</span>
								</td>
								<td className="pt-6 pb-2" />
							</tr>
							{week.days.map((day) => {
								const expanded = expandedDay === day.day;
								const label = relative(day.day);
								return (
									<Fragment key={day.day}>
										<tr
											className={cn(
												"cursor-pointer border-border/30 border-t tabular-nums transition-colors duration-150 hover:bg-foreground/5 motion-reduce:transition-none",
												(selectedDay === day.day || expanded) &&
													"bg-foreground/[0.03]",
											)}
											onClick={() => onToggleDay(day.day)}
											onMouseEnter={() => onHoverDay(day.day)}
											onMouseLeave={() => onHoverDay(undefined)}
										>
											<td className={CELL}>
												<span className="flex items-center gap-2">
													<time
														dateTime={day.day}
														title={utcDate(day.day, { dateStyle: "full" })}
														className="flex items-baseline gap-2"
													>
														<span
															className={cn(
																"font-medium first-letter:uppercase",
																day.day === today && "text-primary",
															)}
														>
															{label ??
																utcDate(day.day, {
																	weekday: "short",
																	day: "numeric",
																})}
														</span>
														<span className="text-muted-foreground text-xs">
															{label
																? utcDate(day.day, {
																		day: "numeric",
																		month: "short",
																	})
																: utcDate(day.day, { month: "short" })}
														</span>
													</time>
													{bestDay === day.day && (
														<Badge>{m.reading_badge_best_day()}</Badge>
													)}
												</span>
											</td>
											<td className={cn(CELL, "text-right font-medium")}>
												{readingDuration(day.seconds)}
											</td>
											<td className={cn(CELL, "text-right text-primary")}>
												{amount(day.progress)}
											</td>
											<td
												className={cn(
													SPEED,
													CELL,
													"text-right text-muted-foreground",
												)}
											>
												{speed(day.progress, day.seconds)}
											</td>
											<td
												className={cn(JOURNEY, CELL, "text-muted-foreground")}
											>
												<span className="flex items-center gap-3">
													<JourneyBar
														ranges={readRanges(day.ranges)}
														from={day.startPosition}
														to={day.endPosition}
													/>
													<span className="min-w-20 text-right">
														{journeyText(day.startPosition, day.endPosition)}
													</span>
												</span>
											</td>
											<td className={cn(CELL, "text-center")}>
												<button
													type="button"
													id={`${historyId}-day-${day.day}`}
													aria-expanded={expanded}
													aria-controls={`${historyId}-sessions-${day.day}`}
													aria-label={utcDate(day.day, { dateStyle: "full" })}
													onClick={(event) => {
														event.stopPropagation();
														onToggleDay(day.day);
													}}
													className="grid size-8 cursor-pointer place-items-center rounded-lg text-muted-foreground focus-visible:outline-2 focus-visible:outline-ring"
												>
													<CaretDown
														aria-hidden="true"
														className={cn(
															"size-4 transition-transform motion-reduce:transition-none",
															expanded && "rotate-180",
														)}
													/>
												</button>
											</td>
										</tr>
										{expanded &&
											[...day.sessions].reverse().map((row, index) => {
												const session = sessionById.get(row.id);
												if (!session) return null;
												const manual = session.mode === "retrospective";
												const Icon = manual
													? PencilSimpleLine
													: session.device === "Mobile"
														? DeviceMobile
														: Desktop;
												const advance = sessionProgress.get(row.id) ?? 0;
												return (
													<tr
														key={row.id}
														id={
															index === 0
																? `${historyId}-sessions-${day.day}`
																: undefined
														}
														className="bg-foreground/[0.03] text-muted-foreground tabular-nums"
														data-reading-session={row.id}
													>
														<td className="py-2 pr-3 pl-6">
															<span className="flex items-center gap-2.5">
																<Icon
																	aria-label={
																		manual
																			? m.reading_declared()
																			: session.device || session.source
																	}
																	className="size-4 shrink-0"
																/>
																<time dateTime={row.startedAt}>
																	{clock(row.startedAt)}
																	{session.endedAt &&
																		` – ${clock(session.endedAt)}`}
																</time>
																{longestSessionId === row.id && (
																	<Badge>{m.reading_badge_longest()}</Badge>
																)}
															</span>
														</td>
														<td className="px-3 py-2 text-right text-foreground">
															{shortDuration(row.seconds)}
														</td>
														<td className="px-3 py-2 text-right text-primary">
															{amount(advance)}
														</td>
														<td className={cn(SPEED, "px-3 py-2 text-right")}>
															{speed(advance, row.seconds)}
														</td>
														<td className={cn(JOURNEY, "px-3 py-2")}>
															<span className="flex items-center gap-3">
																<JourneyBar
																	ranges={sessionRanges.get(row.id) ?? []}
																	from={row.startPosition}
																	to={row.endPosition}
																	muted
																/>
																<span className="min-w-20 text-right">
																	{journeyText(
																		row.startPosition,
																		row.endPosition,
																	)}
																</span>
															</span>
														</td>
														<td className="px-3 py-2 text-center">
															<Button
																size="icon"
																variant="ghost"
																className="size-8 text-muted-foreground"
																aria-label={m.reading_edit()}
																onClick={() => onEdit(row.id)}
															>
																<PencilSimple aria-hidden="true" />
															</Button>
														</td>
													</tr>
												);
											})}
									</Fragment>
								);
							})}
						</tbody>
					);
				})}
				<tfoot>
					<tr className="border-border/50 border-t font-semibold tabular-nums">
						<th
							scope="row"
							className="px-3 py-4 text-left text-[11px] text-muted-foreground uppercase tracking-wider"
						>
							{m.reading_total_run()}
						</th>
						<td className="px-3 py-3 text-right">
							{readingDuration(totalSeconds)}
						</td>
						<td className="px-3 py-3 text-right text-primary">
							{amount(totalProgress)}
						</td>
						<td
							className={cn(
								SPEED,
								"px-3 py-3 text-right text-muted-foreground",
							)}
						>
							{speed(totalProgress, totalSeconds)}
						</td>
						<td className={cn(JOURNEY, "px-3 py-3 text-muted-foreground")}>
							<span className="flex items-center gap-3">
								<JourneyBar {...total} />
								<span className="min-w-20 text-right">
									{journeyText(total.from, total.to)}
								</span>
							</span>
						</td>
						<td />
					</tr>
				</tfoot>
			</table>
		</div>
	);
}
