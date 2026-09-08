import {
	ArrowCounterClockwise,
	CaretDown,
	Clock,
	DotsThreeVertical,
	PencilSimple,
	Plus,
	Trash,
} from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useId, useState } from "react";
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
	const historyId = useId();
	const [runId, setRunId] = useState<string>();
	const [timeZone] = useState(
		() => Intl.DateTimeFormat().resolvedOptions().timeZone,
	);
	const [period, setPeriod] = useState("recent");
	const [view, setView] = useState<"position" | "time">("time");
	const [count, setCount] = useState(14);
	const [selectedDay, setSelectedDay] = useState<string>();
	const [expandedDay, setExpandedDay] = useState<string>();
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
	const today = new Intl.DateTimeFormat("en-CA", { timeZone }).format(
		new Date(),
	);
	const sessionById = new Map(
		data.sessions.map((session) => [session.id, session]),
	);
	const selectDay = (day: string) => {
		setSelectedDay(day);
		setExpandedDay(day);
		setCount((count) =>
			Math.max(count, ordered.findIndex((d) => d.day === day) + 1),
		);
	};
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
	const dayLabel = (day: string) => {
		const age = Math.round((Date.parse(today) - Date.parse(day)) / 86400_000);
		if (age === 0 || age === 1)
			return new Intl.RelativeTimeFormat(getLocale(), {
				numeric: "auto",
			}).format(-age, "day");
		if (age > 1 && age < 7)
			return new Intl.DateTimeFormat(getLocale(), {
				weekday: "long",
				timeZone: "UTC",
			}).format(new Date(`${day}T12:00:00Z`));
		return date(day);
	};
	const latestActivity = data.days.at(-1)?.day;
	const sessionToEdit = data.sessions.find((s) => s.id === form);
	return (
		<section
			aria-label={m.reading_title()}
			className="@container min-w-0 space-y-5"
		>
			<header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
				<h2 className="font-medium text-xl tracking-tight">
					{m.reading_title()}
				</h2>
				<div className="flex flex-wrap items-center gap-1">
					<Button
						variant="ghost"
						className="h-auto min-h-11 max-w-full whitespace-normal py-2"
						onClick={() => setForm("new")}
					>
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
			</header>
			<div className="min-w-0 space-y-8">
				<div className="min-w-0 space-y-5 border-border/40 border-b px-1 pb-6">
					<div className="grid @2xl:grid-cols-2 items-center gap-x-8 gap-y-5">
						<div className="flex flex-wrap items-center gap-x-6 gap-y-3">
							<p className="font-medium text-5xl text-primary tabular-nums tracking-tighter">
								<span className="sr-only">{m.reading_position()}: </span>
								{percentage(data.position)}
							</p>
							<div className="min-w-[min(100%,14rem)] max-w-full flex-1 space-y-1">
								<p className="font-medium text-lg tracking-tight">
									{current ? runState(current.state) : m.reading_empty()}
								</p>
								{current && (
									<div className="flex min-w-0 max-w-sm items-center gap-1">
										<label className="min-w-0 flex-1 text-muted-foreground text-xs">
											<span className="sr-only">{m.reading_previous()}</span>
											<select
												aria-label={m.reading_previous()}
												value={data.runId ?? ""}
												className="min-h-10 w-full max-w-full cursor-pointer rounded-md bg-background py-1 pr-3 outline-offset-2 focus-visible:outline-2 focus-visible:outline-ring"
												onChange={(event) => {
													setRunId(event.target.value);
													setSelectedDay(undefined);
													setExpandedDay(undefined);
													setCount(14);
												}}
											>
												{data.runs.map((run, i) => (
													<option key={run.id} value={run.id}>
														{m.reading_run({ number: data.runs.length - i })} ·{" "}
														{runState(run.state)} · {date(run.startedAt)}
													</option>
												))}
											</select>
										</label>
										<Button
											size="icon"
											variant="ghost"
											className="size-10 shrink-0 text-muted-foreground hover:text-destructive"
											aria-label={`${m.reading_delete_run()} ${selectedOrdinal}`}
											onClick={() =>
												setConfirm({ type: "discardRun", id: current.id })
											}
										>
											<Trash aria-hidden="true" />
										</Button>
									</div>
								)}
							</div>
						</div>
						<div className="min-w-0 self-center">
							<p className="sr-only">{m.reading_total_run()}</p>
							<dl className="grid @sm:grid-cols-2 gap-5">
								<div className="min-w-0 space-y-1">
									<dt className="text-muted-foreground text-xs">
										{m.reading_recorded()}
									</dt>
									<dd className="font-medium text-2xl tabular-nums tracking-tight">
										{readingDuration(data.totalSeconds)}
									</dd>
								</div>
								<div className="min-w-0 space-y-1">
									<dt className="text-muted-foreground text-xs">
										{m.reading_remaining()}
									</dt>
									<dd
										className={
											data.remainingSeconds === null
												? "text-muted-foreground text-sm"
												: "font-medium text-2xl tabular-nums tracking-tight"
										}
									>
										{data.remainingSeconds === null
											? m.reading_insufficient()
											: readingDuration(data.remainingSeconds)}
									</dd>
								</div>
							</dl>
						</div>
					</div>
					<dl className="flex flex-wrap gap-x-5 gap-y-2 text-muted-foreground text-xs">
						<div className="flex flex-wrap gap-2">
							<dt>{m.reading_days()}</dt>
							<dd className="tabular-nums">{data.days.length}</dd>
						</div>
						<div className="flex flex-wrap gap-2">
							<dt>{m.reading_last_activity()}</dt>
							<dd>{latestActivity ? date(latestActivity) : "—"}</dd>
						</div>
					</dl>
				</div>
				<div className="min-w-0 space-y-5 rounded-2xl bg-muted/25 @sm:p-6 p-4">
					<div className="flex flex-wrap items-center justify-between gap-3">
						<h3 className="font-medium text-sm">{m.reading_evolution()}</h3>

						<label className="min-w-0 max-w-full text-xs">
							<span className="mr-2 text-muted-foreground">
								{m.reading_period()}
							</span>
							<select
								className="min-h-10 max-w-full rounded-md border border-border/60 bg-background px-3"
								value={period}
								onChange={(e) => {
									setPeriod(e.target.value);
									setSelectedDay(undefined);
									setExpandedDay(undefined);
									setCount(14);
								}}
							>
								<option value="recent">{m.reading_recent()}</option>
								<option value="all">{m.reading_all()}</option>
							</select>
						</label>
						<fieldset
							aria-label={m.reading_evolution()}
							className="flex max-w-full flex-wrap gap-1 rounded-lg bg-background/60 p-1"
						>
							{(["position", "time"] as const).map((v) => (
								<button
									type="button"
									key={v}
									aria-pressed={view === v}
									onClick={() => setView(v)}
									className={`min-h-9 rounded px-3 text-xs focus-visible:outline-2 focus-visible:outline-ring ${view === v ? "bg-primary/10 font-medium text-primary" : "text-muted-foreground hover:text-foreground"}`}
								>
									{v === "position" ? m.reading_position() : m.reading_time()}
								</button>
							))}
						</fieldset>
					</div>
					{days.length > 0 && (
						<ReadingHistoryChart
							key={`${data.runId}:${period}`}
							days={days}
							view={view}
							selectedDay={selectedDay}
							onSelectDay={selectDay}
						/>
					)}
					{selectedDay && days.some((day) => day.day === selectedDay) && (
						<Button
							variant="ghost"
							size="sm"
							onClick={() => {
								const summary = document.getElementById(
									`${historyId}-day-${selectedDay}`,
								);
								summary?.scrollIntoView({
									block: "nearest",
									behavior: "instant",
								});
								summary?.focus({ preventScroll: true });
							}}
						>
							{m.reading_view_day()}
						</Button>
					)}
				</div>
				<div className="min-w-0">
					<div className="flex flex-wrap items-center justify-between gap-3 p-4">
						<h3 className="font-medium text-sm">{m.reading_diary()}</h3>
					</div>
					{days.length ? (
						<>
							<div className="divide-y divide-border/35" data-reading-diary>
								{ordered.slice(0, count).map((day) => (
									<div
										key={day.day}
										className={`rounded-xl transition-colors duration-150 motion-reduce:transition-none ${selectedDay === day.day ? "bg-primary/5" : ""}`}
									>
										<button
											type="button"
											id={`${historyId}-day-${day.day}`}
											className="flex min-h-16 w-full cursor-pointer items-center gap-3 rounded-xl px-4 py-5 text-start transition-colors duration-150 hover:bg-muted/35 focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-[-2px] motion-reduce:transition-none"
											onClick={() => {
												setSelectedDay(day.day);
												setExpandedDay(
													expandedDay === day.day ? undefined : day.day,
												);
											}}
											aria-expanded={expandedDay === day.day}
											aria-controls={`${historyId}-sessions-${day.day}`}
										>
											<div className="min-w-0 flex-1 space-y-1">
												<div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 font-medium text-base">
													<time
														className="capitalize"
														dateTime={day.day}
														title={date(day.day)}
													>
														{dayLabel(day.day)}
													</time>
													<span className="text-lg tabular-nums tracking-tight">
														{readingDuration(day.seconds)}
													</span>
												</div>
												<p className="flex flex-wrap gap-x-3 gap-y-1 text-muted-foreground text-xs">
													<span>
														{day.sessions[0]?.startPosition == null ||
														day.endPosition === null
															? m.reading_unknown()
															: `${percentage(day.sessions[0]?.startPosition ?? null)} → ${percentage(day.endPosition)}`}
													</span>
													<span>
														{day.sessions.length === 1
															? m.reading_one_session()
															: m.reading_session_count({
																	count: day.sessions.length,
																})}
													</span>
												</p>
											</div>
											<CaretDown
												aria-hidden="true"
												className={`size-4 shrink-0 text-muted-foreground transition-transform motion-reduce:transition-none ${expandedDay === day.day ? "rotate-180" : ""}`}
											/>
										</button>
										<ul
											hidden={expandedDay !== day.day}
											id={`${historyId}-sessions-${day.day}`}
											className="motion-safe:fade-in motion-safe:slide-in-from-top-1 relative mx-4 mb-4 @sm:ml-7 space-y-1 border-primary/20 border-l @sm:pl-5 pl-3 motion-safe:animate-in motion-safe:duration-200"
										>
											{[...day.sessions].reverse().map((row) => {
												const session = sessionById.get(row.id);
												if (!session) return null;
												return (
													<li
														key={row.id}
														className="relative rounded-lg px-3 py-3 before:absolute before:top-5 @sm:before:-left-[25px] before:-left-[17px] before:size-2 before:rounded-full before:bg-primary/35"
														data-reading-session={row.id}
													>
														<div className="flex flex-wrap items-start justify-between gap-2">
															<div className="min-w-0 space-y-1 text-sm">
																<p className="flex flex-wrap gap-x-3 gap-y-1">
																	<time
																		dateTime={row.startedAt}
																		className="text-muted-foreground"
																	>
																		{new Intl.DateTimeFormat(getLocale(), {
																			timeStyle: "short",
																			timeZone,
																		}).format(new Date(row.startedAt))}
																	</time>
																	<span className="font-medium tabular-nums">
																		{sessionDuration(row.seconds)}
																	</span>
																</p>
																<p className="text-muted-foreground text-xs">
																	{row.startPosition === null ||
																	row.endPosition === null
																		? m.reading_unknown()
																		: `${percentage(row.startPosition)} → ${percentage(row.endPosition)}`}
																</p>
															</div>
															<div className="flex gap-1">
																<Button
																	size="icon"
																	variant="ghost"
																	className="size-11 text-muted-foreground"
																	aria-label={m.reading_edit()}
																	onClick={() => setForm(row.id)}
																>
																	<PencilSimple aria-hidden="true" />
																</Button>
																<Button
																	size="icon"
																	variant="ghost"
																	className="size-11 text-muted-foreground hover:text-destructive"
																	aria-label={m.reading_discard()}
																	onClick={() =>
																		setConfirm({ type: "discard", id: row.id })
																	}
																>
																	<Trash aria-hidden="true" />
																</Button>
															</div>
														</div>
														<p className="mt-2 break-words text-muted-foreground text-xs">
															{session.mode === "retrospective"
																? m.reading_declared()
																: session.device || session.source}
														</p>
													</li>
												);
											})}
										</ul>
									</div>
								))}
							</div>
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
