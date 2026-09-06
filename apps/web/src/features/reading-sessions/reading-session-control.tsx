import { Pause, Timer } from "@phosphor-icons/react";
import { useState } from "react";
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
import { sessionDuration } from "./reading-duration";
import type { TrackingMode } from "./session-clock";
import type { ReadingTracker } from "./use-reading-tracker";
export function ReadingSessionControl({
	tracker,
}: {
	tracker: ReadingTracker;
}) {
	const mobile = useIsMobile();
	const [open, setOpen] = useState(false);
	const [saving, setSaving] = useState(false);
	const [failed, setFailed] = useState(false);
	const trigger = (
		<button
			type="button"
			aria-label={m.reading_session()}
			className="flex size-10 shrink-0 items-center justify-center rounded-md text-sm hover:bg-[var(--rh-hover)] focus-visible:outline-2"
			onClick={() => setOpen(true)}
		>
			{tracker.state === "paused" ? (
				<Pause aria-hidden="true" className="size-5" />
			) : (
				<Timer aria-hidden="true" className="size-5" />
			)}
		</button>
	);
	const change = async (mode: TrackingMode, idleMinutes: number) => {
		setSaving(true);
		setFailed(false);
		try {
			await tracker.setPreferences(mode, idleMinutes);
		} catch {
			setFailed(true);
		} finally {
			setSaving(false);
		}
	};
	const content = (
		<div data-reading-controls className="space-y-5">
			<div>
				<p className="text-muted-foreground text-sm">
					{tracker.state === "active"
						? m.reading_active()
						: tracker.state === "paused"
							? m.reading_paused()
							: tracker.state === "finished"
								? m.reading_finished()
								: m.reading_session()}
				</p>
				<p className="mt-1 font-medium text-3xl tabular-nums" aria-live="off">
					{sessionDuration(tracker.seconds)}
				</p>
				<dl className="mt-4 text-sm">
					<dt className="text-muted-foreground">{m.reading_characters()}</dt>
					<dd className="mt-1 font-medium text-xl tabular-nums" aria-live="off">
						{tracker.characters === null
							? m.reading_characters_unavailable()
							: new Intl.NumberFormat(getLocale()).format(tracker.characters)}
					</dd>
				</dl>
				{tracker.startPosition !== null && tracker.position !== null && (
					<p className="mt-2 text-muted-foreground text-sm tabular-nums">
						{Math.round(tracker.startPosition * 100)} % →{" "}
						{Math.round(tracker.position * 100)} %
					</p>
				)}
			</div>
			<div className="flex flex-wrap gap-2">
				{tracker.state === "active" ? (
					<Button className="min-h-11" onClick={() => tracker.act("pause")}>
						{m.reading_pause()}
					</Button>
				) : tracker.state === "paused" ? (
					<Button
						className="min-h-11"
						disabled={tracker.otherTab || tracker.preferences?.mode === "off"}
						onClick={() => tracker.act("resume")}
					>
						{m.reading_resume()}
					</Button>
				) : (
					<Button
						className="min-h-11"
						disabled={
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
						className="min-h-11"
						variant="outline"
						onClick={() => tracker.act("finish")}
					>
						{m.reading_finish()}
					</Button>
				)}
			</div>
			{(failed || tracker.error || tracker.preferencesError) && (
				<p role="alert" className="text-destructive text-sm">
					{m.reading_error()}
				</p>
			)}
			{tracker.otherTab && (
				<p className="text-muted-foreground text-sm">{m.reading_other_tab()}</p>
			)}
			{tracker.pending && (
				<p role="status" className="text-muted-foreground text-sm">
					{m.reading_pending()}{" "}
					<button
						type="button"
						className="underline"
						onClick={() => void tracker.retry()}
					>
						{m.reading_retry()}
					</button>
				</p>
			)}
			<div className="space-y-3 border-t pt-4">
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
				<p className="text-muted-foreground text-xs leading-relaxed">
					{m.reading_explain()}
				</p>
			</div>
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
						className="top-auto bottom-0 max-h-[85dvh] translate-y-0 rounded-b-none pb-[max(1.5rem,env(safe-area-inset-bottom))]"
					>
						{content}
					</Modal>
				</>
			) : (
				<Popover open={open} onOpenChange={setOpen}>
					<PopoverTrigger asChild>{trigger}</PopoverTrigger>
					<PopoverContent align="end" className="w-80 max-w-[calc(100vw-2rem)]">
						{content}
					</PopoverContent>
				</Popover>
			)}
		</div>
	);
}
