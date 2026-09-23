import {
	ArrowClockwise,
	ArrowSquareOut,
	CaretLeft,
	CaretRight,
	CheckCircle,
	Lock,
	PencilSimple,
	Warning,
	X,
	XCircle,
} from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { m } from "@/paraglide/messages";
import {
	COVER_EDGE,
	coverPresets,
	getCoverFilename,
	getCoverUrl,
} from "@/utils/covers";
import { formatDate } from "@/utils/format";
import { orpc } from "@/utils/orpc";
import { resolveAmbiguousCandidates } from "./ambiguous-decision";
import type { EnrichmentLifecycle as Lifecycle } from "./filters";
import {
	failureLabel,
	LifecycleChip,
	MatchReasonChip,
	minutesFromMs,
	providerRecordUrl,
	sourceLabel,
} from "./lifecycle";
import { resolveRetryView } from "./retry-view";
import type { MatchRow, RowActions } from "./types";

// Field keys come from the metadata manifest (snake_case); the pane is the only
// place they're shown to a human, so it does the humanising.
function humanizeField(field: string): string {
	const spaced = field.replace(/[_.]/g, " ");
	return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function SectionTitle({ children }: { children: React.ReactNode }) {
	return (
		<h4 className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
			{children}
		</h4>
	);
}

/**
 * Actions for one book, in the pane rather than a dropdown: with the row open
 * there's room to show what can be done and label it, instead of hiding every
 * verb behind a kebab.
 */
function DetailActions({
	lifecycle,
	busy,
	actions,
	hasCandidates,
}: {
	lifecycle: Lifecycle;
	busy: boolean;
	actions: RowActions;
	/** Candidates are listed below with their own "Choose", so searching
	 * elsewhere is the fallback, not the main path. */
	hasCandidates: boolean;
}) {
	const primary = () => {
		switch (lifecycle) {
			case "scheduled":
				return (
					<Button
						size="sm"
						variant="outline"
						onClick={actions.onCancelRetry}
						disabled={busy}
					>
						<XCircle data-icon="inline-start" />
						{m["enrichment.cancel_retry"]()}
					</Button>
				);
			case "review":
				return (
					<Button size="sm" onClick={actions.onApprove} disabled={busy}>
						<CheckCircle data-icon="inline-start" />
						{m["enrichment.approve"]()}
					</Button>
				);
			case "unresolved":
			case "no_match":
			case "partial":
				return (
					<Button
						size="sm"
						variant={hasCandidates ? "outline" : "default"}
						onClick={actions.onFix}
					>
						<PencilSimple data-icon="inline-start" />
						{m["enrichment.fix_match"]()}
					</Button>
				);
			case "failed":
				return (
					<Button size="sm" onClick={actions.onRetry} disabled={busy}>
						<ArrowClockwise data-icon="inline-start" />
						{m["enrichment.retry"]()}
					</Button>
				);
			default:
				return (
					<Button
						size="sm"
						variant="outline"
						onClick={actions.onRefresh}
						disabled={busy}
					>
						<ArrowClockwise data-icon="inline-start" />
						{m["enrichment.retry"]()}
					</Button>
				);
		}
	};

	// Secondary verbs, never repeating the primary one above.
	const secondary: { key: string; label: string; onClick: () => void }[] = [];
	if (lifecycle === "scheduled") {
		secondary.push({
			key: "retry-now",
			label: m["enrichment.action_retry_now"](),
			onClick: actions.onRetry,
		});
	}
	if (lifecycle === "review" || lifecycle === "failed") {
		secondary.push({
			key: "fix",
			label: m["enrichment.fix_match"](),
			onClick: actions.onFix,
		});
	}
	if (
		lifecycle === "unresolved" ||
		lifecycle === "no_match" ||
		lifecycle === "partial"
	) {
		secondary.push({
			key: "retry",
			label: m["enrichment.retry"](),
			onClick: actions.onRetry,
		});
	}
	return (
		<div className="flex flex-wrap items-center gap-1.5">
			{primary()}
			{secondary.map((action) => (
				<Button
					key={action.key}
					size="sm"
					variant="ghost"
					onClick={action.onClick}
					disabled={busy}
				>
					{action.label}
				</Button>
			))}
		</div>
	);
}

export function MatchDetailPanel({
	item,
	providerLabels,
	providerUrlTemplates,
	busy,
	actions,
	onPrevious,
	onNext,
	onClose,
	className,
}: {
	item: MatchRow;
	providerLabels: Record<string, string>;
	providerUrlTemplates: Record<string, string> | undefined;
	busy: boolean;
	actions: RowActions;
	onPrevious?: () => void;
	onNext?: () => void;
	onClose: () => void;
	className?: string;
}) {
	const { data: detail, isLoading } = useQuery({
		...orpc.enrichment.detail.queryOptions({
			input: { bookUuid: item.bookUuid },
		}),
		staleTime: 0,
		refetchOnMount: "always",
	});

	const labels = detail?.providerLabels ?? providerLabels;
	const templates = detail?.providerUrlTemplates ?? providerUrlTemplates;
	const fieldSources = Object.entries(detail?.fieldSources ?? {});
	const [selectedRunIndex, setSelectedRunIndex] = useState(0);
	const recentRuns = detail?.recentRuns ?? [];
	const selectedRun = recentRuns[selectedRunIndex] ?? detail?.latestRun;
	const latestDiagnostics = selectedRun?.diagnostics;
	const providerPlan = latestDiagnostics?.providers ?? [];
	const providerRuns = latestDiagnostics?.providerRuns ?? [];
	const providerPlanStatus = {
		ready: m["enrichment.provider_ready"],
		disabled: m["enrichment.provider_disabled"],
		missing_credentials: m["enrichment.provider_missing_credentials"],
		cooldown: m["enrichment.provider_cooldown"],
		no_eligible_fields: m["enrichment.provider_not_routed"],
		not_routed: m["enrichment.provider_not_routed"],
		outside_coverage: m["enrichment.provider_outside_coverage"],
		no_fields_pending: m["enrichment.provider_no_fields_pending"],
		blocked_by_authority: m["enrichment.provider_blocked_by_authority"],
		unavailable: m["enrichment.provider_unavailable"],
	} as const;
	const providerRunStatus = {
		matched: m["enrichment.provider_run_matched"],
		fallback: m["enrichment.provider_run_fallback"],
		queried: m["enrichment.provider_run_queried"],
		no_candidates: m["enrichment.provider_run_no_candidates"],
		rejected: m["enrichment.provider_run_rejected"],
		cooldown: m["enrichment.provider_cooldown"],
		missing_credentials: m["enrichment.provider_missing_credentials"],
		failed: m["enrichment.provider_run_failed"],
		skipped: m["enrichment.provider_run_skipped"],
	} as const;
	const runOutcome = {
		matched: m["enrichment.run_outcome_matched"],
		no_match: m["enrichment.run_outcome_no_match"],
		retryable_failure: m["enrichment.run_outcome_retryable_failure"],
	} as const;
	const ambiguousCandidates = resolveAmbiguousCandidates(
		item.decision,
		detail?.decision,
	);
	const decision = detail?.decision ?? item.decision;
	const unresolved = decision?.kind === "unresolved" ? decision : null;
	const unresolvedMessages = {
		no_candidates: m["enrichment.unresolved_no_candidates"],
		identity_conflict: m["enrichment.unresolved_identity_conflict"],
		insufficient_evidence: m["enrichment.unresolved_insufficient_evidence"],
		missing_title: m["enrichment.unresolved_missing_title"],
		missing_series: m["enrichment.unresolved_missing_series"],
		candidate_budget_exhausted:
			m["enrichment.unresolved_candidate_budget_exhausted"],
		provider_unavailable: m["enrichment.unresolved_provider_unavailable"],
	};
	const locked = new Set(detail?.lockedFields ?? []);
	const coverFilename = getCoverFilename(item.cover);
	const bookRoute =
		item.mediaType === "audiobook"
			? "/dashboard/audiobooks/$uuid"
			: "/dashboard/books/$uuid";
	const { automaticRetryAt, automaticRetryScheduled, providerRetryExhausted } =
		resolveRetryView(item.retry);
	const firstFailure = item.failures[0];
	const failureProvider = firstFailure
		? (labels[firstFailure.provider] ?? firstFailure.provider)
		: "";
	const detailSummary =
		automaticRetryScheduled && automaticRetryAt
			? m["enrichment.automatic_retry_summary"]({
					provider: failureProvider,
					minutes: minutesFromMs(automaticRetryAt.getTime() - Date.now()),
				})
			: providerRetryExhausted
				? m["enrichment.retry_exhausted_summary"]({ provider: failureProvider })
				: firstFailure
					? m["enrichment.provider_failure_summary"]({
							provider: failureProvider,
							reason: failureLabel(firstFailure.code),
						})
					: ambiguousCandidates.length > 0
						? m["enrichment.ambiguous_hint"]()
						: unresolved
							? unresolvedMessages[unresolved.reason]()
							: item.lifecycle === "review"
								? m["enrichment.review_hint"]()
								: item.lifecycle === "partial"
									? m["enrichment.partial_hint"]()
									: item.lifecycle === "no_match"
										? m["enrichment.unresolved_no_candidates"]()
										: null;

	return (
		<aside
			aria-label={m["enrichment.detail_title"]()}
			className={cn("flex min-h-0 flex-col", className)}
		>
			<header className="shrink-0 border-border/60 border-b px-4 py-3">
				<div className="flex items-center justify-end gap-0.5">
					{(onPrevious || onNext) && (
						<>
							<Button
								size="icon-sm"
								variant="ghost"
								onClick={onPrevious}
								disabled={!onPrevious}
								aria-label={m["enrichment.previous_item"]()}
							>
								<CaretLeft />
							</Button>
							<Button
								size="icon-sm"
								variant="ghost"
								onClick={onNext}
								disabled={!onNext}
								aria-label={m["enrichment.next_item"]()}
							>
								<CaretRight />
							</Button>
						</>
					)}
					<Button
						size="icon-sm"
						variant="ghost"
						asChild
						aria-label={m["enrichment.open_book"]()}
					>
						<Link to={bookRoute} params={{ uuid: item.bookUuid }}>
							<ArrowSquareOut />
						</Link>
					</Button>
					<Button
						size="icon-sm"
						variant="ghost"
						onClick={onClose}
						aria-label={m["enrichment.close_detail"]()}
					>
						<X />
					</Button>
				</div>
				<div className="mt-2 flex min-w-0 items-start gap-3">
					{coverFilename ? (
						<img
							src={getCoverUrl(coverFilename, coverPresets.activity.widths[1])}
							alt=""
							decoding="async"
							className={cn(
								"h-20 w-14 shrink-0 rounded-md object-cover ring-1 ring-foreground/10",
								COVER_EDGE,
							)}
						/>
					) : (
						<div className="h-20 w-14 shrink-0 rounded-md bg-muted ring-1 ring-foreground/10" />
					)}
					<div className="min-w-0 flex-1">
						<h2 className="line-clamp-2 font-semibold text-base leading-snug">
							{item.title ?? item.bookUuid}
						</h2>
						<div className="mt-2 flex flex-wrap items-center gap-2">
							<LifecycleChip lifecycle={item.lifecycle} />
							{item.libraryName && (
								<span className="truncate text-muted-foreground text-xs">
									{item.libraryName}
								</span>
							)}
						</div>
					</div>
				</div>
			</header>

			<Tabs defaultValue="match" className="min-h-0 flex-1 gap-0">
				<TabsList variant="line" className="w-full px-4 pt-2">
					<TabsTrigger value="match">
						{m["enrichment.detail_tab_match"]()}
					</TabsTrigger>
					<TabsTrigger value="fields">
						{m["enrichment.detail_tab_fields"]()}
						{fieldSources.length > 0 && (
							<span className="text-muted-foreground text-xs tabular-nums">
								{fieldSources.length}
							</span>
						)}
					</TabsTrigger>
				</TabsList>

				<TabsContent
					value="match"
					className="min-h-0 overflow-y-auto overscroll-contain px-4 py-4"
				>
					<div className="flex flex-col gap-5">
						{(detailSummary || item.lifecycle !== "running") && (
							<section className="rounded-lg border border-border/60 bg-card/40 p-3">
								{detailSummary && (
									<p className="text-sm leading-relaxed">{detailSummary}</p>
								)}
								<div className={cn(detailSummary && "mt-3")}>
									<DetailActions
										lifecycle={item.lifecycle}
										busy={busy}
										actions={actions}
										hasCandidates={ambiguousCandidates.length > 0}
									/>
								</div>
							</section>
						)}
						{ambiguousCandidates.length > 0 && (
							<section className="flex flex-col gap-2">
								<SectionTitle>
									{m["enrichment.candidates_title"]()}
								</SectionTitle>
								{ambiguousCandidates.map((candidate) => {
									const url = providerRecordUrl(
										templates,
										candidate.provider,
										candidate.providerId,
									);
									return (
										<div
											key={`${candidate.provider}-${candidate.providerId}`}
											className="flex items-center gap-3 rounded-lg bg-card/60 px-3 py-2"
										>
											{candidate.previewCover ? (
												<img
													src={candidate.previewCover}
													alt=""
													loading="lazy"
													decoding="async"
													className={cn(
														"h-16 w-11 shrink-0 rounded object-cover ring-1 ring-foreground/10",
														COVER_EDGE,
													)}
												/>
											) : (
												<span className="h-16 w-11 shrink-0 rounded bg-muted ring-1 ring-foreground/10" />
											)}
											<div className="min-w-0 flex-1">
												<p className="line-clamp-2 font-medium text-sm leading-snug">
													{candidate.title ?? (
														<span className="font-normal text-muted-foreground">
															{m["enrichment.candidate_no_details"]()}
														</span>
													)}
												</p>
												{candidate.byline && (
													<p className="truncate text-muted-foreground text-xs">
														{candidate.byline}
													</p>
												)}
												<div className="mt-1 flex flex-wrap items-center gap-1.5">
													<span className="text-muted-foreground text-xs">
														{labels[candidate.provider] ?? candidate.provider}
														{!candidate.title && ` · ${candidate.providerId}`}
													</span>
													{candidate.reasons?.length ? (
														<MatchReasonChip reasons={candidate.reasons} />
													) : null}
												</div>
											</div>
											{url && (
												<a
													href={url}
													target="_blank"
													rel="noreferrer noopener"
													aria-label={m["enrichment.open_provider_record"]()}
													className="text-muted-foreground hover:text-foreground"
												>
													<ArrowSquareOut className="size-3.5" />
												</a>
											)}
											<Button
												size="sm"
												onClick={() => actions.onSelectCandidate(candidate)}
												disabled={busy}
											>
												{m["enrichment.select_candidate"]()}
											</Button>
										</div>
									);
								})}
							</section>
						)}
						{item.matched[0] && (
							<section className="flex flex-col gap-2">
								<SectionTitle>
									{m["enrichment.detail_current_match"]()}
								</SectionTitle>
								<div className="rounded-lg bg-card/60 px-3 py-2">
									<div className="flex items-center gap-2">
										<p className="min-w-0 flex-1 truncate font-medium text-sm">
											{item.matched[0].title ?? item.matched[0].providerId}
										</p>
										{item.matched[0].reasons?.length ? (
											<MatchReasonChip reasons={item.matched[0].reasons} />
										) : null}
									</div>
									<p className="text-muted-foreground text-xs">
										{labels[item.matched[0].provider] ??
											item.matched[0].provider}
									</p>
								</div>
							</section>
						)}

						<details className="rounded-lg border border-border/60">
							<summary className="cursor-pointer px-3 py-2.5 font-medium text-sm marker:text-muted-foreground">
								{m["enrichment.detail_technical"]()}
							</summary>
							<div className="flex flex-col gap-5 border-border/60 border-t px-3 py-4">
								{recentRuns.length > 1 && (
									<label className="flex items-center justify-between gap-3 text-sm">
										<span className="text-muted-foreground">
											{m["enrichment.run_history"]()}
										</span>
										<select
											className="min-w-0 max-w-48 rounded-md border bg-background px-2 py-1 text-xs"
											value={selectedRunIndex}
											onChange={(event) =>
												setSelectedRunIndex(Number(event.currentTarget.value))
											}
										>
											{recentRuns.map((run, index) => (
												<option key={run.createdAt} value={index}>
													{index === 0
														? m["enrichment.latest_run"]()
														: new Date(run.createdAt).toLocaleString()}{" "}
													·{" "}
													{(
														runOutcome[
															run.outcome as keyof typeof runOutcome
														] ?? (() => humanizeField(run.outcome))
													)()}
												</option>
											))}
										</select>
									</label>
								)}
								{providerRuns.length > 0 && (
									<section className="flex flex-col gap-2">
										<SectionTitle>
											{m["enrichment.provider_journey"]()}
										</SectionTitle>
										{providerRuns.map((run) => (
											<div
												key={run.provider}
												className="rounded-lg bg-card/60 px-3 py-2 text-sm"
											>
												<div className="flex items-center justify-between gap-3">
													<span className="font-medium">
														{labels[run.provider] ?? run.provider}
													</span>
													<span className="text-muted-foreground text-xs">
														{(
															providerRunStatus[run.status] ??
															(() => humanizeField(run.status))
														)()}
													</span>
												</div>
												<p className="text-muted-foreground text-xs tabular-nums">
													{run.searches} / {run.candidates} / {run.hydrations}
												</p>
											</div>
										))}
									</section>
								)}
								{providerPlan.length > 0 && (
									<section className="flex flex-col gap-2">
										<SectionTitle>
											{m["enrichment.provider_plan"]()}
										</SectionTitle>
										{providerPlan.map((entry) => (
											<div
												key={entry.provider}
												className="flex items-start justify-between gap-3 rounded-lg bg-card/60 px-3 py-2 text-sm"
											>
												<div className="min-w-0">
													<p className="font-medium">
														{labels[entry.provider] ?? entry.provider}
													</p>
													<p className="truncate text-muted-foreground text-xs">
														{entry.fields.map(humanizeField).join(", ")}
													</p>
												</div>
												<span
													className={cn(
														"text-xs",
														entry.status !== "ready"
															? "text-warning"
															: "text-muted-foreground",
													)}
												>
													{(
														providerPlanStatus[
															entry.status as keyof typeof providerPlanStatus
														] ?? (() => humanizeField(entry.status))
													)()}
												</span>
											</div>
										))}
									</section>
								)}

								{unresolved && (
									<section className="flex flex-col gap-2 text-sm">
										<SectionTitle>
											{m["enrichment.unresolved_title"]()}
										</SectionTitle>
										<p>{unresolvedMessages[unresolved.reason]()}</p>
										{unresolved.reasons.includes(
											"discriminator.volume_conflict",
										) && <p>{m["enrichment.unresolved_volume"]()}</p>}
										{unresolved.reasons.includes(
											"discriminator.part_conflict",
										) && <p>{m["enrichment.unresolved_part"]()}</p>}
										{unresolved.reasons.includes(
											"discriminator.internal_conflict",
										) && <p>{m["enrichment.unresolved_internal"]()}</p>}
										{unresolved.searches != null &&
											unresolved.candidates != null && (
												<p className="text-muted-foreground text-xs">
													{m["enrichment.unresolved_summary"]({
														searches: unresolved.searches,
														candidates: unresolved.candidates,
													})}
												</p>
											)}
									</section>
								)}
								{item.failures.length > 0 && (
									<section className="flex flex-col gap-2">
										<SectionTitle>
											{m["enrichment.failures_title"]()}
										</SectionTitle>
										{item.failures.map((failure) => (
											<div
												key={`${failure.provider}-${failure.code}`}
												className="flex items-center gap-2 text-sm"
											>
												<Warning
													weight="fill"
													className="size-3.5 shrink-0 text-warning"
												/>
												<span className="font-medium">
													{labels[failure.provider] ?? failure.provider}
												</span>
												<span className="text-muted-foreground text-xs">
													{failureLabel(failure.code)}
												</span>
											</div>
										))}
									</section>
								)}

								<section className="flex flex-col gap-2">
									<SectionTitle>{m["enrichment.detail_run"]()}</SectionTitle>
									<dl className="flex flex-col gap-1 text-sm">
										<div className="flex items-baseline justify-between gap-3">
											<dt className="text-muted-foreground">
												{m["enrichment.detail_last_run"]()}
											</dt>
											<dd className="tabular-nums">
												{item.lastRunAt
													? formatDate(item.lastRunAt)
													: m["enrichment.never_ran"]()}
											</dd>
										</div>
										{(detail?.attempts ?? 0) > 0 && (
											<div className="flex items-baseline justify-between gap-3">
												<dt className="text-muted-foreground">
													{m["enrichment.detail_attempts"]()}
												</dt>
												<dd className="tabular-nums">{detail?.attempts}</dd>
											</div>
										)}
										{(detail?.providerAttempts ?? 0) > 0 && (
											<div className="flex items-baseline justify-between gap-3">
												<dt className="text-muted-foreground">
													{m["enrichment.detail_provider_attempts"]()}
												</dt>
												<dd className="tabular-nums">
													{detail?.providerAttempts}
												</dd>
											</div>
										)}
										{latestDiagnostics && (
											<>
												<div className="flex items-baseline justify-between gap-3">
													<dt className="text-muted-foreground">
														{m["enrichment.run_duration"]()}
													</dt>
													<dd>{latestDiagnostics.durationMs} ms</dd>
												</div>
												<div className="flex items-baseline justify-between gap-3">
													<dt className="text-muted-foreground">
														{m["enrichment.run_searches"]()}
													</dt>
													<dd>{latestDiagnostics.searches}</dd>
												</div>
												<div className="flex items-baseline justify-between gap-3">
													<dt className="text-muted-foreground">
														{m["enrichment.run_candidates"]()}
													</dt>
													<dd>{latestDiagnostics.candidates}</dd>
												</div>
												<div className="flex items-baseline justify-between gap-3">
													<dt className="text-muted-foreground">
														{m["enrichment.run_hydrations"]()}
													</dt>
													<dd>{latestDiagnostics.hydrations}</dd>
												</div>
											</>
										)}
										{item.filename && (
											<div className="flex items-baseline justify-between gap-3">
												<dt className="shrink-0 text-muted-foreground">
													{m["enrichment.detail_file"]()}
												</dt>
												<dd
													className="min-w-0 truncate text-end"
													title={item.filename}
												>
													{item.filename}
												</dd>
											</div>
										)}
									</dl>
								</section>
							</div>
						</details>
					</div>
				</TabsContent>

				<TabsContent
					value="fields"
					className="min-h-0 overflow-y-auto overscroll-contain px-4 py-4"
				>
					{isLoading && <Skeleton className="h-40 w-full rounded-lg" />}
					{!isLoading && fieldSources.length === 0 && (
						<p className="text-muted-foreground text-sm">
							{m["enrichment.no_field_origins"]()}
						</p>
					)}
					{fieldSources.length > 0 && (
						<dl className="flex flex-col">
							{fieldSources.map(([field, source]) => (
								<div
									key={field}
									className="flex items-baseline justify-between gap-4 border-border/40 border-b py-2 last:border-b-0"
								>
									<dt className="min-w-0 truncate font-medium text-sm">
										{humanizeField(field)}
									</dt>
									<dd className="flex shrink-0 items-center gap-1.5 text-muted-foreground text-sm">
										{locked.has(field) && (
											<Lock
												weight="fill"
												className="size-3.5 text-foreground/70"
												aria-label={m["enrichment.locked"]()}
											/>
										)}
										{sourceLabel(source.p, labels)}
									</dd>
								</div>
							))}
						</dl>
					)}
				</TabsContent>
			</Tabs>
		</aside>
	);
}
