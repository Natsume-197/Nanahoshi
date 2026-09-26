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
}: {
	goal: GoalStatus | null;
	goalDate: string | null;
	dayLabel: (day: string) => string;
	onEdit: () => void;
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
