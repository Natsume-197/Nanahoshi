import { Check, Pause, Timer } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { useIsMobile } from "@/hooks/use-mobile";
import { m } from "@/paraglide/messages";
import { getLocale } from "@/paraglide/runtime";
import { orpc } from "@/utils/orpc";
import { readingDuration, sessionDuration } from "./reading-duration";
import { ReadingHistory } from "./reading-history";
import { formatAmount } from "./reading-history-chart";
import {
	chapterLeft,
	displaySpeed,
	progressAmount,
	readingDay,
	readingScale,
	timeFor,
} from "./reading-history-model";
import type { TrackingMode } from "./session-clock";
import type { ReadingTracker } from "./use-reading-tracker";
export function ReadingSessionControl({
	tracker,
}: {
	tracker: ReadingTracker;
}) {
	const mobile = useIsMobile();
	const triggerRef = useRef<HTMLButtonElement>(null);
	const stateId = useId();
	const [open, setOpen] = useState(false);
	const [saving, setSaving] = useState(false);
	const [failed, setFailed] = useState(false);
	const [historyOpen, setHistoryOpen] = useState(false);
	const [discarding, setDiscarding] = useState(false);
	const [discardFailed, setDiscardFailed] = useState(false);
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
	const viewHistory = () => {
		if (tracker.state === "active") tracker.act("pause");
		setOpen(false);
		setHistoryOpen(true);
	};
	const trigger = (
		<button
			type="button"
			ref={triggerRef}
			aria-label={m.reading_session()}
			aria-describedby={stateId}
			title={stateLabel}
			className="flex h-[40px] w-[80px] shrink-0 items-center justify-center gap-1 rounded-md text-xs tabular-nums hover:bg-[var(--rh-hover)] focus-visible:outline-2 sm:w-[112px] sm:gap-2"
			data-reading-session-trigger
			onClick={() => setOpen(true)}
		>
			{tracker.state === "finished" ? (
				<Check aria-hidden="true" className="size-4 shrink-0" />
			) : tracker.state === "paused" ? (
				<Pause aria-hidden="true" className="size-4 shrink-0" />
			) : (
				<Timer aria-hidden="true" className="size-4 shrink-0" />
			)}
			<span className="truncate" aria-hidden="true">
				{disabled
					? m.reading_off_short()
					: tracker.otherTab
						? m.reading_elsewhere_short()
						: tracker.state === "paused"
							? m.reading_paused()
							: tracker.state === "active"
								? readingDuration(tracker.seconds)
								: tracker.state === "finished"
									? m.reading_done_short()
									: m.reading_ready_short()}
			</span>
			<span id={stateId} className="sr-only">
				{stateLabel}
			</span>
		</button>
	);
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
	const content = (
		<div
			data-reading-controls
			className="min-w-0 space-y-4 break-words [&_select]:min-w-0 [&_select]:max-w-full"
		>
			<div>
				<p className="text-muted-foreground text-sm">{stateLabel}</p>
				<p
					className="mt-1 font-medium text-[clamp(1rem,8vw,1.875rem)] tabular-nums"
					aria-live="off"
				>
					{sessionDuration(tracker.seconds)}
				</p>
				<dl
					className="mt-3 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-xs"
					title={m.reading_characters_hint()}
				>
					<dt className="text-muted-foreground">{m.reading_characters()}</dt>
					<dd className="font-medium tabular-nums" aria-live="off">
						{tracker.characters === null
							? m.reading_characters_unavailable()
							: `≈ ${new Intl.NumberFormat(getLocale()).format(tracker.characters)}`}
					</dd>
				</dl>
				{tracker.startPosition !== null && tracker.position !== null && (
					<p
						className="mt-2 text-muted-foreground text-sm tabular-nums"
						title={m.reading_range_hint()}
					>
						{Math.round(tracker.startPosition * 100)} % →{" "}
						{Math.round(tracker.position * 100)} %
					</p>
				)}
			</div>
			<div className="flex flex-wrap gap-2">
				{tracker.state === "active" ? (
					<Button
						className="h-auto min-h-11 max-w-full whitespace-normal py-2"
						onClick={() => tracker.act("pause")}
					>
						{m.reading_pause()}
					</Button>
				) : tracker.state === "paused" ? (
					<Button
						className="h-auto min-h-11 max-w-full whitespace-normal py-2"
						disabled={tracker.otherTab || tracker.preferences?.mode === "off"}
						onClick={() => tracker.act("resume")}
					>
						{m.reading_resume()}
					</Button>
				) : (
					<Button
						className="h-auto min-h-11 max-w-full whitespace-normal py-2"
						disabled={
							discarding ||
							tracker.otherTab ||
							!tracker.preferences ||
							tracker.preferences.mode === "off"
						}
						onClick={() => tracker.act("start")}
					>
						{m.reading_start()}
					</Button>
				)}
				{(tracker.state === "active" || tracker.state === "paused") && (
					<Button
						className="h-auto min-h-11 max-w-full whitespace-normal py-2"
						variant="outline"
						onClick={() => tracker.act("finish")}
					>
						{m.reading_finish()}
					</Button>
				)}
			</div>
			{(failed || tracker.preferencesError) && (
				<p role="alert" className="text-destructive text-sm">
					{m.reading_error()}
				</p>
			)}
			{tracker.otherTab && (
				<p className="text-muted-foreground text-sm">{m.reading_other_tab()}</p>
			)}
			{tracker.storageError ? (
				<p role="alert" className="text-destructive text-sm">
					{m.reading_storage_error()}{" "}
					<button
						type="button"
						className="underline"
						onClick={() => void tracker.retry()}
					>
						{m.reading_retry()}
					</button>
				</p>
			) : tracker.syncError ? (
				<p role="status" className="text-muted-foreground text-sm">
					{m.reading_sync_error()}{" "}
					<button
						type="button"
						className="underline"
						onClick={() => void tracker.retry()}
					>
						{m.reading_retry()}
					</button>
				</p>
			) : tracker.pending ? (
				<p role="status" className="text-muted-foreground text-sm">
					{m.reading_local_saved()}
				</p>
			) : tracker.state === "finished" && tracker.sessionId ? (
				<p role="status" className="text-muted-foreground text-sm">
					{m.reading_synced()}
				</p>
			) : null}
			{tracker.state === "finished" && tracker.sessionId && (
				<div className="space-y-2 border-t pt-4">
					<Button
						variant="ghost"
						size="sm"
						className="h-auto max-w-full whitespace-normal py-2"
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
					</Button>
					{discardFailed && (
						<p role="alert" className="text-destructive text-sm">
							{m.reading_discard_failed()}
						</p>
					)}
				</div>
			)}
			<ReadingSummary tracker={tracker} />
			<Button
				variant="outline"
				className="min-h-11 w-full whitespace-normal"
				onClick={viewHistory}
			>
				{m.reading_view_history()}
			</Button>
			<details className="space-y-3 border-t pt-4">
				<summary className="cursor-pointer py-2 font-medium text-sm">
					{m.reading_preferences()}
				</summary>
				<label className="grid gap-2 text-sm">
					{m.reading_mode()}
					<select
						className="min-h-11 w-full rounded-lg border bg-background px-3 text-foreground"
						value={tracker.preferences?.mode ?? "automatic"}
						disabled={saving || !tracker.preferences}
						onChange={(e) =>
							void change(
								e.target.value as TrackingMode,
								tracker.preferences?.idleMinutes ?? 5,
							)
						}
					>
						<option value="automatic">{m.reading_automatic()}</option>
						<option value="manual">{m.reading_manual()}</option>
						<option value="off">{m.reading_off()}</option>
					</select>
				</label>
				<label className="grid gap-2 text-sm">
					{m.reading_idle()}
					<select
						className="min-h-11 rounded-lg border bg-background px-3 text-foreground"
						value={tracker.preferences?.idleMinutes ?? 5}
						disabled={saving || !tracker.preferences}
						onChange={(e) =>
							void change(
								tracker.preferences?.mode ?? "automatic",
								Number(e.target.value),
							)
						}
					>
						{[2, 5, 10, 15, 30].map((n) => (
							<option key={n} value={n}>
								{n}
							</option>
						))}
					</select>
				</label>
				<label className="grid gap-2 text-sm">
					{m.reading_day_start()}
					<select
						className="min-h-11 rounded-lg border bg-background px-3 text-foreground"
						value={tracker.preferences?.dayStartHour ?? 0}
						disabled={saving || !tracker.preferences}
						onChange={(e) =>
							void change(
								tracker.preferences?.mode ?? "automatic",
								tracker.preferences?.idleMinutes ?? 5,
								Number(e.target.value),
							)
						}
					>
						{[0, 1, 2, 3, 4, 5, 6].map((hour) => (
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
					<span className="text-muted-foreground text-xs">
						{m.reading_day_start_hint()}
					</span>
				</label>
				<p className="text-muted-foreground text-xs leading-relaxed">
					{m.reading_explain()} {m.reading_characters_hint()}
				</p>
			</details>
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
						className="max-h-[min(80dvh,44rem)] w-80 max-w-[calc(100vw-2rem)] overflow-y-auto"
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
		</div>
	);
}

/** Today and the whole book beside the live session, plus how long the chapter still takes. */
function ReadingSummary({ tracker }: { tracker: ReadingTracker }) {
	const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
	const query = useQuery(
		orpc.readingSessions.history.queryOptions({
			input: { bookUuid: tracker.bookUuid, timeZone },
		}),
	);
	if (query.isError)
		return (
			<p className="border-t pt-4 text-muted-foreground text-sm">
				{m.reading_today_unavailable()}
			</p>
		);
	const data = query.data;
	const scale = readingScale(data?.characterCount);
	const today = data
		? data.days.find(
				(d) => d.day === readingDay(Date.now(), timeZone, data.dayStartHour),
			)
		: undefined;
	const chars = (progress: number) =>
		scale.unit === "chars"
			? m.reading_amount_chars({
					value: formatAmount(progressAmount(progress, scale), scale.unit),
				})
			: null;
	const speed = data ? displaySpeed(data.speed, scale) : null;
	const position = tracker.position ?? data?.position ?? null;
	const left =
		position === null
			? null
			: chapterLeft(tracker.chapters() ?? data?.chapters ?? [], position);
	const chapterSeconds =
		left === null ? null : timeFor(left, data?.speed ?? null);
	const rows = [
		{
			label: m.reading_today_short(),
			value: data ? readingDuration(today?.seconds ?? 0) : "…",
			detail: today ? chars(today.progress) : null,
		},
		{
			label: m.reading_whole_book(),
			value: data ? readingDuration(data.totalSeconds) : "…",
			detail:
				data && speed !== null && scale.unit === "chars"
					? m.reading_speed_chars({ value: formatAmount(speed, scale.unit) })
					: null,
		},
	];
	return (
		<div className="space-y-3 border-t pt-4 text-sm">
			<dl className="grid grid-cols-2 gap-3">
				{rows.map((row) => (
					<div key={row.label} className="min-w-0">
						<dt className="text-muted-foreground text-xs">{row.label}</dt>
						<dd className="font-medium tabular-nums">{row.value}</dd>
						{row.detail && (
							<dd className="text-muted-foreground text-xs tabular-nums">
								{row.detail}
							</dd>
						)}
					</div>
				))}
			</dl>
			{chapterSeconds !== null && chapterSeconds >= 60 && (
				<p className="text-muted-foreground tabular-nums">
					{m.reading_chapter_left({
						duration: readingDuration(chapterSeconds),
					})}
				</p>
			)}
		</div>
	);
}
