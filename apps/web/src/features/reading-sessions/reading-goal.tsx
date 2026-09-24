import { BookOpen, Flag, Headphones, Plus } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import { usePlayAudiobook } from "@/components/audio-player/use-play-audiobook";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { m } from "@/paraglide/messages";
import { type HistoryCopy, historyCopy, type Medium } from "./history-copy";
import type { GoalStatus } from "./reading-history-model";

const PACE_SESSIONS = 3;

/** The reader's own finish-by date: what it asks of today and whether they keep up. */
export function GoalPanel({
	goal,
	goalDate,
	dayLabel,
	onEdit,
	timeline,
}: {
	goal: GoalStatus | null;
	goalDate: string | null;
	dayLabel: (day: string) => string;
	onEdit: () => void;
	timeline?: {
		today: number;
		goal: number;
		finish: number | null;
		late: boolean | null;
		finishLabel: string | null;
	} | null;
}) {
	if (!goalDate || !goal)
		return (
			<Button variant="secondary" size="sm" onClick={onEdit}>
				<Flag aria-hidden="true" /> {m.reading_goal_set()}
			</Button>
		);
	if (goal.kind === "overdue")
		return (
			<div className="flex flex-wrap items-center justify-between gap-2 text-sm">
				<p className="flex items-center gap-2 text-muted-foreground">
					<Flag aria-hidden="true" />
					{m.reading_goal_overdue({ date: dayLabel(goalDate) })}
				</p>
				<Button variant="secondary" size="sm" onClick={onEdit}>
					{m.reading_goal_change()}
				</Button>
			</div>
		);
	if (goal.kind !== "active") return null;
	return (
		<div className="space-y-3">
			<div className="flex flex-wrap items-center justify-between gap-2">
				<button
					type="button"
					onClick={onEdit}
					aria-label={m.reading_goal_title()}
					className="flex cursor-pointer items-center gap-2 rounded-lg font-medium text-sm hover:opacity-80 focus-visible:outline-2 focus-visible:outline-ring"
				>
					<Flag aria-hidden="true" weight="fill" className="text-primary" />
					<span className="first-letter:uppercase">
						{m.reading_goal_summary({ date: dayLabel(goalDate) })}
					</span>
					<span className="font-normal text-muted-foreground">
						· {m.reading_goal_days_left({ count: goal.daysLeft })}
					</span>
				</button>
				{goal.lateBy !== null && (
					<span
						className={cn(
							"rounded-full px-2 py-0.5 font-medium text-xs",
							goal.lateBy === 0
								? "bg-primary/15 text-primary"
								: "bg-destructive/15 text-destructive",
						)}
					>
						{goal.lateBy === 0
							? m.reading_goal_on_track()
							: m.reading_goal_late_short({ count: goal.lateBy })}
					</span>
				)}
			</div>
			{timeline && (
				<GoalTimeline {...timeline} goalLabel={dayLabel(goalDate)} />
			)}
		</div>
	);
}

// Keeps a label inside the track: left-aligned at 0 %, centred mid-way, right-aligned at 100 %.
const pin = (at: number) => ({
	left: `${at * 100}%`,
	transform: `translateX(-${at * 100}%)`,
});

/** Today, the estimated finish and the goal on one date axis: ahead or behind at a glance. */
function GoalTimeline({
	today,
	goal,
	finish,
	late,
	finishLabel,
	goalLabel,
}: {
	today: number;
	goal: number;
	finish: number | null;
	late: boolean | null;
	finishLabel: string | null;
	goalLabel: string;
}) {
	return (
		<div aria-hidden="true" className="text-[11px] tabular-nums">
			<div className="relative h-4">
				<span
					className="absolute bottom-0 flex items-center gap-1 whitespace-nowrap font-medium text-primary first-letter:uppercase"
					style={pin(goal)}
				>
					<Flag weight="fill" className="size-3" />
					{goalLabel}
				</span>
			</div>
			<div className="relative mt-1 h-1.5 rounded-full bg-foreground/[0.08]">
				<span
					className="absolute inset-y-0 left-0 rounded-full bg-primary/50"
					style={{ width: `${today * 100}%` }}
				/>
				{finish !== null && (
					<span
						className="absolute inset-y-0 bg-primary/20"
						style={{
							left: `${today * 100}%`,
							width: `${Math.max(0, Math.min(finish, goal) - today) * 100}%`,
						}}
					/>
				)}
				{finish !== null && late && (
					<span
						className="absolute inset-y-0 rounded-r-full bg-destructive/50"
						style={{
							left: `${goal * 100}%`,
							width: `${(finish - goal) * 100}%`,
						}}
					/>
				)}
				<span
					className="absolute top-1/2 h-3 w-0.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary"
					style={{ left: `${goal * 100}%` }}
				/>
				{finish !== null && (
					<span
						className={cn(
							"absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 bg-background",
							late ? "border-destructive" : "border-primary",
						)}
						style={{ left: `${finish * 100}%` }}
					/>
				)}
				<span
					className="absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary ring-2 ring-background"
					style={{ left: `${today * 100}%` }}
				/>
			</div>
			<div className="relative mt-1.5 h-4 text-muted-foreground">
				<span className="absolute whitespace-nowrap" style={pin(today)}>
					{m.reading_goal_timeline_today()}
				</span>
				{finish !== null && finishLabel && (
					<span
						className={cn(
							"absolute whitespace-nowrap",
							late ? "text-destructive" : "text-foreground",
						)}
						style={pin(finish)}
					>
						{finishLabel}
					</span>
				)}
			</div>
		</div>
	);
}

/** One welcoming block instead of a page of empty cards and dashes. */
export function EmptyHistory({
	bookUuid,
	medium,
	onAddSession,
}: {
	bookUuid: string;
	medium: Medium;
	onAddSession: () => void;
}) {
	const copy = historyCopy(medium);
	const Icon = medium === "listening" ? Headphones : BookOpen;
	return (
		<div
			role="status"
			className="flex flex-col items-center gap-5 rounded-3xl bg-muted/30 px-6 py-14 text-center"
		>
			<span className="grid size-14 place-items-center rounded-full bg-primary/15 text-primary">
				<Icon aria-hidden="true" className="size-7" />
			</span>
			<div className="max-w-md space-y-2">
				<p className="font-medium text-xl tracking-tight">
					{copy.emptyTitle()}
				</p>
				<p className="text-muted-foreground text-sm">{copy.emptyHint()}</p>
			</div>
			<div className="flex flex-wrap justify-center gap-2">
				{medium === "listening" ? (
					<ListenButton bookUuid={bookUuid} copy={copy} />
				) : (
					<Button asChild size="lg">
						<Link to="/reader/$uuid" params={{ uuid: bookUuid }}>
							<BookOpen aria-hidden="true" weight="bold" />
							{copy.emptyStart()}
						</Link>
					</Button>
				)}
				<Button variant="secondary" size="lg" onClick={onAddSession}>
					<Plus aria-hidden="true" />
					{m.reading_empty_manual()}
				</Button>
			</div>
		</div>
	);
}

function ListenButton({
	bookUuid,
	copy,
}: {
	bookUuid: string;
	copy: HistoryCopy;
}) {
	const play = usePlayAudiobook();
	return (
		<Button size="lg" onClick={() => void play(bookUuid)}>
			<Headphones aria-hidden="true" weight="bold" />
			{copy.emptyStart()}
		</Button>
	);
}

/** Shows how close the speed chart is, so each early session visibly moves something. */
export function PaceUnlock({ measured }: { measured: number }) {
	return (
		<div className="flex flex-wrap items-center gap-x-4 gap-y-2 py-4">
			<span aria-hidden="true" className="flex gap-1.5">
				{Array.from({ length: PACE_SESSIONS }, (_, i) => (
					<span
						// biome-ignore lint/suspicious/noArrayIndexKey: fixed-length decorative dots
						key={i}
						className={cn(
							"size-2.5 rounded-full",
							i < measured ? "bg-primary" : "bg-foreground/15",
						)}
					/>
				))}
			</span>
			<p className="text-muted-foreground text-sm">
				{m.reading_pace_unlock({ count: measured, total: PACE_SESSIONS })}
			</p>
		</div>
	);
}
