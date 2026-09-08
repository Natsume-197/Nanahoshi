import {
	ArrowCounterClockwise,
	Clock,
	DotsThreeVertical,
	PencilSimple,
	Plus,
	Trash,
} from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Modal } from "@/components/ui/modal";
import { m } from "@/paraglide/messages";
import { getLocale } from "@/paraglide/runtime";
import { client, orpc } from "@/utils/orpc";
import { readingDuration, sessionDuration } from "./reading-duration";
import { ReadingHistoryChart } from "./reading-history-chart";
import { ReadingSessionForm } from "./reading-session-form";
export type ReadingHistoryData = Awaited<
	ReturnType<typeof client.readingSessions.history>
>;
export function percentage(value: number | null) {
	return value === null ? "—" : `${Math.round(value * 100)} %`;
}
export function ReadingHistory({ bookUuid }: { bookUuid: string }) {
	return <BookReadingHistory key={bookUuid} bookUuid={bookUuid} />;
}

function BookReadingHistory({ bookUuid }: { bookUuid: string }) {
	const [runId, setRunId] = useState<string>();
	const [timeZone] = useState(
		() => Intl.DateTimeFormat().resolvedOptions().timeZone,
	);
	const [period, setPeriod] = useState("recent");
	const [view, setView] = useState<"position" | "time">("time");
	const [count, setCount] = useState(14);
	const [form, setForm] = useState<string | null>(null);
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
	if (query.isPending)
		return (
			<p role="status" className="py-12 text-muted-foreground">
				{m.reading_loading()}
			</p>
		);
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
	const current = data.runs.find((r) => r.id === data.runId);
	const selectedOrdinal =
		data.runs.length - data.runs.findIndex((r) => r.id === data.runId);
	// Calendar dates avoid UTC and daylight-saving shifts in the 30-day window.
	const cutoff = new Date();
	cutoff.setDate(cutoff.getDate() - 29);
	const recentCutoff = new Intl.DateTimeFormat("en-CA", {
		timeZone,
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	}).format(cutoff);
	const days = data.days.filter(
		(d) => period === "all" || d.day >= recentCutoff,
	);
	const ordered = [...days].reverse();
	const date = (value: string) =>
		new Intl.DateTimeFormat(getLocale(), {
			dateStyle: "medium",
			timeZone,
		}).format(new Date(value.length === 10 ? `${value}T12:00:00` : value));
	const runState = (state: string) =>
		state === "finished"
			? m.reading_run_finished()
			: state === "left"
				? m.reading_run_left()
				: m.reading_run_reading();
	const sessionToEdit = data.sessions.find((s) => s.id === form);
	return (
		<section
			aria-label={m.reading_title()}
			className="@container min-w-0 space-y-4"
		>
			<h2 className="font-medium text-xl tracking-tight">
				{m.reading_title()}
			</h2>
			<div className="min-w-0 space-y-6">
				<div className="min-w-0 space-y-4 rounded-xl border border-border/60 bg-card/30 p-4">
					<div className="flex items-center gap-3">
						<div className="relative grid size-14 shrink-0 place-items-center">
							<svg
								viewBox="0 0 56 56"
								aria-hidden="true"
								className="absolute inset-0 size-full -rotate-90"
							>
								<circle
									cx="28"
									cy="28"
									r="24"
									fill="none"
									stroke="currentColor"
									strokeWidth="2"
									className="text-border"
								/>
								<circle
									cx="28"
									cy="28"
									r="24"
									fill="none"
									stroke="currentColor"
									strokeWidth="2"
									strokeLinecap="round"
									pathLength="100"
									strokeDasharray={`${(data.position ?? 0) * 100} 100`}
									className="text-primary"
								/>
							</svg>
							<span className="font-medium text-xs tabular-nums">
								{percentage(data.position)}
							</span>
						</div>
						<div className="min-w-0">
							<p className="font-medium text-sm">
								{current ? runState(current.state) : m.reading_empty()}
							</p>
							{current && (
								<p className="mt-1 text-muted-foreground text-xs">
									{m.reading_run({ number: selectedOrdinal })}
								</p>
							)}
						</div>
					</div>
					<dl className="flex flex-wrap gap-x-8 gap-y-2 text-xs">
						{[
							{
								label: m.reading_recorded(),
								value: readingDuration(data.totalSeconds),
							},
							{ label: m.reading_sessions(), value: data.sessions.length },
						].map(({ label, value }) => (
							<div key={label} className="flex items-baseline gap-2">
								<dt className="text-muted-foreground">{label}</dt>
								<dd className="font-medium tabular-nums">{value}</dd>
							</div>
						))}
					</dl>
					<div className="flex items-center gap-2 pt-1">
						<Button onClick={() => setForm("new")}>
							<Plus aria-hidden="true" /> {m.reading_add()}
						</Button>
						<DropdownMenu>
							<DropdownMenuTrigger asChild>
								<Button
									size="icon"
									variant="ghost"
									disabled={mutation.isPending}
									aria-label={m.reading_actions()}
								>
									<DotsThreeVertical aria-hidden="true" />
								</Button>
							</DropdownMenuTrigger>
							<DropdownMenuContent align="start">
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
											setConfirm({
												type: "reread",
												id: crypto.randomUUID(),
											})
										}
									>
										<ArrowCounterClockwise aria-hidden="true" />
										{m.reading_reread()}
									</DropdownMenuItem>
								)}
							</DropdownMenuContent>
						</DropdownMenu>
					</div>
				</div>
				{data.runs.length > 0 && (
					<details className="border-border/60 border-y py-2">
						<summary className="cursor-pointer py-2 font-medium text-sm">
							{m.reading_previous()}
						</summary>
						<div className="max-h-64 divide-y divide-border/40 overflow-y-auto">
							{data.runs.map((run, i) => (
								<div
									key={run.id}
									className="flex min-h-14 items-center gap-2 py-1"
								>
									<button
										type="button"
										aria-pressed={run.id === data.runId}
										className={`flex min-h-12 min-w-0 flex-1 items-center justify-between gap-3 rounded-lg px-3 text-start text-sm ${run.id === data.runId ? "bg-muted" : "hover:bg-muted/50"}`}
										onClick={() => {
											setRunId(run.id);
											setCount(14);
										}}
									>
										<span>
											{m.reading_run({ number: data.runs.length - i })} ·{" "}
											{runState(run.state)}
										</span>
										<span className="shrink-0 text-muted-foreground">
											{date(run.startedAt)}
										</span>
									</button>
									<Button
										size="icon"
										variant="ghost"
										className="size-10 shrink-0 text-muted-foreground hover:text-destructive"
										aria-label={`${m.reading_delete_run()} ${data.runs.length - i}`}
										onClick={() =>
											setConfirm({ type: "discardRun", id: run.id })
										}
									>
										<Trash aria-hidden="true" />
									</Button>
								</div>
							))}
						</div>
					</details>
				)}
				<div className="min-w-0 overflow-hidden rounded-xl border border-border/60 bg-card/30">
					<div className="flex flex-wrap items-center justify-between gap-3 p-4">
						<h3 className="font-medium text-sm">{m.reading_sessions()}</h3>
						<label className="min-w-0 max-w-full text-xs">
							<span className="sr-only">{m.reading_period()}</span>
							<select
								className="min-h-10 max-w-full rounded-md border border-border/60 bg-background px-3"
								value={period}
								onChange={(e) => {
									setPeriod(e.target.value);
									setCount(14);
								}}
							>
								<option value="recent">{m.reading_recent()}</option>
								<option value="all">{m.reading_all()}</option>
							</select>
						</label>
					</div>
					{days.length ? (
						<>
							<section
								aria-label={m.reading_sessions()}
								// biome-ignore lint/a11y/noNoninteractiveTabindex: Keyboard users need to scroll the table.
								tabIndex={0}
								className="max-h-[25rem] overflow-auto border-border/60 border-y focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-[-2px]"
							>
								<table className="w-full whitespace-nowrap text-left text-xs tabular-nums">
									<caption className="sr-only">
										{m.reading_zone({ zone: timeZone })}
									</caption>
									<thead className="sticky top-0 z-10 bg-card text-muted-foreground">
										<tr>
											{[
												m.reading_day(),
												m.reading_time(),
												m.reading_length(),
												m.reading_change(),
												m.reading_position(),
												m.reading_observed(),
												m.reading_source(),
												m.reading_edit(),
											].map((label) => (
												<th
													key={label}
													scope="col"
													className="border-border/60 border-b px-3 py-3 font-medium"
												>
													{label}
												</th>
											))}
										</tr>
									</thead>
									{ordered.slice(0, count).map((day) => (
										<tbody
											key={day.day}
											className="border-border/50 border-b last:border-0"
										>
											{[...day.sessions].reverse().map((row, index) => {
												const session = data.sessions.find(
													(session) => session.id === row.id,
												);
												if (!session) return null;
												const change =
													row.startPosition === null || row.endPosition === null
														? null
														: row.endPosition - row.startPosition;
												return (
													<tr
														key={row.id}
														className="border-border/30 border-b transition-colors last:border-0 focus-within:bg-muted/40 hover:bg-muted/40"
													>
														{index === 0 && (
															<th
																scope="rowgroup"
																rowSpan={day.sessions.length}
																className="px-3 py-3 align-top font-medium"
																title={readingDuration(day.seconds)}
															>
																{date(day.day)}
															</th>
														)}
														<td className="px-3 py-2 text-muted-foreground">
															<time dateTime={row.startedAt}>
																{new Intl.DateTimeFormat(getLocale(), {
																	timeStyle: "short",
																	timeZone,
																}).format(new Date(row.startedAt))}
															</time>
														</td>
														<td className="px-3 py-2 font-medium">
															{sessionDuration(row.seconds)}
														</td>
														<td
															className="px-3 py-2 font-medium"
															title={m.reading_range_hint()}
														>
															{change === null
																? "—"
																: `${change > 0 ? "+" : ""}${Math.round(change * 100)} %`}
														</td>
														<td className="w-full min-w-40 px-3 py-2">
															{row.startPosition === null ||
															row.endPosition === null ? (
																<span
																	className="text-muted-foreground"
																	title={m.reading_unknown()}
																>
																	—
																</span>
															) : (
																<div
																	role="img"
																	aria-label={`${m.reading_position()}: ${percentage(row.startPosition)} → ${percentage(row.endPosition)}`}
																	title={`${percentage(row.startPosition)} → ${percentage(row.endPosition)}`}
																	className="relative h-1.5 w-full min-w-32 overflow-hidden rounded-full bg-muted/60 ring-1 ring-border/60 ring-inset"
																>
																	<span
																		className={`absolute inset-y-0 min-w-0.5 rounded-full ${change !== null && change < 0 ? "bg-amber-500" : "bg-primary"}`}
																		style={{
																			left: `min(${Math.min(row.startPosition, row.endPosition) * 100}%, calc(100% - 2px))`,
																			width: `${Math.abs(row.endPosition - row.startPosition) * 100}%`,
																		}}
																	/>
																</div>
															)}
														</td>
														<td className="px-3 py-2 text-muted-foreground">
															{percentage(row.endPosition)}
														</td>
														<td className="px-3 py-2">
															<span className="rounded border border-border/60 px-1.5 py-0.5 text-muted-foreground">
																{session.mode === "retrospective"
																	? m.reading_declared()
																	: session.device || session.source}
															</span>
														</td>
														<td className="px-2 py-1">
															<div className="flex gap-1">
																<Button
																	size="icon"
																	variant="ghost"
																	className="size-9 text-muted-foreground"
																	aria-label={m.reading_edit()}
																	onClick={() => setForm(row.id)}
																>
																	<PencilSimple aria-hidden="true" />
																</Button>
																<Button
																	size="icon"
																	variant="ghost"
																	className="size-9 text-muted-foreground hover:text-destructive"
																	aria-label={m.reading_discard()}
																	onClick={() =>
																		setConfirm({ type: "discard", id: row.id })
																	}
																>
																	<Trash aria-hidden="true" />
																</Button>
															</div>
														</td>
													</tr>
												);
											})}
										</tbody>
									))}
								</table>
							</section>
							<div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-muted-foreground text-xs">
								<span>{m.reading_zone({ zone: timeZone })}</span>
								{ordered.length > count && (
									<Button
										variant="outline"
										size="sm"
										onClick={() => setCount((n) => n + 14)}
									>
										{m.reading_more()}
									</Button>
								)}
							</div>
						</>
					) : (
						<div
							className="space-y-3 border-border/60 border-t px-4 py-10 text-center"
							role="status"
						>
							<Clock
								aria-hidden="true"
								className="mx-auto size-6 text-muted-foreground"
							/>
							<p className="text-muted-foreground text-sm">
								{data.sessions.length
									? m.reading_period_empty()
									: m.reading_empty_body()}
							</p>
							{data.sessions.length > 0 && (
								<Button
									className="h-auto min-h-10 max-w-full whitespace-normal py-2"
									variant="outline"
									onClick={() => {
										setPeriod("all");
										setCount(14);
									}}
								>
									{m.reading_all()}
								</Button>
							)}
						</div>
					)}
				</div>
			</div>
			{days.length > 0 && (
				<div className="min-w-0 space-y-4 rounded-xl border border-border/60 bg-card/30 p-4">
					<div className="flex flex-wrap items-center justify-between gap-3">
						<h3 className="font-medium text-sm">{m.reading_evolution()}</h3>
						<fieldset
							aria-label={m.reading_evolution()}
							className="flex max-w-full flex-wrap gap-1 rounded-md border border-border/60 p-1"
						>
							{(["position", "time"] as const).map((v) => (
								<button
									type="button"
									key={v}
									aria-pressed={view === v}
									onClick={() => setView(v)}
									className={`min-h-9 rounded px-3 text-xs focus-visible:outline-2 focus-visible:outline-ring ${view === v ? "bg-muted font-medium" : "text-muted-foreground"}`}
								>
									{v === "position" ? m.reading_position() : m.reading_time()}
								</button>
							))}
						</fieldset>
					</div>
					<ReadingHistoryChart days={days} view={view} />
				</div>
			)}
			{data.legacySeconds > 0 && (
				<p className="text-muted-foreground text-xs">
					{m.reading_legacy({ time: readingDuration(data.legacySeconds) })}
				</p>
			)}
			{data.overlapSeconds > 0 && (
				<p className="text-muted-foreground text-xs">{m.reading_overlap()}</p>
			)}

			{mutation.isError && (
				<p role="alert" className="text-destructive text-sm">
					{m.reading_error()}
				</p>
			)}
			{form && (
				<ReadingSessionForm
					bookUuid={bookUuid}
					runId={data.runId}
					timeZone={timeZone}
					session={sessionToEdit}
					segments={data.segments.filter((s) => s.sessionId === form)}
					onClose={() => setForm(null)}
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
