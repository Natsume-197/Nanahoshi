import {
	CaretRight,
	ChartBar,
	Check,
	ClockCounterClockwise,
	Pause,
	Play,
	Stop,
	Timer,
} from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { type CSSProperties, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { GoalEditor } from "@/features/reading-stats/goal-editor";
import { TONES } from "@/features/reading-stats/stats-shared";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { m } from "@/paraglide/messages";
import { getLocale } from "@/paraglide/runtime";
import { orpc } from "@/utils/orpc";
import { clockParts, readingDuration } from "./reading-duration";
import { ReadingHistory } from "./reading-history";
import { formatAmount } from "./reading-history-chart";
import {
	chapterLeft,
	displaySpeed,
	finishInDays,
	readingDay,
	readingScale,
	timeFor,
} from "./reading-history-model";
import { Segmented } from "./segmented";
import type { TrackingMode } from "./session-clock";
import { DailyGoalCard, ProgressRing } from "./session-goal";
import { readingGoalProgress, sessionSpeed } from "./session-panel-model";
import type { ReadingTracker } from "./use-reading-tracker";

const timeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;
const number = (value: number) =>
	new Intl.NumberFormat(getLocale(), { useGrouping: "always" }).format(value);

function useBookHistory(bookUuid: string) {
	const [zone] = useState(timeZone);
	return useQuery(
		orpc.readingSessions.history.queryOptions({
			input: { bookUuid, timeZone: zone },
		}),
	);
}

function useToday(tracker: ReadingTracker, enabled: boolean) {
	const [zone] = useState(timeZone);
	return useQuery({
		...orpc.readingSessions.today.queryOptions({ input: { timeZone: zone } }),
		enabled: enabled && !!tracker.preferences,
	});
}

export function ReadingSessionControl({
	tracker,
	surface,
}: {
	tracker: ReadingTracker;
	// Design tokens of the reading theme, so the panel sits on the page.
	surface?: CSSProperties;
}) {
	const mobile = useIsMobile();
	const triggerRef = useRef<HTMLButtonElement>(null);
	const stateId = useId();
	const [open, setOpen] = useState(false);
	const [historyOpen, setHistoryOpen] = useState(false);
	const [goalOpen, setGoalOpen] = useState(false);
	const goals = tracker.preferences?.goals;
	// The trigger ring only needs today's totals once a reading goal exists.
	const today = useToday(tracker, open || goals?.reading != null);
	const triggerGoal = readingGoalProgress(goals, today.data?.day, null, null);
	// Glow once when the goal closes during this visit, not on every reopen.
	const [goalClosed, setGoalClosed] = useState(false);
	const lastRatio = useRef(triggerGoal?.ratio ?? null);
	if ((triggerGoal?.ratio ?? null) !== lastRatio.current) {
		if (
			lastRatio.current !== null &&
			lastRatio.current < 1 &&
			(triggerGoal?.ratio ?? 0) >= 1
		)
			setGoalClosed(true);
		lastRatio.current = triggerGoal?.ratio ?? null;
	}
	const disabled = tracker.preferences?.mode === "off";
	const stateLabel = disabled
		? m.reading_off()
		: tracker.otherTab
			? m.reading_other_tab()
			: tracker.state === "paused"
				? tracker.pauseReason === "manual"
					? m.reading_paused_manual()
					: tracker.pauseReason === "hidden"
						? m.reading_paused_hidden()
						: m.reading_paused_idle()
				: tracker.state === "active"
					? m.reading_active()
					: tracker.state === "finished"
						? m.reading_finished()
						: tracker.preferences?.mode === "manual"
							? m.reading_ready_manual()
							: m.reading_ready();
	const leaveFor = (next: () => void) => {
		if (tracker.state === "active") tracker.act("pause");
		setOpen(false);
		next();
	};
	const Glyph =
		tracker.state === "finished"
			? Check
			: tracker.state === "paused"
				? Pause
				: Timer;
	// Only a running clock earns text; every other state reads from the icon and its tooltip.
	const showTime = tracker.state === "active" && tracker.seconds >= 60;
	const trigger = (
		<button
			type="button"
			ref={triggerRef}
			aria-label={m.reading_session()}
			aria-describedby={stateId}
			title={stateLabel}
			// Same shape and resting opacity as the header's IconButton.
			className={cn(
				"flex h-[44px] min-w-[44px] shrink-0 cursor-pointer touch-manipulation select-none items-center justify-center gap-1.5 rounded-md text-sm tabular-nums opacity-70 transition-[background-color,opacity,scale] duration-150 hover:bg-[var(--rh-hover)] hover:opacity-100 focus-visible:outline-offset-2 active:scale-[0.96] max-[22rem]:h-10 max-[22rem]:min-w-10 sm:h-10 sm:min-w-10",
				open && "bg-[var(--rh-hover)] opacity-100",
				showTime && "ps-2.5 pe-3",
			)}
			data-reading-session-trigger
			onClick={() => setOpen(true)}
		>
			{triggerGoal ? (
				// Phosphor draws ~15px inside its 20px box with a 1.25px line; match both.
				<span className="grid size-5 shrink-0 place-items-center">
					<ProgressRing
						ratio={triggerGoal.ratio}
						size={15}
						stroke={1.25}
						// A visible track keeps a partial arc from reading as a spinner.
						track={0.4}
						glow={goalClosed}
					>
						{triggerGoal.ratio >= 1 ? (
							<Check aria-hidden="true" weight="bold" className="size-2.5" />
						) : (
							<span
								aria-hidden="true"
								className={cn(
									"size-1 rounded-full bg-current",
									tracker.state !== "active" && "opacity-50",
								)}
							/>
						)}
					</ProgressRing>
				</span>
			) : (
				<Glyph aria-hidden="true" className="size-5 shrink-0" />
			)}
			{showTime && (
				<span aria-hidden="true">{readingDuration(tracker.seconds)}</span>
			)}
			<span id={stateId} className="sr-only">
				{stateLabel}
			</span>
		</button>
	);
	const content = (
		<div
			data-reading-controls
			style={TONES}
			className="flex min-w-0 flex-col divide-y divide-border break-words [&>*]:py-4 [&>:first-child]:pt-1 [&>:last-child]:pb-0"
		>
			<SessionHero tracker={tracker} stateLabel={stateLabel} />
			<DailyGoal
				tracker={tracker}
				today={today}
				onEdit={() => leaveFor(() => setGoalOpen(true))}
			/>
			<BookSummary
				tracker={tracker}
				onHistory={() => leaveFor(() => setHistoryOpen(true))}
			/>
			<Preferences tracker={tracker} />
		</div>
	);
	return (
		<div data-reading-controls>
			{mobile ? (
				<>
					{trigger}
					<Modal
						open={open}
						onOpenChange={setOpen}
						title={m.reading_session()}
						style={surface}
						className="top-auto bottom-0 max-h-[85dvh] translate-y-0 rounded-b-none p-4 pb-[max(1rem,env(safe-area-inset-bottom))] [&>*]:min-w-0 [&>div:first-child]:pr-8"
					>
						{content}
					</Modal>
				</>
			) : (
				<Popover open={open} onOpenChange={setOpen}>
					<PopoverTrigger asChild>{trigger}</PopoverTrigger>
					<PopoverContent
						align="end"
						style={surface}
						className="max-h-[min(84dvh,46rem)] w-[24rem] max-w-[calc(100vw-2rem)] overflow-y-auto rounded-3xl p-5 shadow-xl ring-border"
					>
						{content}
					</PopoverContent>
				</Popover>
			)}
			<Modal
				open={historyOpen}
				onOpenChange={setHistoryOpen}
				onOpenChangeComplete={(open) => {
					if (!open) triggerRef.current?.focus();
				}}
				title={m.reading_title()}
				className="break-words p-4 sm:max-w-3xl sm:p-6 [&>*]:min-w-0 [&>div:first-child]:pr-8"
			>
				{historyOpen && <ReadingHistory bookUuid={tracker.bookUuid} />}
			</Modal>
			{goalOpen && goals && (
				<GoalEditor
					goals={goals}
					media={["reading"]}
					onClose={() => {
						setGoalOpen(false);
						triggerRef.current?.focus();
					}}
				/>
			)}
		</div>
	);
}

function DailyGoal({
	tracker,
	today,
	onEdit,
}: {
	tracker: ReadingTracker;
	today: ReturnType<typeof useToday>;
	onEdit: () => void;
}) {
	const history = useBookHistory(tracker.bookUuid);
	return (
		<DailyGoalCard
			goal={readingGoalProgress(
				tracker.preferences?.goals,
				today.data?.day,
				history.data?.speed ?? null,
				history.data?.characterCount,
			)}
			day={today.data?.day}
			loading={today.isPending}
			onEdit={onEdit}
		/>
	);
}

function StateDot({ state }: { state: ReadingTracker["state"] }) {
	return (
		<span aria-hidden="true" className="relative flex size-2">
			{state === "active" && (
				<span className="absolute inset-0 animate-ping rounded-full bg-[var(--stats-reading)] opacity-60 motion-reduce:hidden" />
			)}
			<span
				className={cn(
					"relative size-2 rounded-full",
					state === "active"
						? "bg-[var(--stats-reading)]"
						: "bg-muted-foreground/50",
				)}
			/>
		</span>
	);
}

function Figure({
	label,
	value,
	detail,
	hint,
}: {
	label: string;
	value: string;
	detail?: string | null;
	hint?: string;
}) {
	return (
		<div className="min-w-0" title={hint}>
			<dt className="truncate text-muted-foreground text-xs">{label}</dt>
			<dd className="truncate font-medium tabular-nums">{value}</dd>
			{detail && (
				<dd className="truncate text-muted-foreground text-xs tabular-nums">
					{detail}
				</dd>
			)}
		</div>
	);
}

/** The live clock: state, elapsed time, what this session covered and its controls. */
function SessionHero({
	tracker,
	stateLabel,
}: {
	tracker: ReadingTracker;
	stateLabel: string;
}) {
	const [discarding, setDiscarding] = useState(false);
	const [discardFailed, setDiscardFailed] = useState(false);
	const speed = sessionSpeed(tracker.characters, tracker.seconds);
	const blocked =
		tracker.otherTab ||
		!tracker.preferences ||
		tracker.preferences.mode === "off";
	const range =
		tracker.startPosition !== null && tracker.position !== null
			? `${Math.round(tracker.startPosition * 100)} % → ${Math.round(tracker.position * 100)} %`
			: null;
	const action =
		tracker.state === "active"
			? {
					icon: Pause,
					label: m.reading_pause(),
					run: () => tracker.act("pause"),
					disabled: false,
				}
			: tracker.state === "paused"
				? {
						icon: Play,
						label: m.reading_resume(),
						run: () => tracker.act("resume"),
						disabled: blocked,
					}
				: {
						icon: Play,
						label: m.reading_start(),
						run: () => tracker.act("start"),
						disabled: blocked || discarding,
					};
	const ActionIcon = action.icon;
	const clock = clockParts(tracker.seconds);
	const figures =
		tracker.state === "idle"
			? []
			: [
					tracker.characters !== null && {
						label: m.reading_characters_short(),
						value: `≈ ${number(tracker.characters)}`,
						hint: m.reading_characters_hint(),
					},
					speed !== null && {
						label: m.reading_speed(),
						value: m.reading_speed_chars({ value: number(speed) }),
					},
					range !== null && {
						label: m.reading_progress_short(),
						value: range,
						hint: m.reading_range_hint(),
					},
				].filter((figure) => !!figure);
	return (
		<section aria-label={m.reading_this_session()} className="space-y-4">
			<p className="flex items-center gap-2 text-muted-foreground text-xs">
				<StateDot state={tracker.state} />
				<span className="min-w-0">{stateLabel}</span>
			</p>
			<p
				className={cn(
					"font-light text-[clamp(2.75rem,15vw,3.75rem)] tabular-nums leading-none tracking-tight transition-opacity duration-300",
					tracker.state !== "active" && "opacity-55",
				)}
				aria-live="off"
			>
				{clock.main}
				<span className="text-muted-foreground">{clock.seconds}</span>
			</p>
			{figures.length > 0 && (
				<dl
					className="grid gap-3"
					style={{
						gridTemplateColumns: `repeat(${figures.length}, minmax(0, 1fr))`,
					}}
					aria-live="off"
				>
					{figures.map((figure) => (
						<Figure key={figure.label} {...figure} />
					))}
				</dl>
			)}
			<div className="flex gap-2">
				<Button
					className="h-auto min-h-11 flex-1 whitespace-normal rounded-xl py-2"
					disabled={action.disabled}
					onClick={action.run}
				>
					<ActionIcon aria-hidden="true" weight="fill" />
					{action.label}
				</Button>
				{(tracker.state === "active" || tracker.state === "paused") && (
					<Button
						className="h-auto min-h-11 flex-1 whitespace-normal rounded-xl py-2"
						variant="outline"
						onClick={() => tracker.act("finish")}
					>
						<Stop aria-hidden="true" weight="fill" />
						{m.reading_finish()}
					</Button>
				)}
			</div>
			<SessionStatus tracker={tracker} />
			{tracker.state === "finished" && tracker.sessionId && (
				<div className="space-y-1">
					<button
						type="button"
						className="min-h-9 text-muted-foreground text-xs underline-offset-4 hover:text-foreground hover:underline disabled:opacity-50"
						disabled={discarding}
						onClick={async () => {
							setDiscarding(true);
							setDiscardFailed(false);
							try {
								await tracker.discardSession();
							} catch {
								setDiscardFailed(true);
							} finally {
								setDiscarding(false);
							}
						}}
					>
						{m.reading_discard()}
					</button>
					{discardFailed && (
						<p role="alert" className="text-destructive text-xs">
							{m.reading_discard_failed()}
						</p>
					)}
				</div>
			)}
		</section>
	);
}

function SessionStatus({ tracker }: { tracker: ReadingTracker }) {
	if (tracker.preferencesError)
		return (
			<p role="alert" className="text-destructive text-xs">
				{m.reading_error()}
			</p>
		);
	const retry = (
		<button
			type="button"
			className="underline underline-offset-2"
			onClick={() => void tracker.retry()}
		>
			{m.reading_retry()}
		</button>
	);
	if (tracker.storageError)
		return (
			<p role="alert" className="text-destructive text-xs">
				{m.reading_storage_error()} {retry}
			</p>
		);
	if (tracker.syncError)
		return (
			<p role="status" className="text-muted-foreground text-xs">
				{m.reading_sync_error()} {retry}
			</p>
		);
	if (tracker.pending)
		return (
			<p role="status" className="text-muted-foreground text-xs">
				{m.reading_local_saved()}
			</p>
		);
	if (tracker.state === "finished" && tracker.sessionId)
		return (
			<p
				role="status"
				className="flex items-center gap-1.5 text-muted-foreground text-xs"
			>
				<Check aria-hidden="true" className="size-3.5" />
				{m.reading_synced()}
			</p>
		);
	return null;
}

/** This book's reading: time spent, pace, and how long the chapter and the book still take. */
function BookSummary({
	tracker,
	onHistory,
}: {
	tracker: ReadingTracker;
	onHistory: () => void;
}) {
	const [zone] = useState(timeZone);
	const query = useBookHistory(tracker.bookUuid);
	const data = query.data;
	const scale = readingScale(data?.characterCount);
	const speed = data ? displaySpeed(data.speed, scale) : null;
	const position = tracker.position ?? data?.position ?? null;
	const left =
		position === null
			? null
			: chapterLeft(tracker.chapters() ?? data?.chapters ?? [], position);
	const chapterSeconds =
		left === null ? null : timeFor(left, data?.speed ?? null);
	const current = data?.runs.find((r) => r.id === data.runId);
	const finishIn =
		data && current?.state === "reading"
			? finishInDays({
					remainingSeconds: data.remainingSeconds,
					totalSeconds: data.totalSeconds,
					position: data.position,
					days: data.days,
				})
			: null;
	const today = data
		? data.days.find(
				(d) => d.day === readingDay(Date.now(), zone, data.dayStartHour),
			)
		: undefined;
	const pending = !data && !query.isError;
	const figures = [
		{
			label: m.reading_book_time(),
			value: pending ? "…" : readingDuration(data?.totalSeconds ?? 0),
			detail: today
				? `${m.reading_today_short()} · ${readingDuration(today.seconds)}`
				: null,
		},
		speed !== null && {
			label: m.reading_speed(),
			value:
				scale.unit === "chars"
					? m.reading_speed_chars({ value: formatAmount(speed, scale.unit) })
					: m.reading_speed_percent({
							value: speed.toFixed(speed < 10 ? 1 : 0),
						}),
		},
		chapterSeconds !== null && {
			label: m.reading_chapter_left_label(),
			value: readingDuration(Math.max(60, chapterSeconds)),
		},
		data?.remainingSeconds != null && {
			label: m.reading_book_left(),
			value: readingDuration(Math.max(60, data.remainingSeconds)),
			detail: finishIn === null ? null : m.reading_in_days({ count: finishIn }),
		},
	].filter((figure) => !!figure);
	// One line on what the estimates still need, instead of a row of dashes.
	const needs = data?.remainingSeconds == null ? data?.estimateNeeds : null;
	const needsText = needs?.sessions
		? m.reading_needs_sessions({ count: needs.sessions })
		: needs?.seconds
			? m.reading_needs_minutes({ count: Math.ceil(needs.seconds / 60) })
			: null;
	return (
		<section aria-labelledby="reading-this-book" className="space-y-3">
			<h3
				id="reading-this-book"
				className="font-medium text-muted-foreground text-xs"
			>
				{m.reading_this_book()}
			</h3>
			{query.isError ? (
				<p className="text-muted-foreground text-sm">
					{m.reading_today_unavailable()}
				</p>
			) : (
				<>
					<dl className="grid grid-cols-2 gap-x-3 gap-y-3">
						{figures.map((figure) => (
							<Figure key={figure.label} {...figure} />
						))}
					</dl>
					{needsText && (
						<p className="text-muted-foreground text-xs">{needsText}</p>
					)}
				</>
			)}
			<div className="-mx-2 flex flex-wrap gap-1">
				<button
					type="button"
					onClick={onHistory}
					className="flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-xl px-2 text-sm hover:bg-foreground/[0.06] focus-visible:outline-2 focus-visible:outline-ring"
				>
					<ClockCounterClockwise aria-hidden="true" className="size-4" />
					{m.reading_view_history()}
				</button>
				<Link
					to="/dashboard/stats"
					search={{ view: "reading" }}
					className="flex min-h-10 items-center justify-center gap-1.5 rounded-xl px-3 text-sm hover:bg-foreground/[0.06] focus-visible:outline-2 focus-visible:outline-ring"
				>
					<ChartBar aria-hidden="true" className="size-4" />
					{m.reading_open_stats()}
				</Link>
			</div>
		</section>
	);
}

const IDLE_MINUTES = [2, 5, 10, 15, 30];
const DAY_START_HOURS = [0, 1, 2, 3, 4, 5, 6];
const SELECT =
	"min-h-10 w-full min-w-0 rounded-xl border bg-background px-3 text-foreground text-sm";

function Preferences({ tracker }: { tracker: ReadingTracker }) {
	const [saving, setSaving] = useState(false);
	const [failed, setFailed] = useState(false);
	const prefs = tracker.preferences;
	const change = async (
		mode: TrackingMode,
		idleMinutes: number,
		dayStartHour?: number,
	) => {
		setSaving(true);
		setFailed(false);
		try {
			await tracker.setPreferences(mode, idleMinutes, dayStartHour);
		} catch {
			setFailed(true);
		} finally {
			setSaving(false);
		}
	};
	return (
		<details className="group">
			<summary className="-my-2 flex min-h-11 cursor-pointer list-none items-center gap-2 text-muted-foreground text-sm hover:text-foreground [&::-webkit-details-marker]:hidden">
				<CaretRight
					aria-hidden="true"
					className="size-3.5 transition-transform group-open:rotate-90 motion-reduce:transition-none"
				/>
				{m.reading_preferences()}
			</summary>
			<div className="space-y-4 pt-1">
				<div className="space-y-2">
					<p className="text-xs">{m.reading_mode()}</p>
					<fieldset disabled={saving || !prefs} className="contents">
						<Segmented
							label={m.reading_mode()}
							value={prefs?.mode ?? "automatic"}
							options={[
								{ value: "automatic", label: m.reading_automatic },
								{ value: "manual", label: m.reading_manual },
								{ value: "off", label: m.reading_off },
							]}
							onChange={(mode) => void change(mode, prefs?.idleMinutes ?? 5)}
						/>
					</fieldset>
				</div>
				<div className="grid grid-cols-2 gap-3">
					<label className="grid min-w-0 grid-rows-[1fr_auto] gap-2 text-xs">
						{m.reading_idle()}
						<select
							className={SELECT}
							value={prefs?.idleMinutes ?? 5}
							disabled={saving || !prefs}
							onChange={(e) =>
								void change(prefs?.mode ?? "automatic", Number(e.target.value))
							}
						>
							{IDLE_MINUTES.map((n) => (
								<option key={n} value={n}>
									{m.reading_minutes_value({ value: n })}
								</option>
							))}
						</select>
					</label>
					<label className="grid min-w-0 grid-rows-[1fr_auto] gap-2 text-xs">
						{m.reading_day_start()}
						<select
							className={SELECT}
							value={prefs?.dayStartHour ?? 0}
							disabled={saving || !prefs}
							onChange={(e) =>
								void change(
									prefs?.mode ?? "automatic",
									prefs?.idleMinutes ?? 5,
									Number(e.target.value),
								)
							}
						>
							{DAY_START_HOURS.map((hour) => (
								<option key={hour} value={hour}>
									{hour === 0
										? m.reading_day_start_midnight()
										: new Intl.DateTimeFormat(getLocale(), {
												timeStyle: "short",
												timeZone: "UTC",
											}).format(Date.UTC(2026, 0, 1, hour))}
								</option>
							))}
						</select>
					</label>
				</div>
				<p className="text-muted-foreground text-xs leading-relaxed">
					{m.reading_day_start_hint()} {m.reading_explain()}
				</p>
				{failed && (
					<p role="alert" className="text-destructive text-xs">
						{m.reading_error()}
					</p>
				)}
			</div>
		</details>
	);
}
