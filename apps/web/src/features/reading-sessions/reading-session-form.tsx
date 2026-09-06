import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { m } from "@/paraglide/messages";
import { client } from "@/utils/orpc";
import type { ReadingHistoryData } from "./reading-history";

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
	session,
	segments,
	onClose,
	onSaved,
}: {
	bookUuid: string;
	runId: string | null;
	timeZone: string;
	session?: ReadingHistoryData["sessions"][number];
	segments: ReadingHistoryData["segments"];
	onClose: () => void;
	onSaved: () => void;
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
	const [from, setFrom] = useState(() =>
		segments[0]?.startPosition == null
			? ""
			: String(Math.round(segments[0].startPosition * 100)),
	);
	const [to, setTo] = useState(() =>
		segments.at(-1)?.endPosition == null
			? ""
			: String(Math.round((segments.at(-1)?.endPosition ?? 0) * 100)),
	);
	const mutation = useMutation({
		mutationFn: async () => {
			const start = new Date(date);
			const end = new Date(start.getTime() + Number(minutes) * 60000);
			const segment = {
				id,
				startedAt: start.toISOString(),
				endedAt: end.toISOString(),
				seconds: Number(minutes) * 60,
				startPosition: from === "" ? null : Number(from) / 100,
				endPosition: to === "" ? null : Number(to) / 100,
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
		onSuccess: onSaved,
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
				{m.reading_minutes()}
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
				<label className="grid gap-2">
					{m.reading_from()}
					<input
						type="number"
						min="0"
						max="100"
						className={inputClass}
						value={from}
						onChange={(e) => setFrom(e.target.value)}
					/>
				</label>
				<label className="grid gap-2">
					{m.reading_to()}
					<input
						type="number"
						min="0"
						max="100"
						className={inputClass}
						value={to}
						onChange={(e) => setTo(e.target.value)}
					/>
				</label>
			</div>
			{mutation.isError && (
				<p role="alert" className="text-destructive">
					{m.reading_error()}
				</p>
			)}
		</Modal>
	);
}
