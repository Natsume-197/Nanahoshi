import { Menu as MenuPrimitive } from "@base-ui/react/menu";
import { DotsThreeVertical } from "@phosphor-icons/react";
import { memo, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
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
import {
	primaryActionForLifecycle,
	secondaryActionsForLifecycle,
} from "./primary-action";
import { resolveRetryView } from "./retry-view";
import { TrayCell, TrayRow, TraySelectCell } from "./tray-table";
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
		choose: m["enrichment.choose_candidate"](),
		details: m["enrichment.view_detail"](),
		fix: m["enrichment.fix_match"](),
		retry:
			lifecycle === "scheduled"
				? m["enrichment.action_retry_now"]()
				: m["enrichment.retry"](),
	};
	const handlers = {
		approve: actions.onApprove,
		choose: onOpen,
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

export type RowHandlers = {
	open: (item: MatchRow) => void;
	toggle: (uuid: string) => void;
	actions: (item: MatchRow) => RowActions;
	menu: RowMenuHandle;
};

type RowProps = {
	item: MatchRow;
	selected: boolean;
	open: boolean;
	providerLabels: Record<string, string>;
	handlers: RowHandlers;
};

// Memoized: `item` keeps its identity across polls (query structural sharing)
// and `handlers` never changes, so a checkbox or poll re-renders only the rows
// whose data actually moved.
export const EnrichmentRow = memo(function EnrichmentRow({
	item,
	selected,
	open,
	providerLabels,
	handlers,
}: RowProps) {
	const actions = useMemo(() => handlers.actions(item), [handlers, item]);
	return (
		<TrayRow
			rowKey={item.bookUuid}
			selected={selected}
			open={open}
			onOpen={() => handlers.open(item)}
		>
			<TraySelectCell
				checked={selected}
				label={item.title ?? item.bookUuid}
				onToggle={() => handlers.toggle(item.bookUuid)}
			/>
			<TrayCell className={ROW_HEIGHT}>
				<BookCell item={item} open={open} />
			</TrayCell>
			<TrayCell className={ROW_HEIGHT}>
				<MatchCell item={item} providerLabels={providerLabels} />
			</TrayCell>
			<TrayCell className={ROW_HEIGHT}>
				<LifecycleChip lifecycle={item.lifecycle} />
			</TrayCell>
			<TrayCell className={ROW_HEIGHT}>
				<span className="whitespace-nowrap text-muted-foreground text-xs tabular-nums">
					{item.lastRunAt
						? formatRelativeTime(item.lastRunAt)
						: m["enrichment.never_ran"]()}
				</span>
			</TrayCell>
			<TrayCell className={cn(ROW_HEIGHT, "justify-end gap-0.5")}>
				<PrimaryRowButton
					lifecycle={item.lifecycle}
					actions={actions}
					onOpen={() => handlers.open(item)}
				/>
				<RowMenuTrigger handle={handlers.menu} item={item} />
			</TrayCell>
		</TrayRow>
	);
});

export const EnrichmentCard = memo(function EnrichmentCard({
	item,
	selected,
	open,
	providerLabels,
	handlers,
}: RowProps) {
	const actions = useMemo(() => handlers.actions(item), [handlers, item]);
	const onOpen = () => handlers.open(item);
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
					onCheckedChange={() => handlers.toggle(item.bookUuid)}
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
				<RowMenuTrigger handle={handlers.menu} item={item} />
			</div>
		</li>
	);
});

// One menu instance serves every row: each row only renders a light detached
// trigger carrying its book as payload. A full Base UI menu per row was the
// single biggest cost of mounting a 50-row page.
export function createRowMenuHandle() {
	return MenuPrimitive.createHandle<MatchRow>();
}
export type RowMenuHandle = ReturnType<typeof createRowMenuHandle>;

function RowMenuTrigger({
	handle,
	item,
}: {
	handle: RowMenuHandle;
	item: MatchRow;
}) {
	if (secondaryActionsForLifecycle(item.lifecycle).length === 0) return null;
	return (
		<DropdownMenuTrigger
			handle={handle}
			payload={item}
			render={
				<Button
					size="icon-xs"
					variant="ghost"
					aria-label={m["enrichment.more"]()}
					className="rounded-full text-foreground opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100 aria-expanded:opacity-100 max-md:opacity-100"
				/>
			}
		>
			<DotsThreeVertical weight="bold" />
		</DropdownMenuTrigger>
	);
}

export function SharedRowMenu({ handlers }: { handlers: RowHandlers }) {
	return (
		<MenuPrimitive.Root handle={handlers.menu}>
			{({ payload }) =>
				payload ? (
					<RowMenuContent
						lifecycle={payload.lifecycle}
						actions={handlers.actions(payload)}
					/>
				) : null
			}
		</MenuPrimitive.Root>
	);
}

function RowMenuContent({
	lifecycle,
	actions,
}: {
	lifecycle: Lifecycle;
	actions: RowActions;
}) {
	const items = {
		cancelRetry: {
			label: m["enrichment.cancel_retry"](),
			onClick: actions.onCancelRetry,
		},
		approve: { label: m["enrichment.approve"](), onClick: actions.onApprove },
		fix: { label: m["enrichment.fix_match"](), onClick: actions.onFix },
		retry: {
			label:
				lifecycle === "scheduled"
					? m["enrichment.action_retry_now"]()
					: m["enrichment.retry"](),
			// A finished book re-runs in refresh mode so providers get re-consulted.
			onClick: lifecycle === "done" ? actions.onRefresh : actions.onRetry,
		},
	};
	return (
		<DropdownMenuContent align="end">
			{secondaryActionsForLifecycle(lifecycle).map((action) => (
				<DropdownMenuItem key={action} onClick={items[action].onClick}>
					{items[action].label}
				</DropdownMenuItem>
			))}
		</DropdownMenuContent>
	);
}

// Two 72px covers per row.
const ROW_HEIGHT = "min-h-[88px]";
