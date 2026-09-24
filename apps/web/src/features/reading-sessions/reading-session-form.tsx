import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { posthog } from "@/lib/posthog";
import { m } from "@/paraglide/messages";
import { client } from "@/utils/orpc";
import type { HistoryCopy } from "./history-copy";
import type { ReadingHistoryData } from "./reading-history";
import { formatClock, parseClock } from "./reading-history-model";

function localDate(iso: string) {
	const date = new Date(iso);
	return new Date(date.getTime() - date.getTimezoneOffset() * 60000)
		.toISOString()
		.slice(0, 16);
}

export function ReadingSessionForm({
	bookUuid,
	runId,
	timeZone,
	copy,
	audioDuration,
	session,
	segments,
	onClose,
	onSaved,
	onDiscard,
}: {
	bookUuid: string;
	runId: string | null;
	timeZone: string;
	copy: HistoryCopy;
	// Audiobooks name places as player times rather than percentages.
	audioDuration?: number;
	session?: ReadingHistoryData["sessions"][number];
	segments: ReadingHistoryData["segments"];
	onClose: () => void;
	onSaved: () => void;
	// Editing an existing session also offers discarding it, so table rows keep a single action.
	onDiscard?: () => void;
}) {
	const [id] = useState(() => crypto.randomUUID());
	const [date, setDate] = useState(() =>
		localDate(
			session?.startedAt ?? new Date(Date.now() - 30 * 60000).toISOString(),
		),
	);
	const [minutes, setMinutes] = useState(() =>
		String(
			segments.length
				? Math.max(
						1,
						Math.round(segments.reduce((n, s) => n + s.seconds, 0) / 60),
					)
				: 30,
		),
	);
	const place = (position: number | null | undefined) =>
		position == null
			? ""
			: audioDuration
				? formatClock(position * audioDuration)
				: String(Math.round(position * 100));
	const [from, setFrom] = useState(() => place(segments[0]?.startPosition));
	const [to, setTo] = useState(() => place(segments.at(-1)?.endPosition));
	const position = (value: string) => {
		if (value === "") return null;
		if (!audioDuration) return Number(value) / 100;
		const seconds = parseClock(value);
		return seconds === null
			? null
			: Math.min(1, Math.max(0, seconds / audioDuration));
	};
	const mutation = useMutation({
		mutationFn: async () => {
			const start = new Date(date);
			const end = new Date(start.getTime() + Number(minutes) * 60000);
			const segment = {
				id,
				startedAt: start.toISOString(),
				endedAt: end.toISOString(),
				seconds: Number(minutes) * 60,
				startPosition: position(from),
				endPosition: position(to),
				kind: "manual" as const,
			};
			if (session)
				return client.readingSessions.correct({
					bookUuid,
					id: session.id,
					segment,
				});
			return client.readingSessions.sync({
				bookUuid,
				id,
				runId,
				startedAt: segment.startedAt,
				endedAt: segment.endedAt,
				state: "finished",
				revision: 1,
				mode: "retrospective",
				source: "manual",
				device: "",
				installationId: id,
				contentVersion: "manual",
				timeZone,
				segments: [segment],
			});
		},
		onSuccess: () => {
			posthog?.capture("reading_session_saved", {
				entry_mode: session ? "corrected" : "manual",
			});
			onSaved();
		},
	});
	const inputClass =
		"min-h-11 w-full rounded-lg border bg-background px-3 text-base text-foreground";
	return (
		<Modal
			open
			onOpenChange={(open) => {
				if (!open) onClose();
			}}
			title={session ? m.reading_edit() : m.reading_add()}
			description={m.reading_manual_hint()}
			onSubmit={(e) => {
				e.preventDefault();
				mutation.mutate();
			}}
			footer={
				<>
					{session && onDiscard && (
						<Button
							className="min-h-11 sm:mr-auto"
							type="button"
							variant="destructive"
							onClick={onDiscard}
						>
							{m.reading_discard()}
						</Button>
					)}
					<Button
						className="min-h-11"
						type="button"
						variant="outline"
						onClick={onClose}
					>
						{m.reading_cancel()}
					</Button>
					<Button
						className="min-h-11"
						type="submit"
						disabled={mutation.isPending}
					>
						{m.reading_save()}
					</Button>
				</>
			}
		>
			<label className="grid gap-2">
				{m.reading_date()}
				<input
					required
					type="datetime-local"
					className={inputClass}
					value={date}
					onChange={(e) => setDate(e.target.value)}
				/>
			</label>
			<label className="grid gap-2">
				{copy.minutes()}
				<input
					required
					type="number"
					min="1"
					max="1440"
					className={inputClass}
					value={minutes}
					onChange={(e) => setMinutes(e.target.value)}
				/>
			</label>
			<div className="grid grid-cols-2 gap-4">
				{(
					[
						[from, setFrom, audioDuration ? m.listening_from : m.reading_from],
						[to, setTo, audioDuration ? m.listening_to : m.reading_to],
					] as const
				).map(([value, setValue, label]) => (
					<label key={label()} className="grid gap-2">
						{label()}
						<input
							{...(audioDuration
								? {
										inputMode: "numeric" as const,
										placeholder: formatClock(audioDuration),
										pattern: "\\d+:\\d{1,2}(:\\d{1,2})?",
									}
								: { type: "number", min: "0", max: "100" })}
							className={inputClass}
							value={value}
							onChange={(e) => setValue(e.target.value)}
						/>
					</label>
				))}
			</div>
			{mutation.isError && (
				<p role="alert" className="text-destructive">
					{m.reading_error()}
				</p>
			)}
		</Modal>
	);
}
