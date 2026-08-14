import {
	Archive,
	ArrowClockwise,
	ArrowCounterClockwise,
	ArrowSquareOut,
	CheckCircle,
	Lock,
	PencilSimple,
	Prohibit,
	Warning,
	X,
	XCircle,
} from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
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
}: {
	lifecycle: Lifecycle;
	busy: boolean;
	actions: RowActions;
}) {
	const primary = () => {
		switch (lifecycle) {
			case "running":
				return (
					<Button
						size="sm"
						variant="outline"
						onClick={actions.onStop}
						disabled={busy}
					>
						<Prohibit data-icon="inline-start" />
						{m["enrichment.action_stop"]()}
					</Button>
				);
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
					<Button size="sm" onClick={actions.onFix}>
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
			case "stopped":
				return (
					<Button size="sm" onClick={actions.onRetry} disabled={busy}>
						<ArrowClockwise data-icon="inline-start" />
						{m["enrichment.action_reprocess"]()}
					</Button>
				);
			case "archived":
				return (
					<Button size="sm" onClick={actions.onUnarchive} disabled={busy}>
						<ArrowCounterClockwise data-icon="inline-start" />
						{m["enrichment.action_restore"]()}
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
						{m["enrichment.action_refresh"]()}
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
	if (
		lifecycle === "review" ||
		lifecycle === "failed" ||
		lifecycle === "stopped"
	) {
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
	if (lifecycle === "partial") {
		secondary.push({
			key: "approve",
			label: m["enrichment.approve"](),
			onClick: actions.onApprove,
		});
	}
	if (lifecycle === "failed" || lifecycle === "partial") {
		secondary.push({
			key: "stop",
			label: m["enrichment.action_stop"](),
			onClick: actions.onStop,
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
			<Button
				size="sm"
				variant="ghost"
				className="ms-auto text-muted-foreground"
				onClick={
					lifecycle === "archived" ? actions.onUnarchive : actions.onArchive
				}
				disabled={busy}
			>
				{lifecycle === "archived" ? (
					<ArrowCounterClockwise data-icon="inline-start" />
				) : (
					<Archive data-icon="inline-start" />
				)}
				{lifecycle === "archived"
					? m["enrichment.action_restore"]()
					: m["enrichment.action_archive"]()}
			</Button>
		</div>
	);
}

export function MatchDetailPanel({
	item,
	providerLabels,
	providerUrlTemplates,
	busy,
	actions,
	onClose,
	className,
}: {
	item: MatchRow;
	providerLabels: Record<string, string>;
	providerUrlTemplates: Record<string, string> | undefined;
	busy: boolean;
	actions: RowActions;
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
	const ambiguousCandidates = resolveAmbiguousCandidates(
		item.decision,
		detail?.decision,
	);
	const locked = new Set(detail?.lockedFields ?? []);
	const coverFilename = getCoverFilename(item.cover);
	const bookRoute =
		item.mediaType === "audiobook"
			? "/dashboard/audiobooks/$uuid"
			: "/dashboard/books/$uuid";
	const {
		automaticRetryAt,
		automaticRetryCancelled,
		automaticRetryScheduled,
		providerRetryExhausted,
	} = resolveRetryView(item.retry);
	const firstFailure = item.failures[0];
	const failureProvider = firstFailure
		? (labels[firstFailure.provider] ?? firstFailure.provider)
		: "";

	return (
		<aside
			aria-label={m["enrichment.detail_title"]()}
			className={cn("flex min-h-0 flex-col bg-muted/20", className)}
		>
			<header className="flex items-start gap-3 border-border/60 border-b px-4 py-3.5">
				{coverFilename ? (
					<img
						src={getCoverUrl(coverFilename, coverPresets.activity.widths[1])}
						alt=""
						decoding="async"
						className={cn(
							"h-16 w-11 shrink-0 rounded object-cover",
							COVER_EDGE,
						)}
					/>
				) : (
					<div className="h-16 w-11 shrink-0 rounded bg-muted" />
				)}
				<div className="min-w-0 flex-1">
					<h2 className="line-clamp-2 font-semibold text-base leading-snug">
						{item.title ?? item.bookUuid}
					</h2>
					<div className="mt-1.5 flex flex-wrap items-center gap-2">
						<LifecycleChip lifecycle={item.lifecycle} />
						{item.libraryName && (
							<span className="truncate text-muted-foreground text-xs">
								{item.libraryName}
							</span>
						)}
					</div>
				</div>
				<div className="flex shrink-0 items-center gap-0.5">
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
			</header>

			<div className="border-border/60 border-b px-4 py-2.5">
				<DetailActions
					lifecycle={item.lifecycle}
					busy={busy}
					actions={actions}
				/>
			</div>

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
						{ambiguousCandidates.length > 0 && (
							<section className="flex flex-col gap-2">
								<p className="rounded-lg bg-warning/10 px-3 py-2 text-sm text-warning">
									{m["enrichment.ambiguous_hint"]()}
								</p>
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
											<div className="min-w-0 flex-1">
												<p className="truncate font-medium text-sm">
													{candidate.title ?? candidate.providerId}
												</p>
												<p className="truncate text-muted-foreground text-xs">
													{labels[candidate.provider] ?? candidate.provider}
												</p>
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
						{item.lifecycle === "review" && (
							<p className="rounded-lg bg-warning/10 px-3 py-2 text-sm text-warning">
								{m["enrichment.review_hint"]()}
							</p>
						)}

						{automaticRetryScheduled && automaticRetryAt && (
							<p className="text-muted-foreground text-sm">
								{m["enrichment.automatic_retry_summary"]({
									provider: failureProvider,
									minutes: minutesFromMs(
										automaticRetryAt.getTime() - Date.now(),
									),
								})}
							</p>
						)}
						{automaticRetryCancelled && (
							<p className="text-muted-foreground text-sm">
								{m["enrichment.retry_cancelled_summary"]({
									provider: failureProvider,
								})}
							</p>
						)}
						{providerRetryExhausted && !automaticRetryScheduled && (
							<p className="text-muted-foreground text-sm">
								{m["enrichment.retry_exhausted_summary"]({
									provider: failureProvider,
								})}
							</p>
						)}

						{item.matched.length > 0 && (
							<section className="flex flex-col gap-2">
								<SectionTitle>
									{m["enrichment.provider_journey"]()}
								</SectionTitle>
								{item.matched.map((match) => {
									const url = providerRecordUrl(
										templates,
										match.provider,
										match.providerId,
									);
									return (
										<div
											key={`${match.provider}-${match.providerId}`}
											className="flex min-w-0 flex-col gap-1 rounded-lg bg-card/60 px-3 py-2"
										>
											<div className="flex min-w-0 items-center gap-2">
												<span className="font-medium text-sm">
													{labels[match.provider] ?? match.provider}
												</span>
												{match.reasons?.length ? (
													<MatchReasonChip reasons={match.reasons} />
												) : null}
												{url && (
													<a
														href={url}
														target="_blank"
														rel="noreferrer noopener"
														className="ms-auto shrink-0 text-muted-foreground hover:text-foreground"
														aria-label={m["enrichment.open_provider_record"]()}
													>
														<ArrowSquareOut className="size-3.5" />
													</a>
												)}
											</div>
											{match.title && (
												<p className="truncate text-sm" title={match.title}>
													{match.title}
												</p>
											)}
											{match.providerId && (
												<p className="truncate font-mono text-muted-foreground text-xs">
													{match.providerId}
												</p>
											)}
										</div>
									);
								})}
							</section>
						)}

						{item.failures.length > 0 && (
							<section className="flex flex-col gap-2">
								<SectionTitle>{m["enrichment.failures_title"]()}</SectionTitle>
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
										<dd className="tabular-nums">{detail?.providerAttempts}</dd>
									</div>
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
