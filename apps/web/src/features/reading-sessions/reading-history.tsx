import {
	ArrowCounterClockwise,
	Check,
	DotsThreeVertical,
	Fire,
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
import { type HistoryCopy, historyCopy, type Medium } from "./history-copy";
import { type Journey, ReadingDiary } from "./reading-diary";
import { readingDuration } from "./reading-duration";
import { EmptyHistory, GoalPanel, PaceUnlock } from "./reading-goal";
import { ReadingGoalDialog } from "./reading-goal-dialog";
import { formatAmount, ReadingHistoryChart } from "./reading-history-chart";
import {
	addDays,
	type BookChapter,
	type ChartPeriod,
	chapterAt,
	chapterLeft,
	chartSlots,
	daysBetween,
	defaultPeriod,
	displaySpeed,
	finishInDays,
	formatClock,
	goalStatus,
	goalTimeline,
	groupByWeek,
	listeningScale,
	progressAmount,
	type ReadRange,
	readingDay,
	readingScale,
	readRanges,
	runSummary,
	streaks,
	timeFor,
	todayVersusAverage,
	withProjection,
} from "./reading-history-model";
import { type Figure, FigureGrid, ProgressRing } from "./reading-overview";
import { ReadingPaceChart } from "./reading-pace-chart";
import { ReadingSessionForm } from "./reading-session-form";
import { Segmented } from "./segmented";
export type ReadingHistoryData = Awaited<
	ReturnType<typeof client.readingSessions.history>
>;
export function percentage(value: number | null) {
	return value === null ? "—" : `${Math.round(value * 100)} %`;
}
export interface HistoryChapter {
	title: string | null;
	startTime: number;
}

export function ReadingHistory({
	bookUuid,
	amountChars,
	durationSeconds,
	chapters,
	medium = "reading",
}: {
	bookUuid: string;
	amountChars?: number | null;
	// Audiobook length, used until a listening session reports its own.
	durationSeconds?: number | null;
	chapters?: HistoryChapter[];
	medium?: Medium;
}) {
	return (
		<BookReadingHistory
			key={bookUuid}
			bookUuid={bookUuid}
			amountChars={amountChars ?? null}
			durationSeconds={durationSeconds ?? null}
			chapters={chapters ?? []}
			medium={medium}
		/>
	);
}

const PERIODS: { value: ChartPeriod; label: () => string }[] = [
	{ value: "week", label: m.reading_period_week },
	{ value: "month", label: m.reading_period_month },
	{ value: "all", label: m.reading_period_all },
];

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

function ReadingHistorySkeleton({ copy }: { copy: HistoryCopy }) {
	return (
		<div role="status" className="@container min-w-0 space-y-10">
			<span className="sr-only">{copy.loading()}</span>
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
	durationSeconds: bookDuration,
	chapters,
	medium,
}: {
	bookUuid: string;
	amountChars: number | null;
	durationSeconds: number | null;
	chapters: HistoryChapter[];
	medium: Medium;
}) {
	const copy = historyCopy(medium);
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
			queryKey: orpc.readingSessions.key(),
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
	if (query.isPending) return <ReadingHistorySkeleton copy={copy} />;
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
	const scale =
		medium === "listening"
			? listeningScale(data.durationSeconds ?? bookDuration)
			: readingScale(data.characterCount ?? bookAmountChars);
	const { unit } = scale;
	// Audio chapters arrive in seconds; books carry the reader's map as fractions.
	const bookChapters: BookChapter[] =
		medium === "listening"
			? unit === "audio"
				? chapters.map((c) => ({
						title: c.title,
						start: c.startTime / scale.total,
					}))
				: []
			: (data.chapters ?? []);
	const chapterLabel = (position: number) => {
		const number = chapterAt(bookChapters, position);
		if (number === null) return null;
		const title = bookChapters[number - 1]?.title;
		return title ? `${number}. ${title}` : m.reading_chapter({ number });
	};
	// Days and weeks name chapters; sessions give the exact place, as the player or the percentage.
	const journey: Journey | undefined =
		bookChapters.length || unit === "audio"
			? (from, to, precise) => {
					const end = to ?? 0;
					const start = from ?? end;
					const place = (p: number) =>
						unit === "audio"
							? formatClock(p * scale.total)
							: `${Math.round(p * 100)} %`;
					const exact =
						from === null ? place(end) : `${place(start)} → ${place(end)}`;
					const first = chapterAt(bookChapters, start);
					const last = chapterAt(bookChapters, end);
					const titles = [chapterLabel(start), chapterLabel(end)]
						.filter((label, i, all) => label && all.indexOf(label) === i)
						.join(" → ");
					if ((precise && unit === "audio") || first === null || last === null)
						return { text: exact, title: titles || undefined };
					return {
						text:
							first === last
								? m.reading_chapter({ number: first })
								: m.reading_chapter_span({ from: first, to: last }),
						title: `${exact}${titles ? ` · ${titles}` : ""}`,
					};
				}
			: undefined;
	const current = data.runs.find((r) => r.id === data.runId);
	const today = readingDay(Date.now(), timeZone, data.dayStartHour);
	// A finished book reads best as the whole journey.
	const activePeriod =
		period ??
		(current?.state === "finished" ? "all" : defaultPeriod(data.days, today));
	const calendarSlots = chartSlots(
		data.days,
		activePeriod,
		today,
		scale,
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
	const speed = displaySpeed(data.speed, scale);
	// Audio length is known up front, so the estimate needs no sessions: real time at the measured speed, else 1×.
	const remainingSeconds =
		unit === "audio" && data.remainingSeconds === null && data.position !== null
			? Math.max(
					data.position < 1 ? 60 : 0,
					Math.round(((1 - data.position) * scale.total) / (speed ?? 1) / 60) *
						60,
				)
			: data.remainingSeconds;
	const chapterFraction =
		data.position === null ? null : chapterLeft(bookChapters, data.position);
	// Audio falls back to 1× until a session measures the listening speed.
	const chapterSeconds =
		chapterFraction === null
			? null
			: (timeFor(chapterFraction, data.speed) ??
				(unit === "audio" ? chapterFraction * scale.total : null));
	const finishIn =
		current?.state === "reading"
			? finishInDays({
					remainingSeconds,
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
	const streak = streaks(data.days, today);
	const listening = unit === "audio";
	// Audio is shown as listening time: book amounts become minutes at the playback speed.
	const listenTime = (audioSeconds: number) => audioSeconds / (speed ?? 1);
	const speedLabel =
		speed === null
			? "—"
			: listening
				? m.listening_speed({
						value: (Math.round(speed * 20) / 20).toFixed(2),
					})
				: unit === "chars"
					? m.reading_speed_chars({ value: formatAmount(speed, unit) })
					: m.reading_speed_percent({
							value: speed.toFixed(speed < 10 ? 1 : 0),
						});
	const versus = todayVersusAverage(
		data.days,
		today,
		scale,
		listening ? "time" : "progress",
	);
	const goalAmount = (progress: number) =>
		listening
			? listenTime(progressAmount(progress, scale))
			: progressAmount(progress, scale);
	const amountText = (value: number) =>
		listening
			? readingDuration(value)
			: unit === "chars"
				? m.reading_amount_chars({ value: formatAmount(value, unit) })
				: m.reading_amount_percent({ value: formatAmount(value, unit) });
	const localDay = (iso: string) =>
		readingDay(Date.parse(iso), timeZone, data.dayStartHour);
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
			label: copy.bestDay(),
			value: data.bestDay ? readingDuration(data.bestDay.seconds) : "—",
			detail: data.bestDay ? date(data.bestDay.day) : undefined,
		},
	];
	const readingFigures: Figure[] = [
		{
			label: m.reading_recorded(),
			value: readingDuration(data.totalSeconds),
			detail: copy.inDays({ count: data.days.length }),
		},
		{
			label: copy.speed(),
			value: speedLabel,
			detail:
				speed === null && !listening ? m.reading_speed_pending() : undefined,
		},
		...recordFigures,
	];
	const finishedFigures: Figure[] = summary
		? [
				{
					label: copy.days(),
					value: String(summary.readingDays),
					detail:
						streak.best >= 2
							? m.reading_best_streak({ count: streak.best })
							: undefined,
				},
				{
					label: m.reading_recorded(),
					value: readingDuration(data.totalSeconds),
				},
				unit === "chars"
					? {
							label: m.reading_summary_chars(),
							value: formatAmount(scale.total, unit),
						}
					: unit === "audio"
						? {
								label: m["audiobook.duration"](),
								value: formatAmount(scale.total, unit),
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
			? goalAmount(goal.perDay)
			: versus.average;
	const todayNote =
		goal?.kind === "active"
			? goal.todayLeft <= 0
				? { text: m.reading_goal_today_done(), positive: true }
				: {
						text: m.reading_goal_today_left({
							amount: amountText(goalAmount(goal.todayLeft)),
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
			aria-label={copy.title()}
			className="@container min-w-0 space-y-10"
		>
			<div className="flex flex-wrap items-center justify-between gap-3">
				{data.runs.length > 1 ? (
					<Segmented
						label={copy.previous()}
						value={data.runId ?? ""}
						options={data.runs.map((run, i) => ({
							value: run.id,
							label: () =>
								`${copy.run({ number: data.runs.length - i })} · ${runState(run.state)}`,
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
								aria-label={copy.actions()}
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
										{copy.completeRun()}
									</DropdownMenuItem>
									<DropdownMenuItem
										onClick={() =>
											mutation.mutate({ type: "leave", id: current.id })
										}
									>
										{copy.leaveRun()}
									</DropdownMenuItem>
								</>
							) : (
								<DropdownMenuItem
									onClick={() =>
										setConfirm({ type: "reread", id: crypto.randomUUID() })
									}
								>
									<ArrowCounterClockwise aria-hidden="true" />
									{copy.again()}
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
										{copy.deleteRun()}
									</DropdownMenuItem>
								</>
							)}
						</DropdownMenuContent>
					</DropdownMenu>
				</div>
			</div>
			{!hasActivity ? (
				<EmptyHistory
					bookUuid={bookUuid}
					medium={medium}
					onAddSession={() => setForm("new")}
				/>
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
										{copy.summaryTitle()}
									</p>
									<p className="text-muted-foreground text-sm">
										{current?.endedAt &&
											`${copy.finishedOn({ date: date(current.endedAt) })} · `}
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
											{current ? runState(current.state) : copy.empty()}
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
											{copy.finishLabel()}
										</p>
										{finishIn !== null ? (
											<>
												<p className="mt-1 font-semibold text-2xl tracking-tight first-letter:uppercase">
													{goalDay(addDays(today, finishIn))}
												</p>
												{remainingSeconds !== null && (
													<p className="text-muted-foreground text-sm tabular-nums">
														{copy.finishHours({
															duration: readingDuration(remainingSeconds),
														})}
													</p>
												)}
											</>
										) : (
											<p className="mt-1 max-w-56 text-muted-foreground text-sm">
												{unit === "audio"
													? copy.insufficient()
													: data.estimateNeeds?.sessions
														? m.reading_needs_sessions({
																count: data.estimateNeeds.sessions,
															})
														: data.estimateNeeds?.seconds
															? m.reading_needs_minutes({
																	count: Math.ceil(
																		data.estimateNeeds.seconds / 60,
																	),
																})
															: copy.insufficient()}
											</p>
										)}
										{/* Needs only the measured speed, not the whole-book estimate. */}
										{chapterSeconds !== null && chapterSeconds >= 60 && (
											<p className="text-muted-foreground text-sm tabular-nums">
												{m.reading_chapter_left({
													duration: readingDuration(chapterSeconds),
												})}
											</p>
										)}
									</div>
								</div>
								<RangeBar start={0} end={position} className="h-3" />
								<div className="flex flex-wrap justify-between gap-x-4 gap-y-1 text-muted-foreground text-xs tabular-nums">
									<p>
										{data.position !== null &&
											[
												unit === "chars"
													? m.reading_chars_of_total({
															read: formatAmount(
																Math.round(position * scale.total),
																unit,
															),
															total: formatAmount(scale.total, unit),
														})
													: unit === "audio"
														? m.listening_audio_of_total({
																heard: formatAmount(
																	position * scale.total,
																	unit,
																),
																total: formatAmount(scale.total, unit),
															})
														: null,
												chapterLabel(position),
											]
												.filter(Boolean)
												.join(" · ")}
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
													: copy.todayNothing()}
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
											{streak.current >= 2 && (
												<p className="flex items-center gap-1.5 font-medium text-sm">
													<Fire
														aria-hidden="true"
														weight="fill"
														className="text-primary"
													/>
													{m.reading_streak({ count: streak.current })}
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
																		: copy.projectionGoal({
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
						title={copy.evolution()}
						actions={
							<div className="flex flex-wrap items-center gap-2">
								{/* Audio amount is time × speed, so listening shows time alone. */}
								{!listening && (
									<Segmented
										label={copy.evolution()}
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
								)}
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
									copy={copy}
									metric={listening ? "time" : metric}
									selectedDay={selectedDay}
									onSelectDay={selectDay}
									highlight={hoverStore}
									projection={projection}
								/>
							) : (
								<p className="py-16 text-center text-muted-foreground text-sm">
									{copy.chartEmpty()}
								</p>
							)}
						</div>
					</HistorySection>
					{/* A listening speed is the player setting, not a skill that trends. */}
					{!listening && (data.paces.length >= 3 || !finished) && (
						<HistorySection title={m.reading_pace_title()}>
							<div className="rounded-3xl bg-muted/30 @sm:p-6 p-4">
								{data.paces.length >= 3 ? (
									<ReadingPaceChart
										paces={data.paces}
										scale={scale}
										timeZone={timeZone}
									/>
								) : (
									<PaceUnlock measured={data.paces.length} />
								)}
							</div>
						</HistorySection>
					)}
					<HistorySection title={copy.diary()}>
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
							scale={scale}
							copy={copy}
							journey={journey}
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
					copy={copy}
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
					copy={copy}
					audioDuration={listening ? scale.total : undefined}
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
						? copy.again()
						: confirm?.type === "discardRun"
							? copy.deleteRun()
							: m.reading_discard()
				}
				description={
					confirm?.type === "reread"
						? copy.againHint()
						: confirm?.type === "discardRun"
							? copy.deleteRunHint()
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
								? copy.again()
								: confirm?.type === "discardRun"
									? copy.deleteRun()
									: m.reading_discard()}
						</Button>
					</>
				}
			/>
		</section>
	);
}
