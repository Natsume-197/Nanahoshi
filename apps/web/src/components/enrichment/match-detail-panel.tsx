import {
	ArrowClockwise,
	ArrowCounterClockwise,
	ArrowSquareOut,
	BookOpen,
	CaretLeft,
	CaretRight,
	Check,
	CheckCircle,
	CircleNotch,
	ClockCountdown,
	Info,
	Lock,
	MagnifyingGlass,
	PencilSimple,
	Plus,
	Question,
	Warning,
	WarningCircle,
	X,
	XCircle,
} from "@phosphor-icons/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { type ReactNode, useRef, useState } from "react";
import {
	EditAudiobookMetadataDialog,
	EditBookMetadataDialog,
} from "@/components/metadata/edit-metadata-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useMountEffect } from "@/hooks/use-mount-effect";
import { cn } from "@/lib/utils";
import { m } from "@/paraglide/messages";
import { getLocale } from "@/paraglide/runtime";
import {
	COVER_EDGE,
	coverPresets,
	getCoverFilename,
	getCoverUrl,
} from "@/utils/covers";
import {
	capitalizeFirst,
	formatDate,
	formatReadingTime,
	formatRelativeTime,
	formatTimeUntil,
} from "@/utils/format";
import { orpc } from "@/utils/orpc";
import { resolveAmbiguousCandidates } from "./ambiguous-decision";
import {
	buildFacts,
	type DetailMetadata,
	diffFacts,
	dominantSource,
	editFieldFor,
	type Fact,
	type FactChange,
	type FactKey,
	factSource,
	missingFacts,
	resolveSituation,
	type Situation,
} from "./detail-facts";
import {
	failureLabel,
	matchReasonLabels,
	previewCoverUrl,
	providerRecordUrl,
	sourceLabel,
} from "./lifecycle";
import { resolveRetryView } from "./retry-view";
import type { MatchDecisionCandidate, MatchRow, RowActions } from "./types";

type Tone = "info" | "warning" | "destructive" | "success";

const SITUATION_TONE: Record<Situation, Tone> = {
	running: "info",
	scheduled: "info",
	review: "warning",
	ambiguous: "warning",
	unresolved: "warning",
	no_match: "destructive",
	partial: "warning",
	failed: "destructive",
	done: "success",
};

const SITUATION_ICON: Record<Situation, ReactNode> = {
	running: <CircleNotch className="animate-spin" />,
	scheduled: <ClockCountdown />,
	review: <Question />,
	ambiguous: <Question />,
	unresolved: <WarningCircle />,
	no_match: <MagnifyingGlass />,
	partial: <WarningCircle />,
	failed: <Warning />,
	done: <CheckCircle />,
};

const TONE_SURFACE: Record<Tone, string> = {
	info: "border-info/25 bg-info/8 [&_[data-tone-icon]]:text-info",
	warning: "border-warning/25 bg-warning/8 [&_[data-tone-icon]]:text-warning",
	destructive:
		"border-destructive/25 bg-destructive/8 [&_[data-tone-icon]]:text-destructive",
	success: "border-success/25 bg-success/8 [&_[data-tone-icon]]:text-success",
};

const FACT_LABELS: Record<FactKey, () => string> = {
	cover: m["enrichment.dm_field_cover"],
	authors: m["enrichment.dm_field_authors"],
	narrators: m["enrichment.dm_field_narrators"],
	series: m["enrichment.dm_field_series"],
	publisher: m["enrichment.dm_field_publisher"],
	published: m["enrichment.dm_field_published"],
	language: m["enrichment.dm_field_language"],
	length: m["enrichment.dm_field_length"],
	identifiers: m["enrichment.dm_field_identifiers"],
	genres: m["enrichment.dm_field_genres"],
	description: m["enrichment.dm_field_description"],
};

function languageName(code: string): string {
	// Some providers store the English name ("japanese") instead of a BCP 47 tag.
	if (code.length > 3) return capitalizeFirst(code);
	try {
		return (
			new Intl.DisplayNames([getLocale()], { type: "language" }).of(code) ??
			code
		);
	} catch {
		return code;
	}
}

/** A comparison line (see factText) in the reader's locale. */
function displayFactText(
	key: FactKey,
	text: string | null,
	mediaType: "ebook" | "audiobook",
): string | null {
	if (text == null) return null;
	switch (key) {
		case "length":
			return mediaType === "audiobook"
				? formatReadingTime(Number(text))
				: m["enrichment.dm_pages"]({ count: Number(text) });
		case "published":
			return formatDate(text);
		case "language":
			return languageName(text);
		case "genres":
			return text.split(", ").map(capitalizeFirst).join(", ");
		default:
			return text;
	}
}

function humanize(value: string): string {
	const spaced = value.replace(/[_.]/g, " ");
	return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function SectionTitle({
	children,
	aside,
}: {
	children: ReactNode;
	aside?: ReactNode;
}) {
	return (
		<div className="flex items-center justify-between gap-3">
			<h3 className="font-semibold text-sm">{children}</h3>
			{aside}
		</div>
	);
}

function Cover({
	src,
	className,
	iconClassName,
}: {
	src: string | null | undefined;
	className: string;
	iconClassName?: string;
}) {
	if (src) {
		return (
			<img
				src={src}
				alt=""
				loading="lazy"
				decoding="async"
				className={cn(
					"shrink-0 rounded-md object-cover ring-1 ring-foreground/10",
					COVER_EDGE,
					className,
				)}
			/>
		);
	}
	return (
		<span
			className={cn(
				"flex shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground/60 ring-1 ring-foreground/10",
				className,
			)}
		>
			<BookOpen className={cn("size-5", iconClassName)} />
		</span>
	);
}

function Evidence({ reasons }: { reasons: string[] | undefined }) {
	const labels = matchReasonLabels(reasons ?? []);
	if (labels.length === 0) return null;
	return (
		<p className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-muted-foreground text-xs">
			<span>{m["enrichment.dm_evidence"]()}</span>
			{labels.map((label) => (
				<span key={label} className="inline-flex items-center gap-1">
					<Check weight="bold" className="size-3 text-success" />
					{label}
				</span>
			))}
		</p>
	);
}

function ProviderLink({
	href,
	provider,
}: {
	href: string | undefined;
	provider: string;
}) {
	if (!href) return <span>{provider}</span>;
	return (
		<a
			href={href}
			target="_blank"
			rel="noreferrer noopener"
			className="inline-flex items-center gap-1 underline-offset-2 hover:text-foreground hover:underline"
		>
			{m["enrichment.dm_view_on"]({ provider })}
			<ArrowSquareOut className="size-3" />
		</a>
	);
}

/** One sentence of what's going on and the one thing to do about it. */
function StatusCallout({
	situation,
	title,
	body,
	children,
}: {
	situation: Situation;
	title: string;
	body: string | null;
	children?: ReactNode;
}) {
	return (
		<section
			className={cn(
				"flex gap-3 rounded-xl border p-4",
				TONE_SURFACE[SITUATION_TONE[situation]],
			)}
		>
			<span data-tone-icon className="mt-0.5 shrink-0 [&>svg]:size-5">
				{SITUATION_ICON[situation]}
			</span>
			<div className="flex min-w-0 flex-1 flex-col gap-1">
				<h3 className="font-semibold text-sm">{title}</h3>
				{body && (
					<p className="text-muted-foreground text-sm leading-relaxed">
						{body}
					</p>
				)}
				{children && (
					<div className="mt-2 flex flex-wrap items-center gap-2 empty:hidden">
						{children}
					</div>
				)}
			</div>
		</section>
	);
}

function CalloutActions({
	situation,
	busy,
	actions,
}: {
	situation: Situation;
	busy: boolean;
	actions: RowActions;
}) {
	switch (situation) {
		case "running":
			return null;
		case "scheduled":
			return (
				<>
					<Button size="sm" onClick={actions.onRetry} disabled={busy}>
						<ArrowClockwise data-icon="inline-start" />
						{m["enrichment.action_retry_now"]()}
					</Button>
					<Button
						size="sm"
						variant="ghost"
						onClick={actions.onCancelRetry}
						disabled={busy}
					>
						<XCircle data-icon="inline-start" />
						{m["enrichment.cancel_retry"]()}
					</Button>
				</>
			);
		case "review":
			return (
				<>
					<Button size="sm" onClick={actions.onApprove} disabled={busy}>
						<Check data-icon="inline-start" />
						{m["enrichment.approve"]()}
					</Button>
					<Button size="sm" variant="outline" onClick={actions.onFix}>
						<MagnifyingGlass data-icon="inline-start" />
						{m["enrichment.dm_search_manually"]()}
					</Button>
					<Button
						size="sm"
						variant="ghost"
						onClick={actions.onRetry}
						disabled={busy}
					>
						<ArrowClockwise data-icon="inline-start" />
						{m["enrichment.retry"]()}
					</Button>
				</>
			);
		// The candidates below carry their own button.
		case "ambiguous":
			return null;
		case "failed":
			return (
				<>
					<Button size="sm" onClick={actions.onRetry} disabled={busy}>
						<ArrowClockwise data-icon="inline-start" />
						{m["enrichment.retry"]()}
					</Button>
					<Button size="sm" variant="ghost" onClick={actions.onFix}>
						{m["enrichment.dm_search_manually"]()}
					</Button>
				</>
			);
		case "done":
			return (
				<>
					<Button
						size="sm"
						variant="outline"
						onClick={actions.onRefresh}
						disabled={busy}
					>
						<ArrowClockwise data-icon="inline-start" />
						{m["enrichment.action_refresh"]()}
					</Button>
					<Button size="sm" variant="ghost" onClick={actions.onFix}>
						<MagnifyingGlass data-icon="inline-start" />
						{m["enrichment.dm_search_manually"]()}
					</Button>
				</>
			);
		default:
			return (
				<>
					<Button size="sm" onClick={actions.onFix}>
						<MagnifyingGlass data-icon="inline-start" />
						{m["enrichment.dm_search_manually"]()}
					</Button>
					<Button
						size="sm"
						variant="ghost"
						onClick={actions.onRetry}
						disabled={busy}
					>
						<ArrowClockwise data-icon="inline-start" />
						{m["enrichment.retry"]()}
					</Button>
				</>
			);
	}
}

const CHANGE_STYLE: Record<FactChange, string> = {
	adds: "text-success",
	changes: "text-warning",
	locked: "text-muted-foreground",
	same: "text-muted-foreground",
	keeps: "text-muted-foreground",
};

/**
 * What choosing this record would do, field by field. Fetched only when asked
 * for: every look-up is a real provider request.
 */
function CandidateChanges({
	bookUuid,
	candidate,
	current,
	lockedFields,
	mediaType,
}: {
	bookUuid: string;
	candidate: MatchDecisionCandidate;
	current: DetailMetadata;
	lockedFields: ReadonlySet<string>;
	mediaType: "ebook" | "audiobook";
}) {
	const { data, isLoading, isError } = useQuery({
		...orpc.enrichment.candidatePreview.queryOptions({
			input: {
				bookUuid,
				provider: candidate.provider,
				providerId: candidate.providerId,
			},
		}),
		staleTime: 10 * 60_000,
		retry: false,
	});
	if (isLoading) return <Skeleton className="h-20 w-full rounded-md" />;
	if (isError || !data) {
		return (
			<p className="text-muted-foreground text-xs">
				{m["enrichment.dm_changes_error"]()}
			</p>
		);
	}
	const labels: Record<FactChange, () => string> = {
		adds: m["enrichment.dm_change_adds"],
		changes: m["enrichment.dm_change_changes"],
		locked: m["enrichment.dm_change_locked"],
		same: m["enrichment.dm_change_same"],
		keeps: m["enrichment.dm_change_same"],
	};
	const rows = diffFacts(
		current,
		data.metadata,
		lockedFields,
		mediaType,
	).filter((row) => row.change !== "keeps" && row.change !== "same");
	if (rows.length === 0) {
		return (
			<p className="text-muted-foreground text-xs">
				{m["enrichment.dm_changes_none"]()}
			</p>
		);
	}
	return (
		<dl className="flex flex-col gap-1.5 rounded-md bg-background/60 p-2.5 text-xs">
			{rows.map((row) => (
				<div key={row.key} className="grid grid-cols-[6.5rem_1fr] gap-x-3">
					<dt className="text-muted-foreground">{FACT_LABELS[row.key]()}</dt>
					<dd className="min-w-0">
						<span className={cn("font-medium", CHANGE_STYLE[row.change])}>
							{labels[row.change]()}
						</span>
						<span className="line-clamp-2 break-words">
							{displayFactText(
								row.key,
								row.change === "locked" ? row.before : row.after,
								mediaType,
							)}
						</span>
						{row.change === "changes" && row.before && (
							<span className="line-clamp-1 break-words text-muted-foreground line-through">
								{displayFactText(row.key, row.before, mediaType)}
							</span>
						)}
					</dd>
				</div>
			))}
		</dl>
	);
}

function CandidatePicker({
	candidates,
	labels,
	templates,
	busy,
	onPick,
	onSearch,
	onRetry,
	compare,
}: {
	candidates: MatchDecisionCandidate[];
	labels: Record<string, string>;
	templates: Record<string, string> | undefined;
	busy: boolean;
	onPick: (candidate: MatchDecisionCandidate) => void;
	onSearch: () => void;
	onRetry: () => void;
	compare: {
		bookUuid: string;
		current: DetailMetadata | undefined;
		lockedFields: ReadonlySet<string>;
		mediaType: "ebook" | "audiobook";
	};
}) {
	const [comparing, setComparing] = useState<ReadonlySet<string>>(new Set());
	const toggleCompare = (key: string) =>
		setComparing((previous) => {
			const next = new Set(previous);
			if (next.has(key)) next.delete(key);
			else next.add(key);
			return next;
		});
	return (
		<section className="flex flex-col gap-2">
			<ul className="flex flex-col gap-2">
				{candidates.map((candidate) => {
					const provider = labels[candidate.provider] ?? candidate.provider;
					const key = `${candidate.provider}-${candidate.providerId}`;
					const open = comparing.has(key);
					return (
						<li
							key={key}
							className="flex flex-col gap-2.5 rounded-lg bg-card/70 p-3 ring-1 ring-foreground/5"
						>
							<div className="flex gap-3">
								<Cover
									src={previewCoverUrl(candidate.previewCover)}
									className="h-20 w-14"
								/>
								<div className="flex min-w-0 flex-1 flex-col gap-1">
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
									<Evidence reasons={candidate.reasons} />
									<div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-1">
										<span className="text-muted-foreground text-xs">
											<ProviderLink
												provider={provider}
												href={providerRecordUrl(
													templates,
													candidate.provider,
													candidate.providerId,
												)}
											/>
										</span>
										<span className="ms-auto flex flex-wrap items-center justify-end gap-1">
											{compare.current && (
												<Button
													size="sm"
													variant="ghost"
													aria-expanded={open}
													onClick={() => toggleCompare(key)}
												>
													{open
														? m["enrichment.dm_hide_changes"]()
														: m["enrichment.dm_what_changes"]()}
												</Button>
											)}
											<Button
												size="sm"
												onClick={() => onPick(candidate)}
												disabled={busy}
											>
												<Check data-icon="inline-start" />
												{m["enrichment.dm_pick"]()}
											</Button>
										</span>
									</div>
								</div>
							</div>
							{open && compare.current && (
								<CandidateChanges
									bookUuid={compare.bookUuid}
									candidate={candidate}
									current={compare.current}
									lockedFields={compare.lockedFields}
									mediaType={compare.mediaType}
								/>
							)}
						</li>
					);
				})}
			</ul>
			<div className="flex flex-wrap items-center justify-center gap-x-2 pt-1 text-muted-foreground text-sm">
				{m["enrichment.dm_none_match"]()}
				<Button size="sm" variant="link" className="px-0" onClick={onSearch}>
					{m["enrichment.dm_search_manually"]()}
				</Button>
				<span aria-hidden="true">·</span>
				<Button
					size="sm"
					variant="link"
					className="px-0"
					onClick={onRetry}
					disabled={busy}
				>
					{m["enrichment.retry"]()}
				</Button>
			</div>
		</section>
	);
}

function MatchCard({
	bookUuid,
	match,
	others,
	proposed,
	labels,
	templates,
}: {
	bookUuid: string;
	match: MatchRow["matched"][number];
	others: string[];
	proposed: boolean;
	labels: Record<string, string>;
	templates: Record<string, string> | undefined;
}) {
	const described = Boolean(match.title && match.previewCover);
	// Older matches stored only the provider id; the server looks the record up
	// once and caches it, so the reviewer never has to leave to see what it is.
	const { data: preview, isLoading } = useQuery({
		...orpc.enrichment.matchPreview.queryOptions({ input: { bookUuid } }),
		enabled: !described,
		staleTime: Number.POSITIVE_INFINITY,
	});
	const provider = labels[match.provider] ?? match.provider;
	const matchTitle = match.title ?? preview?.title ?? null;
	const matchByline = match.byline ?? preview?.byline ?? null;
	const matchCover = previewCoverUrl(
		match.previewCover ?? preview?.previewCover,
	);
	const loading = !described && isLoading;
	return (
		<section className="flex flex-col gap-2">
			<SectionTitle>
				{proposed
					? m["enrichment.dm_proposed_match"]()
					: m["enrichment.dm_current_match"]()}
			</SectionTitle>
			<div className="flex gap-3 rounded-lg bg-card/70 p-3 ring-1 ring-foreground/5">
				{loading ? (
					<Skeleton className="h-24 w-16 shrink-0 rounded-md" />
				) : (
					<Cover src={matchCover} className="h-24 w-16" />
				)}
				<div className="flex min-w-0 flex-1 flex-col gap-1">
					{loading ? (
						<>
							<Skeleton className="h-4 w-3/4" />
							<Skeleton className="h-3 w-1/2" />
						</>
					) : (
						<>
							<p className="line-clamp-2 font-medium text-sm leading-snug">
								{matchTitle ?? (
									<span className="font-normal text-muted-foreground">
										{m["enrichment.candidate_no_details"]()}
									</span>
								)}
							</p>
							{matchByline && (
								<p className="truncate text-muted-foreground text-xs">
									{matchByline}
								</p>
							)}
						</>
					)}
					<Evidence reasons={match.reasons} />
					<p className="mt-auto flex flex-wrap items-center gap-x-2 pt-1 text-muted-foreground text-xs">
						<ProviderLink
							provider={provider}
							href={providerRecordUrl(
								templates,
								match.provider,
								match.providerId,
							)}
						/>
						{others.length > 0 && <span>· {others.join(", ")}</span>}
					</p>
				</div>
			</div>
		</section>
	);
}

function FactValue({
	fact,
	metadata,
	coverUrl,
}: {
	fact: Fact;
	metadata: DetailMetadata;
	coverUrl: string | null;
}) {
	const [expanded, setExpanded] = useState(false);
	switch (fact.key) {
		case "cover":
			return <Cover src={coverUrl} className="h-16 w-11" />;
		case "authors":
			return <>{metadata.authors.join(", ")}</>;
		case "narrators":
			return <>{metadata.narrators.join(", ")}</>;
		case "series":
			return (
				<>
					{metadata.series?.name}
					{metadata.series?.position && (
						<span className="text-muted-foreground">
							{" "}
							#{metadata.series.position}
						</span>
					)}
				</>
			);
		case "publisher":
			return <>{metadata.publisher}</>;
		case "published":
			return <>{formatDate(metadata.publishedDate)}</>;
		case "language":
			return <>{languageName(metadata.languageCode ?? "")}</>;
		case "length":
			return (
				<>
					{metadata.duration
						? formatReadingTime(metadata.duration)
						: m["enrichment.dm_pages"]({ count: metadata.pageCount ?? 0 })}
				</>
			);
		case "identifiers":
			return (
				<span className="flex flex-col font-mono text-xs">
					{metadata.isbn && <span>ISBN {metadata.isbn}</span>}
					{metadata.asin && <span>ASIN {metadata.asin}</span>}
				</span>
			);
		case "genres":
			return (
				<span className="flex flex-wrap gap-1">
					{metadata.genres.map((genre) => (
						<Badge key={genre} variant="secondary" className="font-normal">
							{capitalizeFirst(genre)}
						</Badge>
					))}
				</span>
			);
		case "description":
			return (
				<span className="flex flex-col items-start gap-1">
					<span
						className={cn(
							"whitespace-pre-line leading-relaxed",
							!expanded && "line-clamp-3",
						)}
					>
						{metadata.description}
					</span>
					<button
						type="button"
						onClick={() => setExpanded((value) => !value)}
						className="text-muted-foreground text-xs underline-offset-2 hover:text-foreground hover:underline"
					>
						{expanded
							? m["enrichment.dm_show_less"]()
							: m["enrichment.dm_show_more"]()}
					</button>
				</span>
			);
	}
}

function MetadataFacts({
	metadata,
	mediaType,
	coverUrl,
	fieldSources,
	lockedFields,
	labels,
	onEdit,
	onRestore,
}: {
	metadata: DetailMetadata;
	mediaType: "ebook" | "audiobook";
	coverUrl: string | null;
	fieldSources: Record<string, { p: string }>;
	lockedFields: ReadonlySet<string>;
	labels: Record<string, string>;
	onEdit: (field?: string) => void;
	onRestore: () => void;
}) {
	const facts = buildFacts(metadata, mediaType, { hasCover: coverUrl != null });
	const missing = missingFacts(facts);
	const common = dominantSource(facts, fieldSources);
	// The header already shows the cover; the row only earns its place as a gap.
	const rows = facts.filter((fact) => fact.key !== "cover" || !fact.present);
	return (
		<section className="flex flex-col gap-2">
			<SectionTitle
				aside={
					<span className="flex items-center gap-2">
						{missing.length > 0 ? (
							<Badge variant="warning">
								{m["enrichment.dm_missing_count"]({ count: missing.length })}
							</Badge>
						) : (
							<Badge variant="success">
								<Check weight="bold" />
								{m["enrichment.dm_complete"]()}
							</Badge>
						)}
						<Button size="xs" variant="ghost" onClick={() => onEdit()}>
							<PencilSimple data-icon="inline-start" />
							{m["enrichment.dm_edit"]()}
						</Button>
					</span>
				}
			>
				{m["enrichment.dm_metadata"]()}
			</SectionTitle>
			{common && (
				<p className="-mt-1 text-muted-foreground text-xs">
					{m["enrichment.dm_mostly_from"]({
						source: sourceLabel(common, labels),
					})}
				</p>
			)}
			<dl className="divide-y divide-border/50 rounded-lg ring-1 ring-foreground/5">
				{rows.map((fact) => {
					const source = factSource(fact, fieldSources, lockedFields);
					const shownSource =
						source.provider && source.provider !== common
							? source.provider
							: null;
					const editField = editFieldFor(fact.key, mediaType);
					const label = FACT_LABELS[fact.key]();
					return (
						<div
							key={fact.key}
							className="group/fact grid grid-cols-1 gap-x-4 gap-y-0.5 px-3 py-2.5 sm:grid-cols-[8rem_1fr]"
						>
							<dt className="text-muted-foreground text-sm">{label}</dt>
							<dd className="flex min-w-0 items-start justify-between gap-x-3 text-sm">
								{fact.present ? (
									<>
										<span className="min-w-0 flex-1 break-words">
											<FactValue
												fact={fact}
												metadata={metadata}
												coverUrl={coverUrl}
											/>
										</span>
										<span className="flex shrink-0 items-center gap-1 text-muted-foreground text-xs">
											{source.locked && (
												<Lock
													weight="fill"
													className="size-3"
													aria-label={m["enrichment.dm_locked_hint"]()}
												/>
											)}
											{shownSource && sourceLabel(shownSource, labels)}
											{editField && (
												<Button
													size="icon-xs"
													variant="ghost"
													className="opacity-60 focus-visible:opacity-100 group-hover/fact:opacity-100"
													onClick={() => onEdit(editField)}
													aria-label={m["enrichment.dm_edit_field"]({
														field: label.toLocaleLowerCase(getLocale()),
													})}
												>
													<PencilSimple />
												</Button>
											)}
										</span>
									</>
								) : (
									<>
										<span className="inline-flex items-center gap-1.5 text-warning">
											<WarningCircle className="size-3.5" />
											{m["enrichment.dm_missing"]()}
										</span>
										{editField && (
											<Button
												size="xs"
												variant="outline"
												onClick={() => onEdit(editField)}
											>
												<Plus data-icon="inline-start" />
												{m["enrichment.dm_add"]()}
											</Button>
										)}
									</>
								)}
							</dd>
						</div>
					);
				})}
			</dl>
			<Button
				size="sm"
				variant="link"
				className="self-end px-0 text-muted-foreground"
				onClick={onRestore}
			>
				<ArrowCounterClockwise data-icon="inline-start" />
				{m["enrichment.restore_original"]()}
			</Button>
		</section>
	);
}

type Run = {
	outcome: string;
	createdAt: string;
	diagnostics?: {
		searches?: number;
		candidates?: number;
		providers?: { provider: string; status: string; fields: string[] }[];
		providerRuns?: {
			provider: string;
			status: string;
			searches: number;
			candidates: number;
		}[];
	};
};

const RUNS_SHOWN = 3;

function RunHistory({
	runs,
	failures,
	labels,
	attempts,
	filename,
}: {
	runs: Run[];
	failures: MatchRow["failures"];
	labels: Record<string, string>;
	attempts: number;
	filename: string | null;
}) {
	const [showAll, setShowAll] = useState(false);
	const providerRunStatus: Record<string, () => string> = {
		matched: m["enrichment.provider_run_matched"],
		fallback: m["enrichment.provider_run_fallback"],
		queried: m["enrichment.provider_run_queried"],
		no_candidates: m["enrichment.provider_run_no_candidates"],
		rejected: m["enrichment.provider_run_rejected"],
		cooldown: m["enrichment.provider_cooldown"],
		missing_credentials: m["enrichment.provider_missing_credentials"],
		failed: m["enrichment.provider_run_failed"],
		skipped: m["enrichment.provider_run_skipped"],
	};
	const providerPlanStatus: Record<string, () => string> = {
		disabled: m["enrichment.provider_disabled"],
		missing_credentials: m["enrichment.provider_missing_credentials"],
		cooldown: m["enrichment.provider_cooldown"],
		no_eligible_fields: m["enrichment.provider_not_routed"],
		not_routed: m["enrichment.provider_not_routed"],
		outside_coverage: m["enrichment.provider_outside_coverage"],
		no_fields_pending: m["enrichment.provider_no_fields_pending"],
		blocked_by_authority: m["enrichment.provider_blocked_by_authority"],
		unavailable: m["enrichment.provider_unavailable"],
	};
	const runOutcome: Record<string, () => string> = {
		matched: m["enrichment.run_outcome_matched"],
		no_match: m["enrichment.run_outcome_no_match"],
		retryable_failure: m["enrichment.run_outcome_retryable_failure"],
	};
	const visible = showAll ? runs : runs.slice(0, RUNS_SHOWN);
	return (
		<details className="group rounded-lg ring-1 ring-foreground/5">
			<summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2.5 font-medium text-sm [&::-webkit-details-marker]:hidden">
				<span className="flex items-center gap-2">
					<CaretRight className="size-3.5 text-muted-foreground transition-transform group-open:rotate-90" />
					{m["enrichment.dm_history"]()}
				</span>
				{attempts > 0 && (
					<span className="font-normal text-muted-foreground text-xs tabular-nums">
						{m["enrichment.dm_attempts"]({ count: attempts })}
					</span>
				)}
			</summary>
			<div className="flex flex-col gap-4 border-border/50 border-t px-3 py-3">
				{failures.length > 0 && (
					<ul className="flex flex-col gap-1">
						{failures.map((failure) => (
							<li
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
							</li>
						))}
					</ul>
				)}
				{runs.length === 0 ? (
					<p className="text-muted-foreground text-sm">
						{m["enrichment.dm_history_empty"]()}
					</p>
				) : (
					<ol className="relative flex flex-col gap-4 border-border/60 border-s ps-4">
						{visible.map((run) => {
							const skipped = (run.diagnostics?.providers ?? []).filter(
								(entry) => entry.status !== "ready",
							);
							return (
								<li
									key={run.createdAt}
									className="relative flex flex-col gap-1"
								>
									<span
										aria-hidden="true"
										className={cn(
											"absolute -start-[21px] top-1.5 size-2 rounded-full ring-2 ring-background",
											run.outcome === "matched"
												? "bg-success"
												: run.outcome === "no_match"
													? "bg-destructive"
													: "bg-warning",
										)}
									/>
									<p className="flex flex-wrap items-baseline gap-x-2 text-sm">
										<span className="font-medium">
											{(
												runOutcome[run.outcome] ?? (() => humanize(run.outcome))
											)()}
										</span>
										<time
											dateTime={run.createdAt}
											title={formatDate(run.createdAt)}
											className="text-muted-foreground text-xs"
										>
											{formatRelativeTime(run.createdAt)}
										</time>
									</p>
									{(run.diagnostics?.providerRuns ?? []).map((providerRun) => (
										<p
											key={providerRun.provider}
											className="flex flex-wrap items-baseline gap-x-2 text-xs"
										>
											<span className="font-medium">
												{labels[providerRun.provider] ?? providerRun.provider}
											</span>
											<span className="text-muted-foreground">
												{(
													providerRunStatus[providerRun.status] ??
													(() => humanize(providerRun.status))
												)()}
												{" · "}
												{m["enrichment.dm_run_counts"]({
													searches: providerRun.searches,
													candidates: providerRun.candidates,
												})}
											</span>
										</p>
									))}
									{skipped.length > 0 && (
										<p className="text-muted-foreground text-xs">
											{m["enrichment.dm_not_queried"]()}:{" "}
											{skipped
												.map(
													(entry) =>
														`${labels[entry.provider] ?? entry.provider} (${(
															providerPlanStatus[entry.status] ??
															(() => humanize(entry.status))
														)().toLocaleLowerCase(getLocale())})`,
												)
												.join(", ")}
										</p>
									)}
								</li>
							);
						})}
					</ol>
				)}
				{runs.length > RUNS_SHOWN && !showAll && (
					<Button
						size="sm"
						variant="ghost"
						className="self-start"
						onClick={() => setShowAll(true)}
					>
						{m["enrichment.dm_show_older"]({ count: runs.length - RUNS_SHOWN })}
					</Button>
				)}
				{filename && (
					<p className="flex items-center gap-2 text-muted-foreground text-xs">
						<Info className="size-3.5 shrink-0" />
						<span className="min-w-0 truncate font-mono" title={filename}>
							{filename}
						</span>
					</p>
				)}
			</div>
		</details>
	);
}

/** The book page's own edit dialog, fed from the same queries it uses. */
function TrayMetadataEditor({
	bookUuid,
	mediaType,
	focusField,
	onClose,
}: {
	bookUuid: string;
	mediaType: "ebook" | "audiobook";
	focusField?: string;
	onClose: () => void;
}) {
	const queryClient = useQueryClient();
	const audiobook = mediaType === "audiobook";
	const bookQuery = useQuery({
		...orpc.books.getBookWithMetadata.queryOptions({
			input: { uuid: bookUuid },
		}),
		enabled: !audiobook,
		staleTime: 0,
	});
	const audiobookQuery = useQuery({
		...orpc.audiobooks.getDetails.queryOptions({ input: { uuid: bookUuid } }),
		enabled: audiobook,
		staleTime: 0,
	});
	const onSaved = () => {
		queryClient.invalidateQueries({
			queryKey: orpc.enrichment.detail.key({ input: { bookUuid } }),
		});
		queryClient.invalidateQueries({ queryKey: orpc.enrichment.list.key() });
	};
	const onOpenChange = (open: boolean) => {
		if (!open) onClose();
	};
	if (!audiobook && bookQuery.data) {
		const book = bookQuery.data;
		return (
			<EditBookMetadataDialog
				open
				onOpenChange={onOpenChange}
				focusField={focusField}
				onSaved={onSaved}
				book={{
					...book,
					authors: book.authors ?? [],
					genres: book.genres ?? [],
					tags: book.tags ?? [],
				}}
			/>
		);
	}
	if (audiobook && audiobookQuery.data) {
		const details = audiobookQuery.data;
		return (
			<EditAudiobookMetadataDialog
				open
				onOpenChange={onOpenChange}
				focusField={focusField}
				onSaved={onSaved}
				audiobook={{
					...details,
					authors: details.authors ?? [],
					narrators: details.narrators ?? [],
					genres: details.genres ?? [],
					tags: details.tags ?? [],
				}}
			/>
		);
	}
	return null;
}

export function MatchDetailPanel({
	item,
	providerLabels,
	providerUrlTemplates,
	busy,
	actions,
	position,
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
	position?: { index: number; total: number };
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
		// The worker is changing this book right now; follow it.
		refetchInterval:
			item.lifecycle === "running" || item.lifecycle === "scheduled"
				? 4000
				: false,
	});
	const [editing, setEditing] = useState<{ field?: string } | null>(null);

	// Capture phase: the dialog stops keydown propagation before it bubbles.
	const asideRef = useRef<HTMLElement>(null);
	const navigateRef = useRef({ onPrevious, onNext });
	navigateRef.current = { onPrevious, onNext };
	useMountEffect(() => {
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.defaultPrevented || event.altKey || event.metaKey) return;
			const target = event.target as HTMLElement | null;
			if (target?.closest("input, textarea, select, [contenteditable]")) return;
			// Another dialog stacked on top (fix match, confirmations) owns the keys.
			const ownDialog = asideRef.current?.closest("[role=dialog]");
			if (!ownDialog || !(target && ownDialog.contains(target))) return;
			if (event.ctrlKey || event.shiftKey) return;
			const { onPrevious: previous, onNext: next } = navigateRef.current;
			const move =
				event.key === "ArrowLeft"
					? previous
					: event.key === "ArrowRight"
						? next
						: undefined;
			if (!move) return;
			event.preventDefault();
			move();
		};
		document.addEventListener("keydown", onKeyDown, true);
		return () => document.removeEventListener("keydown", onKeyDown, true);
	});

	const labels = detail?.providerLabels ?? providerLabels;
	const templates = detail?.providerUrlTemplates ?? providerUrlTemplates;
	const candidates = resolveAmbiguousCandidates(
		item.decision,
		detail?.decision,
	);
	const metadata = detail?.metadata;
	const lockedFields = new Set(detail?.lockedFields ?? []);
	const missing = metadata
		? missingFacts(
				buildFacts(metadata, item.mediaType, { hasCover: item.cover != null }),
			)
		: [];
	// "Done" only means a provider matched; with essentials still empty the
	// honest message is the partial one.
	const matchedSituation = resolveSituation(
		item.lifecycle,
		candidates.length > 0,
	);
	const situation =
		matchedSituation === "done" && missing.length > 0
			? "partial"
			: matchedSituation;
	const decision = detail?.decision ?? item.decision;
	const unresolved = decision?.kind === "unresolved" ? decision : null;

	const coverFilename = getCoverFilename(item.cover);
	const coverUrl = coverFilename
		? getCoverUrl(coverFilename, coverPresets.activity.widths[1])
		: null;
	const bookRoute =
		item.mediaType === "audiobook"
			? "/dashboard/audiobooks/$uuid"
			: "/dashboard/books/$uuid";
	const title = item.title ?? item.filename ?? item.bookUuid;
	const byline = metadata?.authors.length ? metadata.authors.join(", ") : null;
	const seriesLine = metadata?.series
		? `${metadata.series.name}${metadata.series.position ? ` #${metadata.series.position}` : ""}`
		: null;

	const { automaticRetryAt, automaticRetryScheduled, providerRetryExhausted } =
		resolveRetryView(item.retry);
	const firstFailure = item.failures[0];
	const failureProvider = firstFailure
		? (labels[firstFailure.provider] ?? firstFailure.provider)
		: "";
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
	const primaryMatch = item.matched[0];
	const primaryProvider = primaryMatch
		? (labels[primaryMatch.provider] ?? primaryMatch.provider)
		: null;

	const headline: Record<Situation, string> = {
		running: m["enrichment.dm_running_title"](),
		scheduled: m["enrichment.dm_scheduled_title"](),
		review: m["enrichment.dm_review_title"](),
		ambiguous: m["enrichment.dm_ambiguous_title"](),
		unresolved: m["enrichment.dm_unresolved_title"](),
		no_match: m["enrichment.dm_no_match_title"](),
		partial: m["enrichment.dm_partial_title"](),
		failed: m["enrichment.dm_failed_title"](),
		done: m["enrichment.dm_done_title"](),
	};
	const body = ((): string | null => {
		switch (situation) {
			case "running":
				return m["enrichment.dm_running_body"]();
			case "scheduled":
				return automaticRetryScheduled && automaticRetryAt
					? m["enrichment.dm_retry_when"]({
							provider: failureProvider,
							when: formatTimeUntil(automaticRetryAt),
						})
					: null;
			case "review":
				return m["enrichment.dm_review_body"]();
			case "ambiguous":
				return m["enrichment.dm_ambiguous_body"]();
			case "unresolved":
				return unresolved
					? unresolvedMessages[unresolved.reason]()
					: m["enrichment.unresolved_insufficient_evidence"]();
			case "no_match":
				return m["enrichment.dm_no_match_body"]();
			case "partial":
				return m["enrichment.partial_hint"]();
			case "failed":
				return providerRetryExhausted
					? m["enrichment.retry_exhausted_summary"]({
							provider: failureProvider,
						})
					: firstFailure
						? m["enrichment.provider_failure_summary"]({
								provider: failureProvider,
								reason: failureLabel(firstFailure.code),
							})
						: null;
			case "done":
				return primaryProvider
					? m["enrichment.dm_done_body"]({ provider: primaryProvider })
					: m["enrichment.dm_done_body_local"]();
		}
	})();
	// A past verdict's reasons only matter while that verdict stands.
	const detailReasons =
		unresolved && (situation === "unresolved" || situation === "no_match")
			? [
					unresolved.reasons.includes("discriminator.volume_conflict") &&
						m["enrichment.unresolved_volume"](),
					unresolved.reasons.includes("discriminator.part_conflict") &&
						m["enrichment.unresolved_part"](),
					unresolved.reasons.includes("discriminator.internal_conflict") &&
						m["enrichment.unresolved_internal"](),
				].filter((reason) => reason !== false)
			: [];

	return (
		<aside
			ref={asideRef}
			aria-label={m["enrichment.detail_title"]()}
			className={cn("flex min-h-0 flex-col", className)}
		>
			<header className="flex shrink-0 items-center gap-1 border-border/60 border-b px-3 py-2">
				{(onPrevious || onNext) && (
					<div className="flex items-center gap-0.5">
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
						{position && (
							<span className="ps-1 text-muted-foreground text-xs tabular-nums">
								{m["enrichment.dm_position"]({
									index: position.index,
									total: position.total,
								})}
							</span>
						)}
					</div>
				)}
				<div className="ms-auto flex items-center gap-0.5">
					<Button size="sm" variant="ghost" asChild>
						<Link to={bookRoute} params={{ uuid: item.bookUuid }}>
							{m["enrichment.open_book"]()}
							<ArrowSquareOut data-icon="inline-end" />
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

			<div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
				<div className="flex flex-col gap-6 px-4 py-5 sm:px-6">
					<div className="flex gap-4">
						<Cover src={coverUrl} className="h-32 w-22 rounded-lg shadow-sm" />
						<div className="flex min-w-0 flex-1 flex-col gap-1.5 py-0.5">
							<h2 className="line-clamp-3 font-semibold text-lg leading-snug">
								{title}
							</h2>
							{isLoading ? (
								<Skeleton className="h-4 w-32" />
							) : (
								(byline || seriesLine) && (
									<p className="text-muted-foreground text-sm">
										{[byline, seriesLine].filter(Boolean).join(" · ")}
									</p>
								)
							)}
							<div className="mt-auto flex flex-wrap items-center gap-2 pt-1">
								<span className="text-muted-foreground text-xs">
									{[
										item.mediaType === "audiobook"
											? m["enrichment.dm_type_audiobook"]()
											: m["enrichment.dm_type_ebook"](),
										item.libraryName,
									]
										.filter(Boolean)
										.join(" · ")}
								</span>
							</div>
						</div>
					</div>

					<StatusCallout
						situation={situation}
						title={headline[situation]}
						body={body}
					>
						<CalloutActions
							situation={situation}
							busy={busy}
							actions={actions}
						/>
					</StatusCallout>

					{detailReasons.length > 0 && (
						<ul className="-mt-3 flex flex-col gap-1 px-1 text-muted-foreground text-sm">
							{detailReasons.map((reason) => (
								<li key={reason} className="flex gap-2">
									<span aria-hidden="true">·</span>
									{reason}
								</li>
							))}
						</ul>
					)}

					{situation === "ambiguous" && (
						<CandidatePicker
							candidates={candidates}
							labels={labels}
							templates={templates}
							busy={busy}
							onPick={actions.onSelectCandidate}
							onSearch={actions.onFix}
							onRetry={actions.onRetry}
							compare={{
								bookUuid: item.bookUuid,
								current: metadata,
								lockedFields,
								mediaType: item.mediaType,
							}}
						/>
					)}

					{primaryMatch && situation !== "ambiguous" && (
						<MatchCard
							bookUuid={item.bookUuid}
							match={primaryMatch}
							others={item.matched
								.slice(1)
								.map((match) => labels[match.provider] ?? match.provider)}
							proposed={situation === "review"}
							labels={labels}
							templates={templates}
						/>
					)}

					{isLoading && <Skeleton className="h-64 w-full rounded-lg" />}
					{metadata && (
						<MetadataFacts
							metadata={metadata}
							mediaType={item.mediaType}
							coverUrl={coverUrl}
							fieldSources={detail?.fieldSources ?? {}}
							lockedFields={lockedFields}
							labels={labels}
							onEdit={(field) => setEditing({ field })}
							onRestore={actions.onRestore}
						/>
					)}

					{detail && (
						<RunHistory
							runs={detail.recentRuns as Run[]}
							failures={item.failures}
							labels={labels}
							attempts={detail.attempts ?? 0}
							filename={item.filename}
						/>
					)}
				</div>
			</div>
			{editing && (
				<TrayMetadataEditor
					bookUuid={item.bookUuid}
					mediaType={item.mediaType}
					focusField={editing.field}
					onClose={() => setEditing(null)}
				/>
			)}
		</aside>
	);
}
