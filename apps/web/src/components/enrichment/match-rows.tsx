import { DotsThreeVertical } from "@phosphor-icons/react";
import type { CSSProperties, ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { m } from "@/paraglide/messages";
import {
	COVER_EDGE,
	coverPresets,
	getCoverFilename,
	getCoverUrl,
} from "@/utils/covers";
import { formatRelativeTime } from "@/utils/format";
import type { EnrichmentLifecycle as Lifecycle } from "./filters";
import {
	failureLabel,
	LifecycleChip,
	MatchReasonChip,
	minutesFromMs,
} from "./lifecycle";
import { primaryActionForLifecycle } from "./primary-action";
import { resolveRetryView } from "./retry-view";
import type { MatchRow, RowActions } from "./types";

function itemExplanation(
	item: MatchRow,
	providerLabels: Record<string, string>,
): string | null {
	const firstFailure = item.failures[0];
	if (firstFailure) {
		const provider =
			providerLabels[firstFailure.provider] ?? firstFailure.provider;
		const {
			automaticRetryAt,
			automaticRetryScheduled,
			providerRetryExhausted,
		} = resolveRetryView(item.retry);
		if (automaticRetryScheduled && automaticRetryAt) {
			return m["enrichment.automatic_retry_summary"]({
				provider,
				minutes: minutesFromMs(automaticRetryAt.getTime() - Date.now()),
			});
		}
		if (providerRetryExhausted) {
			return m["enrichment.retry_exhausted_summary"]({ provider });
		}
		return m["enrichment.provider_failure_summary"]({
			provider,
			reason: failureLabel(firstFailure.code),
		});
	}
	if (item.decision?.kind === "ambiguous") {
		return m["enrichment.ambiguous_hint"]();
	}
	if (item.decision?.kind === "unresolved") {
		const labels = {
			no_candidates: m["enrichment.unresolved_no_candidates"],
			identity_conflict: m["enrichment.unresolved_identity_conflict"],
			insufficient_evidence: m["enrichment.unresolved_insufficient_evidence"],
			missing_title: m["enrichment.unresolved_missing_title"],
			missing_series: m["enrichment.unresolved_missing_series"],
			candidate_budget_exhausted:
				m["enrichment.unresolved_candidate_budget_exhausted"],
			provider_unavailable: m["enrichment.unresolved_provider_unavailable"],
		};
		return labels[item.decision.reason]();
	}
	if (item.lifecycle === "review" || item.lifecycle === "partial") {
		return m["enrichment.review_hint"]();
	}
	if (item.lifecycle === "no_match") {
		return m["enrichment.unresolved_no_candidates"]();
	}
	return null;
}

export function PrimaryRowButton({
	lifecycle,
	actions,
	onOpen,
	className,
}: {
	lifecycle: Lifecycle;
	actions: RowActions;
	onOpen: () => void;
	className?: string;
}) {
	const primary = primaryActionForLifecycle(lifecycle);
	const labels = {
		approve: m["enrichment.approve"](),
		details: m["enrichment.view_detail"](),
		fix: m["enrichment.fix_match"](),
		retry:
			lifecycle === "scheduled"
				? m["enrichment.action_retry_now"]()
				: m["enrichment.retry"](),
	};
	const handlers = {
		approve: actions.onApprove,
		details: onOpen,
		fix: actions.onFix,
		retry: actions.onRetry,
	};
	return (
		<Button
			size="sm"
			variant={primary === "details" ? "ghost" : "outline"}
			className={cn("h-7", className)}
			onClick={handlers[primary]}
		>
			{labels[primary]}
		</Button>
	);
}

export function BookCell({ item, open }: { item: MatchRow; open: boolean }) {
	const coverFilename = getCoverFilename(item.cover);
	const sourceName = item.filename?.replace(/\.[^./\\]+$/, "") ?? null;
	return (
		<span className="flex min-w-0 items-center gap-2.5">
			{coverFilename ? (
				<img
					src={getCoverUrl(coverFilename, coverPresets.activity.widths[1])}
					alt=""
					loading="lazy"
					decoding="async"
					className={cn(
						"h-[72px] w-12 shrink-0 rounded-md object-cover ring-1 ring-foreground/10",
						COVER_EDGE,
					)}
				/>
			) : (
				<span className="h-[72px] w-12 shrink-0 rounded-md bg-muted ring-1 ring-foreground/10" />
			)}
			<span className="min-w-0 flex-1">
				<span
					className={cn(
						"block truncate font-medium text-[14px] leading-tight transition-colors group-hover:text-foreground",
						open && "text-primary",
					)}
					title={item.title ?? undefined}
				>
					{item.title ?? item.bookUuid}
				</span>
				<span
					className="block truncate text-muted-foreground text-xs"
					title={sourceName ?? undefined}
				>
					{sourceName ?? item.libraryName}
				</span>
			</span>
		</span>
	);
}

export function MatchCell({
	item,
	providerLabels,
}: {
	item: MatchRow;
	providerLabels: Record<string, string>;
}) {
	const primaryMatch = item.matched[0];
	const matchedCover =
		primaryMatch?.previewCover ?? (primaryMatch ? item.cover : null);
	const matchedCoverFilename = getCoverFilename(matchedCover);
	const matchedCoverUrl = primaryMatch?.previewCover?.startsWith("http")
		? primaryMatch.previewCover
		: matchedCoverFilename
			? getCoverUrl(matchedCoverFilename, coverPresets.activity.widths[1])
			: null;
	const providerName = primaryMatch
		? (providerLabels[primaryMatch.provider] ?? primaryMatch.provider)
		: "";
	// Older matches did not capture the provider's title. Their current title and
	// cover are the merged result, so they still present as a match rather than a
	// technical "matched via provider" message.
	const chosen = primaryMatch
		? (primaryMatch.title ??
			item.title ??
			primaryMatch.providerId ??
			providerName)
		: null;
	if (!chosen)
		return <span className="text-muted-foreground/50 text-sm">—</span>;
	return (
		<span className="flex min-w-0 items-center gap-2.5">
			{matchedCoverUrl ? (
				<img
					src={matchedCoverUrl}
					alt=""
					loading="lazy"
					decoding="async"
					className={cn(
						"h-[72px] w-12 shrink-0 rounded-md object-cover ring-1 ring-foreground/10",
						COVER_EDGE,
					)}
				/>
			) : (
				<span className="h-[72px] w-12 shrink-0 rounded-md bg-muted ring-1 ring-foreground/10" />
			)}
			<span className="min-w-0 flex-1">
				<span
					className="block truncate text-[14px] leading-tight"
					title={chosen}
				>
					{chosen}
				</span>
				<span className="block truncate text-muted-foreground text-xs">
					{providerName}
				</span>
			</span>
		</span>
	);
}

export function EnrichmentRow({
	item,
	cells,
	selected,
	open,
	onOpen,
}: {
	item: MatchRow;
	cells: { id: string; content: ReactNode; style: CSSProperties }[];
	selected: boolean;
	open: boolean;
	onOpen: () => void;
}) {
	return (
		<tr
			data-match-row={item.bookUuid}
			tabIndex={0}
			onClick={(event) => {
				if (
					(event.target as HTMLElement).closest(
						'button,a,input,[role="checkbox"]',
					)
				)
					return;
				onOpen();
			}}
			onKeyDown={(event) => {
				if (event.target !== event.currentTarget) return;
				if (event.key === "Enter" || event.key === " ") {
					event.preventDefault();
					onOpen();
				}
			}}
			className={cn(
				ROW_SUBGRID,
				"group cursor-pointer border-border/40 border-b px-3 outline-none transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-ring focus-visible:-outline-offset-2",
				// Selection needs to read at a glance across 50 rows; the open row
				// stays clearly the stronger tint so the two never compete.
				open ? "bg-primary/16" : "hover:bg-muted/55",
				selected && !open && "bg-primary/6",
			)}
			data-active={open}
		>
			{cells.map((cell) => (
				<td
					key={cell.id}
					style={cell.style}
					className={cn(
						"flex min-h-[88px] min-w-0 items-center bg-inherit px-1.5 py-2",
						cell.id === "select" && "justify-center",
						cell.id === "actions" && "justify-end gap-0.5",
					)}
				>
					{cell.content}
				</td>
			))}
		</tr>
	);
}

export function EnrichmentCard({
	item,
	selected,
	open,
	onToggle,
	onOpen,
	providerLabels,
	actions,
}: {
	item: MatchRow;
	selected: boolean;
	open: boolean;
	onToggle: () => void;
	onOpen: () => void;
	providerLabels: Record<string, string>;
	actions: RowActions;
}) {
	const coverFilename = getCoverFilename(item.cover);
	const primaryMatch = item.matched[0];
	const explanation = itemExplanation(item, providerLabels);
	const provider = primaryMatch
		? (providerLabels[primaryMatch.provider] ?? primaryMatch.provider)
		: null;
	const sourceName = item.filename?.replace(/\.[^./\\]+$/, "") ?? null;

	return (
		<li
			data-match-row={item.bookUuid}
			className={cn(
				"border-border/50 border-b px-3 py-3",
				open ? "bg-primary/12" : "bg-background",
				selected && !open && "bg-primary/6",
			)}
		>
			<div className="flex items-start gap-3">
				<Checkbox
					checked={selected}
					onCheckedChange={onToggle}
					aria-label={item.title ?? item.bookUuid}
					className="mt-1"
				/>
				{coverFilename ? (
					<img
						src={getCoverUrl(coverFilename, coverPresets.activity.widths[1])}
						alt=""
						loading="lazy"
						decoding="async"
						className={cn(
							"h-16 w-11 shrink-0 rounded-md object-cover ring-1 ring-foreground/10",
							COVER_EDGE,
						)}
					/>
				) : (
					<span className="h-16 w-11 shrink-0 rounded-md bg-muted ring-1 ring-foreground/10" />
				)}
				<button
					type="button"
					onClick={onOpen}
					aria-current={open ? "true" : undefined}
					className="min-w-0 flex-1 text-start outline-none focus-visible:rounded focus-visible:outline-2 focus-visible:outline-ring"
				>
					<span className="block truncate font-medium text-sm">
						{item.title ?? item.bookUuid}
					</span>
					<span className="block truncate text-muted-foreground text-xs">
						{sourceName ?? item.libraryName}
					</span>
					<div className="mt-2 flex flex-wrap items-center gap-1.5">
						<LifecycleChip lifecycle={item.lifecycle} />
						{primaryMatch?.reasons?.length ? (
							<MatchReasonChip reasons={primaryMatch.reasons} />
						) : null}
					</div>
				</button>
			</div>
			{(primaryMatch?.title || explanation) && (
				<div className="mt-2 ps-[4.75rem] text-xs">
					{primaryMatch?.title && (
						<p className="truncate">
							{primaryMatch.title}
							{provider && (
								<span className="text-muted-foreground"> · {provider}</span>
							)}
						</p>
					)}
					{explanation && (
						<p className="mt-1 line-clamp-2 text-muted-foreground">
							{explanation}
						</p>
					)}
				</div>
			)}
			<div className="mt-2 flex items-center justify-end gap-1">
				<span className="me-auto ps-[4.75rem] text-muted-foreground text-xs tabular-nums">
					{item.lastRunAt
						? formatRelativeTime(item.lastRunAt)
						: m["enrichment.never_ran"]()}
				</span>
				<PrimaryRowButton
					lifecycle={item.lifecycle}
					actions={actions}
					onOpen={onOpen}
				/>
				<RowMenu lifecycle={item.lifecycle} actions={actions} />
			</div>
		</li>
	);
}

export function RowMenu({
	lifecycle,
	actions,
}: {
	lifecycle: Lifecycle;
	actions: RowActions;
}) {
	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button
					size="icon-xs"
					variant="ghost"
					aria-label={m["enrichment.more"]()}
					className="rounded-full text-foreground opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100 aria-expanded:opacity-100 max-md:opacity-100"
				>
					<DotsThreeVertical weight="bold" />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end">
				{lifecycle === "scheduled" && (
					<>
						<DropdownMenuItem onClick={actions.onCancelRetry}>
							{m["enrichment.cancel_retry"]()}
						</DropdownMenuItem>
						<DropdownMenuItem onClick={actions.onRetry}>
							{m["enrichment.action_retry_now"]()}
						</DropdownMenuItem>
					</>
				)}
				{lifecycle === "review" && (
					<DropdownMenuItem onClick={actions.onApprove}>
						{m["enrichment.approve"]()}
					</DropdownMenuItem>
				)}
				{lifecycle !== "running" && (
					<DropdownMenuItem onClick={actions.onFix}>
						{m["enrichment.fix_match"]()}
					</DropdownMenuItem>
				)}
				{lifecycle === "done" ? (
					<DropdownMenuItem onClick={actions.onRefresh}>
						{m["enrichment.retry"]()}
					</DropdownMenuItem>
				) : (
					lifecycle !== "running" &&
					lifecycle !== "scheduled" && (
						<DropdownMenuItem onClick={actions.onRetry}>
							{m["enrichment.retry"]()}
						</DropdownMenuItem>
					)
				)}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

const ROW_SUBGRID = "col-span-full grid grid-cols-subgrid items-center";
