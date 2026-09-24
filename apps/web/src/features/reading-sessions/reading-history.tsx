import {
	ArrowCounterClockwise,
	Check,
	DotsThreeVertical,
	Flag,
	Plus,
	Trash,
} from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useId, useState } from "react";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Modal } from "@/components/ui/modal";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { m } from "@/paraglide/messages";
import { getLocale } from "@/paraglide/runtime";
import { client, orpc } from "@/utils/orpc";
import { createDayStore } from "./day-store";
import { ReadingDiary } from "./reading-diary";
import { readingDuration } from "./reading-duration";
import { EmptyHistory, GoalPanel, PaceUnlock } from "./reading-goal";
import { ReadingGoalDialog } from "./reading-goal-dialog";
import { formatAmount, ReadingHistoryChart } from "./reading-history-chart";
import {
	addDays,
	type ChartPeriod,
	chartSlots,
	daysBetween,
	defaultPeriod,
	finishInDays,
	goalStatus,
	goalTimeline,
	groupByWeek,
	progressAmount,
	type ReadRange,
	readingUnit,
	readRanges,
	runSummary,
	speedPerHour,
	todayVersusAverage,
	withProjection,
} from "./reading-history-model";
import { type Figure, FigureGrid, ProgressRing } from "./reading-overview";
import { ReadingPaceChart } from "./reading-pace-chart";
import { ReadingSessionForm } from "./reading-session-form";
export type ReadingHistoryData = Awaited<
	ReturnType<typeof client.readingSessions.history>
>;
export function percentage(value: number | null) {
	return value === null ? "—" : `${Math.round(value * 100)} %`;
}
export function ReadingHistory({
	bookUuid,
	amountChars,
}: {
	bookUuid: string;
	amountChars?: number | null;
}) {
	return (
		<BookReadingHistory
			key={bookUuid}
			bookUuid={bookUuid}
			amountChars={amountChars ?? null}
		/>
	);
}

const PERIODS: { value: ChartPeriod; label: () => string }[] = [
	{ value: "week", label: m.reading_period_week },
	{ value: "month", label: m.reading_period_month },
	{ value: "all", label: m.reading_period_all },
];

function Segmented<Value extends string>({
	label,
	value,
	options,
	onChange,
}: {
	label: string;
	value: Value;
	options: { value: Value; label: () => string }[];
	onChange: (value: Value) => void;
}) {
	return (
		<fieldset
			aria-label={label}
			className="flex max-w-full gap-0.5 rounded-xl bg-foreground/[0.05] p-0.5"
		>
			{options.map((option) => (
				<button
					type="button"
					key={option.value}
					aria-pressed={value === option.value}
					onClick={() => onChange(option.value)}
					className={cn(
						"min-h-8 rounded-[10px] px-3 text-xs transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-ring motion-reduce:transition-none",
						value === option.value
							? "bg-background font-medium text-foreground shadow-sm"
							: "text-muted-foreground hover:text-foreground",
					)}
				>
					{option.label()}
				</button>
			))}
		</fieldset>
	);
}

function RangeBar({
	start,
	end,
	className,
}: {
	start: number | null;
	end: number | null;
	className?: string;
}) {
	if (end === null) return null;
	const from = Math.min(start ?? end, end);
	return (
		<span
			aria-hidden="true"
			className={cn(
				"relative block h-1.5 overflow-hidden rounded-full bg-foreground/[0.08]",
				className,
			)}
		>
			<span
				className="absolute inset-y-0 left-0 bg-primary/25"
				style={{ width: `${from * 100}%` }}
			/>
			<span
				className="absolute inset-y-0 bg-primary"
				style={{
					left: `${from * 100}%`,
					width: `${Math.max(1.5, (end - from) * 100)}%`,
				}}
			/>
		</span>
	);
}

/** Every block of the page shares this shape: title outside, content below. */
function HistorySection({
	title,
	actions,
	children,
}: {
	title: string;
	actions?: ReactNode;
	children: ReactNode;
}) {
	return (
		<div className="min-w-0 space-y-3">
			<div className="flex flex-wrap items-center justify-between gap-3 px-1">
				<h3 className="font-semibold text-xl tracking-tight">{title}</h3>
				{actions}
			</div>
			{children}
		</div>
	);
}

function ReadingHistorySkeleton() {
	return (
		<div role="status" className="@container min-w-0 space-y-10">
			<span className="sr-only">{m.reading_loading()}</span>
			<div className="flex items-center justify-between">
				<Skeleton className="h-8 w-56" />
				<Skeleton className="h-8 w-36" />
			</div>
			<div className="space-y-3">
				<Skeleton className="h-6 w-32" />
				<Skeleton className="h-72 rounded-3xl" />
			</div>
			<div className="space-y-3">
				<Skeleton className="h-6 w-48" />
				<Skeleton className="h-80 rounded-3xl" />
			</div>
		</div>
	);
}

function BookReadingHistory({
	bookUuid,
	amountChars: bookAmountChars,
}: {
	bookUuid: string;
	amountChars: number | null;
}) {
	const historyId = useId();
	const [runId, setRunId] = useState<string>();
	const [timeZone] = useState(
		() => Intl.DateTimeFormat().resolvedOptions().timeZone,
	);
	const [period, setPeriod] = useState<ChartPeriod>();
	const [metric, setMetric] = useState<"amount" | "time">("amount");
	const [weekCount, setWeekCount] = useState(3);
	const [hoverStore] = useState(createDayStore);
	const [selectedDay, setSelectedDay] = useState<string>();
	const [expandedDay, setExpandedDay] = useState<string>();
	const [form, setForm] = useState<string | null>(null);
	const [goalOpen, setGoalOpen] = useState(false);
	const [confirm, setConfirm] = useState<{
		type: "reread" | "discard" | "discardRun";
		id: string;
	} | null>(null);
	const queryClient = useQueryClient();
	const query = useQuery(
		orpc.readingSessions.history.queryOptions({
			input: { bookUuid, runId, timeZone },
		}),
	);
	const refresh = () =>
		queryClient.invalidateQueries({
			queryKey: orpc.readingSessions.history.key(),
		});
	const mutation = useMutation({
		mutationFn: async (action: {
			type: "reread" | "finish" | "leave" | "discard" | "discardRun";
			id: string;
		}) => {
			if (action.type === "discard")
				return client.readingSessions.discard({ bookUuid, id: action.id });
			if (action.type === "discardRun")
				return client.readingSessions.discardRun({ bookUuid, id: action.id });
			const result = await client.readingSessions.mutateRun({
				bookUuid,
				id: action.id,
				action: action.type,
			});
			if (action.type === "reread") setRunId(result?.id);
			return result;
		},
		onSuccess: (_result, action) => {
			if (action.type === "discardRun") setRunId(undefined);
			setConfirm(null);
			void refresh();
		},
	});
	if (query.isPending) return <ReadingHistorySkeleton />;
	if (query.isError)
		return (
			<div role="alert" className="space-y-3 py-8">
				<p>{m.reading_error()}</p>
				<Button
					className="h-auto min-h-11 max-w-full whitespace-normal py-2"
					variant="outline"
					onClick={() => void query.refetch()}
				>
					{m.reading_retry()}
				</Button>
			</div>
		);
	const data = query.data;
	const amountChars = data.characterCount ?? bookAmountChars;
	const unit = readingUnit(amountChars);
	const current = data.runs.find((r) => r.id === data.runId);
	const today = new Intl.DateTimeFormat("en-CA", { timeZone }).format(
		new Date(),
	);
	// A finished book reads best as the whole journey.
	const activePeriod =
		period ??
		(current?.state === "finished" ? "all" : defaultPeriod(data.days, today));
	const calendarSlots = chartSlots(
		data.days,
		activePeriod,
		today,
		amountChars,
		current?.state !== "finished",
	);
	const ordered = [...data.days].reverse();
	const weeks = groupByWeek(ordered);
	const sessionById = new Map(
		data.sessions.map((session) => [session.id, session]),
	);
	const date = (value: string, options: Intl.DateTimeFormatOptions = {}) =>
		new Intl.DateTimeFormat(getLocale(), {
			dateStyle: Object.keys(options).length ? undefined : "medium",
			...options,
			timeZone: value.length === 10 ? "UTC" : timeZone,
		}).format(new Date(value.length === 10 ? `${value}T12:00:00Z` : value));
	const runState = (state: string) =>
		state === "finished"
			? m.reading_run_finished()
			: state === "left"
				? m.reading_run_left()
				: m.reading_run_reading();
	const selectDay = (day: string) => {
		setSelectedDay(day);
		setExpandedDay(day);
		const index = weeks.findIndex((w) => w.days.some((d) => d.day === day));
		setWeekCount((count) => Math.max(count, index + 1));
		requestAnimationFrame(() => {
			const row = document.getElementById(`${historyId}-day-${day}`);
			row?.scrollIntoView({ block: "nearest", behavior: "smooth" });
			row?.focus({ preventScroll: true });
		});
	};
	const sessionProgress = new Map<string, number>();
	for (const s of data.segments)
		if (s.kind !== "jump" && s.startPosition !== null && s.endPosition !== null)
			sessionProgress.set(
				s.sessionId,
				(sessionProgress.get(s.sessionId) ?? 0) +
					Math.max(0, s.endPosition - s.startPosition),
			);
	const sessionRanges = new Map<string, ReadRange[]>();
	for (const s of data.segments)
		sessionRanges.set(s.sessionId, [
			...(sessionRanges.get(s.sessionId) ?? []),
			...readRanges([
				{ start: s.startPosition, end: s.endPosition, kind: s.kind },
			]),
		]);
	for (const [id, ranges] of sessionRanges)
		sessionRanges.set(
			id,
			ranges.sort((a, b) => a.start - b.start),
		);
	const sessionToEdit = data.sessions.find((s) => s.id === form);
	const position = data.position ?? 0;
	const speed = speedPerHour(data.speed, amountChars);
	const finishIn =
		current?.state === "reading"
			? finishInDays({
					remainingSeconds: data.remainingSeconds,
					totalSeconds: data.totalSeconds,
					position: data.position,
					days: data.days,
				})
			: null;
	const { slots, projection } = withProjection(calendarSlots, finishIn, today);
	const longestSession = data.longestSession
		? sessionById.get(data.longestSession.id)
		: undefined;
	const hasActivity = data.days.length > 0;
	const finished = current?.state === "finished";
	const summary = runSummary(data.days);
	const speedLabel =
		speed === null
			? "—"
			: unit === "chars"
				? m.reading_speed_chars({ value: formatAmount(speed, unit) })
				: m.reading_speed_percent({ value: speed.toFixed(speed < 10 ? 1 : 0) });
	const versus = todayVersusAverage(data.days, today, amountChars);
	const amountText = (value: number) =>
		unit === "chars"
			? m.reading_amount_chars({ value: formatAmount(value, unit) })
			: m.reading_amount_percent({ value: formatAmount(value, unit) });
	const localDay = (iso: string) =>
		new Intl.DateTimeFormat("en-CA", { timeZone }).format(new Date(iso));
	const goal = goalStatus({
		goalDate: current?.goalDate ?? null,
		today,
		position: data.position,
		days: data.days,
		finishIn,
		finishedOn: finished && current?.endedAt ? localDay(current.endedAt) : null,
	});
	const goalDay = (value: string) =>
		date(
			value,
			daysBetween(today, value) < 7 && daysBetween(today, value) >= 0
				? { weekday: "long", day: "numeric" }
				: { day: "numeric", month: "long" },
		);
	const dayRange = (first: string, last: string) =>
		new Intl.DateTimeFormat(getLocale(), {
			day: "numeric",
			month: "short",
			timeZone: "UTC",
		}).formatRange(
			new Date(`${first}T12:00:00Z`),
			new Date(`${last}T12:00:00Z`),
		);
	const recordFigures: Figure[] = [
		{
			label: m.reading_longest(),
			value: data.longestSession
				? readingDuration(data.longestSession.seconds)
				: "—",
			detail: longestSession ? date(longestSession.startedAt) : undefined,
		},
		{
			label: m.reading_best_day(),
			value: data.bestDay ? readingDuration(data.bestDay.seconds) : "—",
			detail: data.bestDay ? date(data.bestDay.day) : undefined,
		},
	];
	const readingFigures: Figure[] = [
		{
			label: m.reading_recorded(),
			value: readingDuration(data.totalSeconds),
			detail: m.reading_in_days({ count: data.days.length }),
		},
		{
			label: m.reading_speed(),
			value: speedLabel,
			detail: speed === null ? m.reading_speed_pending() : undefined,
		},
		...recordFigures,
	];
	const finishedFigures: Figure[] = summary
		? [
				{ label: m.reading_days(), value: String(summary.readingDays) },
				{
					label: m.reading_recorded(),
					value: readingDuration(data.totalSeconds),
				},
				unit === "chars" && amountChars
					? {
							label: m.reading_summary_chars(),
							value: formatAmount(amountChars, unit),
						}
					: {
							label: m.reading_summary_sessions(),
							value: String(data.sessions.length),
						},
				{ label: m.reading_average_speed(), value: speedLabel },
				...recordFigures,
			]
		: [];
	// Today's target: the goal's daily share when there is one, else the usual day.
	const todayTarget =
		goal?.kind === "active" && goal.perDay > 0
			? progressAmount(goal.perDay, amountChars)
			: versus.average;
	const todayNote =
		goal?.kind === "active"
			? goal.todayLeft <= 0
				? { text: m.reading_goal_today_done(), positive: true }
				: {
						text: m.reading_goal_today_left({
							amount: amountText(progressAmount(goal.todayLeft, amountChars)),
						}),
						positive: false,
					}
			: versus.average === null
				? null
				: versus.ahead !== null
					? {
							text: m.reading_vs_average_ahead({ percent: versus.ahead }),
							positive: true,
						}
					: null;
	return (
		<section
			aria-label={m.reading_title()}
			className="@container min-w-0 space-y-10"
		>
			<div className="flex flex-wrap items-center justify-between gap-3">
				{data.runs.length > 1 ? (
					<Segmented
						label={m.reading_previous()}
						value={data.runId ?? ""}
						options={data.runs.map((run, i) => ({
							value: run.id,
							label: () =>
								`${m.reading_run({ number: data.runs.length - i })} · ${runState(run.state)}`,
						}))}
						onChange={(id) => {
							setRunId(id);
							setPeriod(undefined);
							setSelectedDay(undefined);
							setExpandedDay(undefined);
							setWeekCount(3);
						}}
					/>
				) : (
					<span />
				)}
				<div className="flex flex-wrap items-center gap-1">
					<Button variant="secondary" onClick={() => setForm("new")}>
						<Plus aria-hidden="true" /> {m.reading_add()}
					</Button>
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button
								size="icon"
								variant="secondary"
								disabled={mutation.isPending}
								aria-label={m.reading_actions()}
							>
								<DotsThreeVertical aria-hidden="true" />
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end">
							{current?.state === "reading" ? (
								<>
									<DropdownMenuItem
										onClick={() =>
											mutation.mutate({ type: "finish", id: current.id })
										}
									>
										{m.reading_complete_run()}
									</DropdownMenuItem>
									<DropdownMenuItem
										onClick={() =>
											mutation.mutate({ type: "leave", id: current.id })
										}
									>
										{m.reading_leave_run()}
									</DropdownMenuItem>
								</>
							) : (
								<DropdownMenuItem
									onClick={() =>
										setConfirm({ type: "reread", id: crypto.randomUUID() })
									}
								>
									<ArrowCounterClockwise aria-hidden="true" />
									{m.reading_reread()}
								</DropdownMenuItem>
							)}
							{current && (
								<>
									<DropdownMenuSeparator />
									<DropdownMenuItem
										variant="destructive"
										onClick={() =>
											setConfirm({ type: "discardRun", id: current.id })
										}
									>
										<Trash aria-hidden="true" />
										{m.reading_delete_run()}
									</DropdownMenuItem>
								</>
							)}
						</DropdownMenuContent>
					</DropdownMenu>
				</div>
			</div>
			{!hasActivity ? (
				<EmptyHistory bookUuid={bookUuid} onAddSession={() => setForm("new")} />
			) : (
				<>
					{finished && summary ? (
						<div className="space-y-6">
							<div className="flex items-center gap-4">
								<span className="grid size-14 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground">
									<Check aria-hidden="true" weight="bold" className="size-7" />
								</span>
								<div className="min-w-0 space-y-0.5">
									<p className="font-semibold text-3xl tracking-tight">
										{m.reading_summary_title()}
									</p>
									<p className="text-muted-foreground text-sm">
										{current?.endedAt &&
											`${m.reading_finished_on({ date: date(current.endedAt) })} · `}
										{dayRange(summary.first, summary.last)}
									</p>
									{goal?.kind === "met" && (
										<p className="flex items-center gap-1.5 font-medium text-primary text-sm">
											<Flag aria-hidden="true" weight="fill" />
											{goal.daysEarly === 0
												? m.reading_goal_met_exact()
												: m.reading_goal_met({ count: goal.daysEarly })}
										</p>
									)}
									{goal?.kind === "missed" && (
										<p className="flex items-center gap-1.5 text-muted-foreground text-sm">
											<Flag aria-hidden="true" />
											{m.reading_goal_missed({ count: goal.daysLate })}
										</p>
									)}
								</div>
							</div>
							<FigureGrid figures={finishedFigures} />
						</div>
					) : (
						<div className="space-y-6">
							<div className="space-y-4 rounded-3xl bg-muted/30 @sm:p-6 p-5">
								<div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
									<div className="min-w-0">
										<p className="font-medium text-muted-foreground text-xs uppercase tracking-wider">
											{current ? runState(current.state) : m.reading_empty()}
										</p>
										<p className="mt-1 font-semibold text-7xl tabular-nums leading-none tracking-tighter">
											<span className="sr-only">{m.reading_position()}: </span>
											{data.position === null
												? "—"
												: Math.round(position * 100)}
											<span className="ml-1 font-medium text-4xl text-muted-foreground">
												%
											</span>
										</p>
									</div>
									<div className="min-w-0 @sm:text-right">
										<p className="font-medium text-muted-foreground text-xs uppercase tracking-wider">
											{m.reading_finish_label()}
										</p>
										{finishIn !== null ? (
											<>
												<p className="mt-1 font-semibold text-2xl tracking-tight first-letter:uppercase">
													{goalDay(addDays(today, finishIn))}
												</p>
												{data.remainingSeconds !== null && (
													<p className="text-muted-foreground text-sm tabular-nums">
														{m.reading_finish_hours({
															duration: readingDuration(data.remainingSeconds),
														})}
													</p>
												)}
											</>
										) : (
											<p className="mt-1 max-w-56 text-muted-foreground text-sm">
												{data.estimateNeeds?.sessions
													? m.reading_needs_sessions({
															count: data.estimateNeeds.sessions,
														})
													: data.estimateNeeds?.seconds
														? m.reading_needs_minutes({
																count: Math.ceil(
																	data.estimateNeeds.seconds / 60,
																),
															})
														: m.reading_insufficient()}
											</p>
										)}
									</div>
								</div>
								<RangeBar start={0} end={position} className="h-3" />
								<div className="flex flex-wrap justify-between gap-x-4 gap-y-1 text-muted-foreground text-xs tabular-nums">
									<p>
										{unit === "chars" &&
											amountChars &&
											data.position !== null &&
											m.reading_chars_of_total({
												read: formatAmount(
													Math.round(position * amountChars),
													unit,
												),
												total: formatAmount(amountChars, unit),
											})}
									</p>
									{data.days[0] && (
										<p>
											{m.reading_since({
												date: date(data.days[0].day, {
													day: "numeric",
													month: "short",
												}),
											})}
										</p>
									)}
								</div>
							</div>
							{current?.state === "reading" && (
								<div className="rounded-3xl bg-muted/30 @sm:p-6 p-5">
									<div className="flex items-center gap-5">
										{todayTarget !== null && (
											<ProgressRing ratio={versus.amount / todayTarget}>
												<span className="font-semibold text-sm tabular-nums">
													{Math.round((versus.amount / todayTarget) * 100)}%
												</span>
											</ProgressRing>
										)}
										<div className="min-w-0 space-y-1">
											<p className="font-medium text-muted-foreground text-xs uppercase tracking-wider">
												{m.reading_today_heading()}
											</p>
											<p className="font-semibold text-2xl tabular-nums tracking-tight">
												{versus.amount > 0
													? amountText(versus.amount)
													: m.reading_today_nothing()}
											</p>
											{todayNote && (
												<p
													className={cn(
														"text-sm",
														todayNote.positive
															? "font-medium text-primary"
															: "text-muted-foreground",
													)}
												>
													{todayNote.text}
												</p>
											)}
										</div>
										{(todayTarget !== null || !current.goalDate) && (
											<div className="ml-auto flex shrink-0 flex-col items-end gap-2 text-right">
												{todayTarget !== null && (
													<div>
														<p className="font-medium text-muted-foreground text-xs uppercase tracking-wider">
															{goal?.kind === "active"
																? m.reading_today_target()
																: m.reading_your_average()}
														</p>
														<p className="font-semibold text-xl tabular-nums tracking-tight">
															{amountText(todayTarget)}
														</p>
													</div>
												)}
												{!current.goalDate && (
													<GoalPanel
														goal={null}
														goalDate={null}
														dayLabel={goalDay}
														onEdit={() => setGoalOpen(true)}
													/>
												)}
											</div>
										)}
									</div>
									{current.goalDate && (
										<div className="mt-5 border-border/40 border-t pt-5">
											<GoalPanel
												goal={goal}
												goalDate={current.goalDate}
												dayLabel={goalDay}
												onEdit={() => setGoalOpen(true)}
												timeline={
													goal?.kind === "active"
														? {
																...goalTimeline({
																	start: data.days[0]?.day ?? today,
																	today,
																	goalDay: current.goalDate,
																	finishDay:
																		finishIn === null
																			? null
																			: addDays(today, finishIn),
																}),
																finishLabel:
																	finishIn === null
																		? null
																		: m.reading_projection_goal({
																				date: goalDay(addDays(today, finishIn)),
																			}),
															}
														: null
												}
											/>
										</div>
									)}
								</div>
							)}
							<FigureGrid figures={readingFigures} />
						</div>
					)}
					<HistorySection
						title={m.reading_evolution()}
						actions={
							<div className="flex flex-wrap items-center gap-2">
								<Segmented
									label={m.reading_evolution()}
									value={metric}
									options={[
										{
											value: "amount",
											label:
												unit === "chars"
													? m.reading_characters_short
													: m.reading_progress_short,
										},
										{ value: "time", label: m.reading_time },
									]}
									onChange={setMetric}
								/>
								<Segmented
									label={m.reading_period()}
									value={activePeriod}
									options={PERIODS}
									onChange={(value) => {
										setPeriod(value);
										setSelectedDay(undefined);
									}}
								/>
							</div>
						}
					>
						<div className="rounded-3xl bg-muted/30 @sm:p-6 p-4">
							{slots.some((slot) => slot.read) ? (
								<ReadingHistoryChart
									key={`${data.runId}:${activePeriod}`}
									slots={slots}
									unit={unit}
									metric={metric}
									selectedDay={selectedDay}
									onSelectDay={selectDay}
									highlight={hoverStore}
									projection={projection}
								/>
							) : (
								<p className="py-16 text-center text-muted-foreground text-sm">
									{m.reading_chart_empty()}
								</p>
							)}
						</div>
					</HistorySection>
					{(data.paces.length >= 3 || !finished) && (
						<HistorySection title={m.reading_pace_title()}>
							<div className="rounded-3xl bg-muted/30 @sm:p-6 p-4">
								{data.paces.length >= 3 ? (
									<ReadingPaceChart
										paces={data.paces}
										unit={unit}
										amountChars={amountChars}
										timeZone={timeZone}
									/>
								) : (
									<PaceUnlock measured={data.paces.length} />
								)}
							</div>
						</HistorySection>
					)}
					<HistorySection title={m.reading_diary()}>
						<ReadingDiary
							weeks={weeks.slice(0, weekCount)}
							allDays={ordered}
							sessionById={sessionById}
							sessionProgress={sessionProgress}
							sessionRanges={sessionRanges}
							// A record means little until there is something to beat.
							bestDay={data.days.length >= 3 ? data.bestDay?.day : undefined}
							longestSessionId={
								data.sessions.length >= 3 ? data.longestSession?.id : undefined
							}
							onHoverDay={hoverStore.set}
							amountChars={amountChars}
							unit={unit}
							timeZone={timeZone}
							today={today}
							historyId={historyId}
							selectedDay={selectedDay}
							expandedDay={expandedDay}
							onToggleDay={(day) => {
								setSelectedDay(day);
								setExpandedDay(expandedDay === day ? undefined : day);
							}}
							onEdit={setForm}
						/>
						<div className="flex flex-wrap items-center justify-between gap-2 px-1 text-muted-foreground text-xs">
							<span>{m.reading_zone({ zone: timeZone })}</span>
							{weeks.length > weekCount && (
								<Button
									variant="secondary"
									size="sm"
									onClick={() => setWeekCount((n) => n + 3)}
								>
									{m.reading_more()}
								</Button>
							)}
						</div>
					</HistorySection>
				</>
			)}
			{data.overlapSeconds > 0 && (
				<p className="text-muted-foreground text-xs">{m.reading_overlap()}</p>
			)}
			{mutation.isError && (
				<p role="alert" className="text-destructive text-sm">
					{m.reading_error()}
				</p>
			)}
			{goalOpen && data.runId && (
				<ReadingGoalDialog
					bookUuid={bookUuid}
					runId={data.runId}
					goalDate={current?.goalDate ?? null}
					today={today}
					onClose={() => setGoalOpen(false)}
					onSaved={() => {
						setGoalOpen(false);
						void refresh();
					}}
				/>
			)}
			{form && (
				<ReadingSessionForm
					bookUuid={bookUuid}
					runId={data.runId}
					timeZone={timeZone}
					session={sessionToEdit}
					segments={data.segments.filter((s) => s.sessionId === form)}
					onClose={() => setForm(null)}
					onDiscard={() => {
						setConfirm({ type: "discard", id: form });
						setForm(null);
					}}
					onSaved={() => {
						setForm(null);
						void refresh();
					}}
				/>
			)}
			<Modal
				open={Boolean(confirm)}
				onOpenChange={(open) => {
					if (!open) setConfirm(null);
				}}
				title={
					confirm?.type === "reread"
						? m.reading_reread()
						: confirm?.type === "discardRun"
							? m.reading_delete_run()
							: m.reading_discard()
				}
				description={
					confirm?.type === "reread"
						? m.reading_reread_hint()
						: confirm?.type === "discardRun"
							? m.reading_delete_run_hint()
							: m.reading_discard_hint()
				}
				footer={
					<>
						<Button
							className="h-auto min-h-11 max-w-full whitespace-normal py-2"
							variant="outline"
							onClick={() => setConfirm(null)}
						>
							{m.reading_cancel()}
						</Button>
						<Button
							className="h-auto min-h-11 max-w-full whitespace-normal py-2"
							disabled={mutation.isPending}
							onClick={() => {
								if (confirm) mutation.mutate(confirm);
							}}
						>
							{confirm?.type === "reread"
								? m.reading_reread()
								: confirm?.type === "discardRun"
									? m.reading_delete_run()
									: m.reading_discard()}
						</Button>
					</>
				}
			/>
		</section>
	);
}
