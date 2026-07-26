import {
	Archive,
	ArrowClockwise,
	ArrowCounterClockwise,
	ArrowRight,
	ArrowSquareOut,
	CaretLeft,
	CaretRight,
	CheckCircle,
	CircleNotch,
	DotsThreeVertical,
	MagnifyingGlass,
	Pause,
	PencilSimple,
	Play,
	Prohibit,
	Question,
	Warning,
	XCircle,
} from "@phosphor-icons/react";
import {
	keepPreviousData,
	useMutation,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import { getRouteApi, Link } from "@tanstack/react-router";
import { Fragment, useRef, useState } from "react";
import { toast } from "sonner";
import {
	AudiobookMatchDialog,
	BookMatchDialog,
} from "@/components/metadata/match-metadata-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useDebounce } from "@/hooks/use-debounce";
import { cn } from "@/lib/utils";
import { m } from "@/paraglide/messages";
import { coverPresets, getCoverFilename, getCoverUrl } from "@/utils/covers";
import { formatDate } from "@/utils/format";
import { orpc } from "@/utils/orpc";
import {
	ALL_LIBRARIES,
	ALL_TYPES,
	BUCKET_LIFECYCLES,
	type EnrichmentBucket as Bucket,
	DEFAULT_BUCKET,
	type EnrichmentLifecycle as Lifecycle,
	listInputFromSearch,
	type MediaTypeFilter,
	PAGE_SIZE,
	type EnrichmentSort as Sort,
} from "./filters";
import { visiblePageNumbers } from "./pagination";
import { IDLE_POLL_MS, resolvePollInterval } from "./poll";
import { resolveRetryView } from "./retry-view";

type EnrichmentStatus =
	| "pending"
	| "enriched"
	| "partial"
	| "no_match"
	| "review";

const LIFECYCLE_LABELS: Record<Lifecycle, () => string> = {
	running: () => m["enrichment.lc_running"](),
	scheduled: () => m["enrichment.lc_scheduled"](),
	stopped: () => m["enrichment.lc_stopped"](),
	review: () => m["enrichment.lc_review"](),
	no_match: () => m["enrichment.lc_no_match"](),
	partial: () => m["enrichment.lc_partial"](),
	failed: () => m["enrichment.lc_failed"](),
	done: () => m["enrichment.lc_done"](),
	archived: () => m["enrichment.lc_archived"](),
};

const LIFECYCLE_VARIANTS = {
	running: "info",
	scheduled: "info",
	stopped: "secondary",
	review: "secondary",
	no_match: "destructive",
	partial: "warning",
	failed: "destructive",
	done: "success",
	archived: "outline",
} as const satisfies Record<
	Lifecycle,
	"info" | "secondary" | "destructive" | "warning" | "success" | "outline"
>;

// Raw enrichment status (detail inspector still speaks the DB status).
const STATUS_LABELS: Record<EnrichmentStatus, () => string> = {
	no_match: () => m["enrichment.status_no_match"](),
	partial: () => m["enrichment.status_partial"](),
	pending: () => m["enrichment.status_pending"](),
	enriched: () => m["enrichment.status_enriched"](),
	review: () => m["enrichment.status_review"](),
};

function LifecycleChip({ lifecycle }: { lifecycle: Lifecycle }) {
	return (
		<Badge variant={LIFECYCLE_VARIANTS[lifecycle]}>
			{LIFECYCLE_LABELS[lifecycle]()}
		</Badge>
	);
}

function minutesFromMs(ms: number): number {
	return Math.max(1, Math.ceil(ms / 60_000));
}

function providerRecordUrl(
	templates: Record<string, string> | undefined,
	provider: string | undefined,
	providerId: string | null | undefined,
): string | undefined {
	if (!templates || !provider || !providerId) return undefined;
	const template = templates[provider];
	return template?.replace("{id}", encodeURIComponent(providerId));
}

// Why the pipeline confirmed this match, strongest evidence first. A hard
// identifier needs no second look; a title-similarity bridge is exactly what a
// reviewer should be checking, so it reads as a warning.
const MATCH_REASONS: {
	reason: string;
	label: () => string;
	variant: "success" | "secondary" | "warning";
}[] = [
	{
		reason: "identifier.match",
		label: () => m["enrichment.reason_identifier"](),
		variant: "success",
	},
	{
		reason: "audiobook.asin_match",
		label: () => m["enrichment.reason_identifier"](),
		variant: "success",
	},
	{
		reason: "embedded_uid.match",
		label: () => m["enrichment.reason_embedded_uid"](),
		variant: "success",
	},
	{
		reason: "title.equivalent",
		label: () => m["enrichment.reason_title_exact"](),
		variant: "secondary",
	},
	{
		reason: "author.match",
		label: () => m["enrichment.reason_author"](),
		variant: "secondary",
	},
	{
		reason: "title.match",
		label: () => m["enrichment.reason_title_similar"](),
		variant: "warning",
	},
];

function MatchReasonChip({ reasons }: { reasons: string[] }) {
	const strongest = MATCH_REASONS.find((entry) =>
		reasons.includes(entry.reason),
	);
	if (!strongest) return null;
	return (
		<Badge variant={strongest.variant} className="shrink-0">
			{strongest.label()}
		</Badge>
	);
}

function sourceLabel(
	source: string,
	providerLabels: Record<string, string>,
): string {
	if (source === "local") return m["enrichment.source_local"]();
	if (source === "user") return m["enrichment.source_user"]();
	return providerLabels[source] ?? source;
}

function failureLabel(code: string): string {
	switch (code) {
		case "provider_cooldown":
		case "rate_limited":
			return m["enrichment.failure_rate_limited"]();
		case "provider_unavailable":
		case "network_error":
		case "timeout":
		case "server_error":
			return m["enrichment.failure_temporarily_unavailable"]();
		default:
			return m["enrichment.failure_generic"]();
	}
}

type FixTarget = {
	bookUuid: string;
	title: string;
	mediaType: "ebook" | "audiobook";
};

type StopRequest = { bookUuids?: string[]; useFilter?: boolean; count: number };

const BUCKETS: Bucket[] = [
	"in_progress",
	"attention",
	"stopped",
	"completed",
	"history",
];

const BUCKET_LABELS: Record<Bucket, () => string> = {
	in_progress: () => m["enrichment.bucket_in_progress"](),
	attention: () => m["enrichment.bucket_attention"](),
	stopped: () => m["enrichment.bucket_stopped"](),
	completed: () => m["enrichment.bucket_completed"](),
	history: () => m["enrichment.bucket_history"](),
};

// What each bucket is, plus what the actions offered there actually do. Kept
// next to SelectionActions so the two stay in step: the same bucket→actions
// mapping decides which buttons render and which lines the help shows.
const BUCKET_HELP: Record<
	Bucket,
	{ summary: () => string; actions: (keyof typeof ACTION_HELP)[] }
> = {
	in_progress: {
		summary: () => m["enrichment.help_bucket_in_progress"](),
		actions: ["retry", "stop", "archive"],
	},
	attention: {
		summary: () => m["enrichment.help_bucket_attention"](),
		actions: ["retry", "approve", "stop", "archive"],
	},
	stopped: {
		summary: () => m["enrichment.help_bucket_stopped"](),
		actions: ["reprocess", "archive"],
	},
	completed: {
		summary: () => m["enrichment.help_bucket_completed"](),
		actions: ["archive"],
	},
	history: {
		summary: () => m["enrichment.help_bucket_history"](),
		actions: ["restore"],
	},
};

const ACTION_HELP = {
	retry: {
		label: () => m["enrichment.retry"](),
		body: () => m["enrichment.help_action_retry"](),
	},
	reprocess: {
		label: () => m["enrichment.action_reprocess"](),
		body: () => m["enrichment.help_action_reprocess"](),
	},
	approve: {
		label: () => m["enrichment.approve"](),
		body: () => m["enrichment.help_action_approve"](),
	},
	stop: {
		label: () => m["enrichment.action_stop"](),
		body: () => m["enrichment.help_action_stop"](),
	},
	archive: {
		label: () => m["enrichment.action_archive"](),
		body: () => m["enrichment.help_action_archive"](),
	},
	restore: {
		label: () => m["enrichment.action_restore"](),
		body: () => m["enrichment.help_action_restore"](),
	},
} as const;

function BucketHelp({ bucket }: { bucket: Bucket }) {
	const help = BUCKET_HELP[bucket];
	return (
		<Popover>
			<PopoverTrigger
				render={
					<button
						type="button"
						aria-label={m["enrichment.help_open"]()}
						className="inline-flex size-7 items-center justify-center rounded-full border border-border/60 bg-card/60 text-muted-foreground transition-colors hover:text-foreground"
					>
						<Question />
					</button>
				}
			/>
			<PopoverContent align="start" className="w-80 max-w-[calc(100vw-1rem)]">
				<p className="font-medium text-sm">{BUCKET_LABELS[bucket]()}</p>
				<p className="mt-1 text-muted-foreground text-sm">{help.summary()}</p>
				<dl className="mt-3 space-y-2 border-border/60 border-t pt-3">
					{help.actions.map((action) => (
						<div key={action}>
							<dt className="font-medium text-sm">
								{ACTION_HELP[action].label()}
							</dt>
							<dd className="text-muted-foreground text-sm">
								{ACTION_HELP[action].body()}
							</dd>
						</div>
					))}
				</dl>
			</PopoverContent>
		</Popover>
	);
}

function LifecycleFilterRow({
	bucket,
	active,
	counts,
	onSelect,
}: {
	bucket: Bucket;
	active: Lifecycle | undefined;
	counts: Partial<Record<string, number>> | undefined;
	onSelect: (lifecycle: Lifecycle | undefined) => void;
}) {
	const options = BUCKET_LIFECYCLES[bucket];
	if (!options) return null;

	const chip = (
		key: string,
		label: string,
		selected: boolean,
		count: number | undefined,
		onClick: () => void,
	) => (
		<button
			key={key}
			type="button"
			onClick={onClick}
			aria-pressed={selected}
			className={cn(
				"inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs transition-colors",
				selected
					? "border-foreground/30 bg-foreground/10 font-medium text-foreground"
					: "border-transparent bg-muted/50 text-muted-foreground hover:text-foreground",
			)}
		>
			{label}
			{count != null && (
				<span className="tabular-nums opacity-70">{count}</span>
			)}
		</button>
	);

	return (
		<div className="flex flex-wrap items-center gap-1.5">
			{chip(
				"all",
				m["enrichment.lifecycle_all"](),
				active == null,
				undefined,
				() => onSelect(undefined),
			)}
			{options.map((option) =>
				chip(
					option,
					LIFECYCLE_LABELS[option](),
					active === option,
					counts?.[option],
					() => onSelect(active === option ? undefined : option),
				),
			)}
		</div>
	);
}

// URL is the source of truth for the discrete filters (shareable + survives
// reload). Search text stays local so keystrokes don't spam browser history.
const routeApi = getRouteApi("/dashboard/metadata");

export function MatchManager() {
	const queryClient = useQueryClient();
	const urlSearch = routeApi.useSearch();
	const navigate = routeApi.useNavigate();

	const bucket = urlSearch.bucket ?? DEFAULT_BUCKET;
	const libraryUuid = urlSearch.library ?? ALL_LIBRARIES;
	const mediaType = urlSearch.type ?? ALL_TYPES;
	const sort = urlSearch.sort ?? "recent";
	const onlyFailures = urlSearch.failures ?? false;

	// Patch the URL filters in place; every change resets paging + selection.
	const patchFilters = (
		patch: Partial<{
			bucket: Bucket;
			lifecycle: Lifecycle | undefined;
			library: string;
			type: MediaTypeFilter;
			sort: Sort;
			failures: boolean;
		}>,
		{ keepSelection = false }: { keepSelection?: boolean } = {},
	) => {
		navigate({ search: (prev) => ({ ...prev, ...patch }), replace: true });
		setOffset(0);
		if (!keepSelection) clearSelection();
	};

	const [search, setSearch] = useState("");
	const [offset, setOffset] = useState(0);
	const [selected, setSelected] = useState<Set<string>>(new Set());
	const [selectAllFilter, setSelectAllFilter] = useState(false);
	const [detailUuid, setDetailUuid] = useState<string | null>(null);
	const [fixTarget, setFixTarget] = useState<FixTarget | null>(null);
	const [stopRequest, setStopRequest] = useState<StopRequest | null>(null);
	const [archiveRequest, setArchiveRequest] = useState<number | null>(null);
	const [providerFixOpen, setProviderFixOpen] = useState(false);
	// Debounced, not deferred: this value is part of the list query key, and
	// useDeferredValue only smooths rendering — it would still fire a request
	// (three full scans server-side) per settled keystroke.
	const debouncedSearch = useDebounce(search, 300);

	const singleLibrary = libraryUuid !== ALL_LIBRARIES;
	// Built by the same helper the route loader uses, so the prefetched entry
	// lands under this exact query key.
	const listInput = listInputFromSearch(urlSearch, {
		offset,
		query: debouncedSearch,
	});
	const {
		sort: _sort,
		limit: _limit,
		offset: _offset,
		...filterScope
	} = listInput;
	const lifecycle = filterScope.lifecycle;

	// Live tray: the worker mutates these rows in the background, so this query
	// never serves a cached snapshot — it polls (fast while work is in flight),
	// and keeps the previous page on screen so bucket counts don't blank out
	// between switches.
	const {
		data,
		isLoading,
		isFetching,
		isPlaceholderData,
		refetch: refetchList,
	} = useQuery({
		...orpc.enrichment.list.queryOptions({ input: listInput }),
		staleTime: 0,
		refetchOnMount: "always",
		refetchOnWindowFocus: true,
		placeholderData: keepPreviousData,
		refetchInterval: (query) =>
			resolvePollInterval({
				selectionActive: selected.size > 0 || selectAllFilter,
				inProgressCount: query.state.data?.counts?.in_progress,
			}),
	});
	const { data: libraries } = useQuery(
		orpc.libraries.getLibrariesOverview.queryOptions(),
	);
	const { data: providerStatus } = useQuery({
		...orpc.enrichment.providerStatus.queryOptions({
			input: { libraryUuid: singleLibrary ? libraryUuid : undefined },
		}),
		staleTime: 0,
		refetchInterval: IDLE_POLL_MS,
	});
	const { data: eligibility } = useQuery({
		...orpc.enrichment.actionableCounts.queryOptions({ input: filterScope }),
		enabled: selectAllFilter,
		staleTime: 0,
	});

	const invalidateAll = () => {
		queryClient.invalidateQueries({ queryKey: orpc.enrichment.list.key() });
		queryClient.invalidateQueries({
			queryKey: orpc.enrichment.actionableCounts.key(),
		});
	};

	const clearSelection = () => {
		setSelected(new Set());
		setSelectAllFilter(false);
	};

	const mutationSettled = (message: string) => ({
		onSuccess: () => {
			toast.success(message);
			clearSelection();
			invalidateAll();
		},
		onError: (error: Error) => toast.error(error.message),
	});

	const retryMutation = useMutation(orpc.enrichment.retry.mutationOptions());
	const approveMutation = useMutation(
		orpc.enrichment.approve.mutationOptions(),
	);
	const cancelRetryMutation = useMutation(
		orpc.enrichment.cancelRetry.mutationOptions(),
	);
	const stopMutation = useMutation(orpc.enrichment.stop.mutationOptions());
	const archiveMutation = useMutation(
		orpc.enrichment.archive.mutationOptions(),
	);
	const unarchiveMutation = useMutation(
		orpc.enrichment.unarchive.mutationOptions(),
	);
	const pauseSettled = {
		onSuccess: (result: { paused: boolean }) => {
			toast.success(
				result.paused
					? m["enrichment.paused_toast"]()
					: m["enrichment.resumed_toast"](),
			);
			queryClient.invalidateQueries({
				queryKey: orpc.libraries.getLibrariesOverview.key(),
			});
			invalidateAll();
		},
		onError: (error: Error) => toast.error(error.message),
	};
	const pauseMutation = useMutation(
		orpc.libraries.setAutoEnrichPaused.mutationOptions(pauseSettled),
	);
	const pauseAllMutation = useMutation(
		orpc.libraries.setAllAutoEnrichPaused.mutationOptions(pauseSettled),
	);
	const resolveProviderMutation = useMutation(
		orpc.enrichment.resolveProviderFailures.mutationOptions({
			onSuccess: (result) => {
				toast.success(
					m["enrichment.provider_resolved_toast"]({
						count: result.reprocessed,
					}),
				);
				setProviderFixOpen(false);
				queryClient.invalidateQueries({
					queryKey: orpc.enrichment.providerStatus.key(),
				});
				invalidateAll();
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	const counts = data?.counts;
	const items = data?.items ?? [];
	const total = data?.total ?? 0;
	const providerLabels = providerStatus?.labels ?? {};
	const cooldowns = Object.entries(providerStatus?.cooldowns ?? {});
	const currentPage = Math.floor(offset / PAGE_SIZE) + 1;
	const totalPages = Math.ceil(total / PAGE_SIZE);
	const paginationPages = visiblePageNumbers(currentPage, totalPages);
	const busy =
		retryMutation.isPending ||
		approveMutation.isPending ||
		cancelRetryMutation.isPending ||
		stopMutation.isPending ||
		archiveMutation.isPending ||
		unarchiveMutation.isPending;

	// Pause reads per-library when one is selected, else across every library.
	const scopedLibraries = singleLibrary
		? (libraries ?? []).filter((library) => library.uuid === libraryUuid)
		: (libraries ?? []);
	const isPaused =
		scopedLibraries.length > 0 &&
		scopedLibraries.every((library) => library.autoEnrichPausedAt != null);
	const togglePause = (paused: boolean) => {
		if (singleLibrary) pauseMutation.mutate({ libraryUuid, paused });
		else pauseAllMutation.mutate({ paused });
	};
	const pausePending = pauseMutation.isPending || pauseAllMutation.isPending;

	// Systemic provider failures — one banner instead of the same per-row line
	// repeated across hundreds of books.
	const failureBanners = Object.entries(providerStatus?.failures ?? {})
		.filter(([, count]) => count > 0)
		.sort(([, a], [, b]) => b - a);

	// A bulk mutation targets either the explicit uuid set or the whole filter.
	const targetInput = () =>
		selectAllFilter ? { filter: filterScope } : { bookUuids: [...selected] };

	// A lifecycle belongs to one bucket, so switching buckets drops it.
	const applyBucket = (next: Bucket) =>
		patchFilters({ bucket: next, lifecycle: undefined });

	const toggleSelected = (uuid: string) => {
		setSelectAllFilter(false);
		setSelected((prev) => {
			const next = new Set(prev);
			if (next.has(uuid)) next.delete(uuid);
			else next.add(uuid);
			return next;
		});
	};

	const pageUuids = items.map((item) => item.bookUuid);
	const allPageSelected =
		pageUuids.length > 0 && pageUuids.every((uuid) => selected.has(uuid));
	const toggleSelectPage = () => {
		setSelectAllFilter(false);
		setSelected((prev) => {
			if (pageUuids.every((uuid) => prev.has(uuid))) {
				const next = new Set(prev);
				for (const uuid of pageUuids) next.delete(uuid);
				return next;
			}
			return new Set([...prev, ...pageUuids]);
		});
	};

	// Selection cardinality drives every bulk affordance.
	const selectionCount = selectAllFilter ? total : selected.size;
	const inSelectionMode = selectionCount > 0;

	// ── Single-book actions ──────────────────────────────────────────────────
	const retryOne = (uuid: string, refresh = false) =>
		retryMutation.mutate(
			{ bookUuids: [uuid], refresh },
			mutationSettled(m["enrichment.retry_enqueued"]({ count: 1 })),
		);
	const cancelRetryOne = (uuid: string) =>
		cancelRetryMutation.mutate(
			{ bookUuids: [uuid] },
			mutationSettled(m["enrichment.retry_cancelled"]({ count: 1 })),
		);
	const approveOne = (uuid: string) =>
		approveMutation.mutate(
			{ bookUuids: [uuid] },
			mutationSettled(m["enrichment.approve_enqueued"]({ count: 1 })),
		);
	// Archive is reversible, so an explicit uuid set archives immediately with an
	// undo toast — no confirmation friction. Only "select all results" (below)
	// gets a confirm dialog, since there's no uuid list to hand back for undo.
	const archiveWithUndo = (bookUuids: string[]) =>
		archiveMutation.mutate(
			{ bookUuids },
			{
				onSuccess: () => {
					clearSelection();
					invalidateAll();
					toast.success(
						m["enrichment.archived_toast"]({ count: bookUuids.length }),
						{
							action: {
								label: m["enrichment.undo"](),
								onClick: () =>
									unarchiveMutation.mutate(
										{ bookUuids },
										{ onSuccess: invalidateAll },
									),
							},
						},
					);
				},
				onError: (error) => toast.error(error.message),
			},
		);
	const archiveOne = (uuid: string) => archiveWithUndo([uuid]);
	const unarchiveOne = (uuid: string) =>
		unarchiveMutation.mutate(
			{ bookUuids: [uuid] },
			mutationSettled(m["enrichment.restored_toast"]({ count: 1 })),
		);
	const openFix = (item: (typeof items)[number]) =>
		setFixTarget({
			bookUuid: item.bookUuid,
			title: item.title ?? "",
			mediaType: item.mediaType,
		});

	// ── Bulk actions ─────────────────────────────────────────────────────────
	const runBulk = (
		mutation:
			| typeof retryMutation
			| typeof approveMutation
			| typeof archiveMutation
			| typeof unarchiveMutation,
		message: string,
		extra: Record<string, unknown> = {},
	) =>
		mutation.mutate({ ...targetInput(), ...extra }, mutationSettled(message));

	const requestStop = (request: StopRequest) => setStopRequest(request);
	const confirmStop = () => {
		if (!stopRequest) return;
		const input = stopRequest.useFilter
			? { filter: filterScope }
			: { bookUuids: stopRequest.bookUuids ?? [] };
		stopMutation.mutate(
			input,
			mutationSettled(
				m["enrichment.stopped_result"]({ count: stopRequest.count }),
			),
		);
		setStopRequest(null);
	};

	// Bulk archive: explicit selections are undoable (archive now + undo toast);
	// a whole-filter archive is confirmed first.
	const bulkArchive = () => {
		if (selectAllFilter) setArchiveRequest(total);
		else archiveWithUndo([...selected]);
	};
	const confirmArchive = () => {
		archiveMutation.mutate(
			{ filter: filterScope },
			mutationSettled(
				m["enrichment.archived_toast"]({ count: archiveRequest ?? 0 }),
			),
		);
		setArchiveRequest(null);
	};

	const goToPage = (page: number) => setOffset((page - 1) * PAGE_SIZE);

	const emptyDescription =
		bucket === "attention"
			? m["enrichment.empty_attention_desc"]()
			: bucket === "stopped"
				? m["enrichment.empty_stopped_desc"]()
				: bucket === "completed"
					? m["enrichment.empty_completed_desc"]()
					: bucket === "history"
						? m["enrichment.empty_history_desc"]()
						: m["enrichment.empty_in_progress_desc"]();

	// When the current bucket is empty, point the user at the most relevant
	// non-empty one — a nudge instead of a surprising auto-switch on load.
	const SUGGEST_ORDER: Bucket[] = [
		"attention",
		"in_progress",
		"stopped",
		"completed",
		"history",
	];
	const suggestedBucket =
		items.length === 0 && counts
			? SUGGEST_ORDER.find((key) => key !== bucket && (counts[key] ?? 0) > 0)
			: undefined;

	return (
		<div
			className={cn(
				"flex flex-col gap-6 p-4 sm:p-6 lg:p-8",
				inSelectionMode && "pb-40 sm:pb-28",
			)}
		>
			<div className="flex flex-wrap items-start justify-between gap-3">
				<div className="flex flex-col gap-1">
					<h1 className="font-bold text-2xl tracking-tight">
						{m["enrichment.title"]()}
					</h1>
					<p className="text-muted-foreground text-sm">
						{m["enrichment.subtitle"]()}
					</p>
				</div>
				<div className="flex items-center gap-2">
					{/* The tray polls itself; the spinner is the "it's live" signal and
					    the button is the escape hatch when you don't want to wait. */}
					<Button
						variant="ghost"
						size="sm"
						onClick={() => refetchList()}
						aria-label={m["enrichment.refresh_now"]()}
					>
						<ArrowClockwise
							data-icon="inline-start"
							className={cn(isFetching && "animate-spin")}
						/>
						{isFetching
							? m["enrichment.updating"]()
							: m["enrichment.refresh_now"]()}
					</Button>
					{/* Pause is only meaningful when work is running or already paused —
					    keep it out of the way when the tray is idle. */}
					{(isPaused || (counts?.in_progress ?? 0) > 0) && (
						<Button
							variant="outline"
							size="sm"
							onClick={() => togglePause(!isPaused)}
							disabled={pausePending}
						>
							{isPaused ? (
								<Play data-icon="inline-start" weight="fill" />
							) : (
								<Pause data-icon="inline-start" />
							)}
							{isPaused
								? m["enrichment.resume_enrichment"]()
								: singleLibrary
									? m["enrichment.pause_enrichment"]()
									: m["enrichment.pause_enrichment_all"]()}
						</Button>
					)}
				</div>
			</div>

			{isPaused && (
				<div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-amber-700 text-sm dark:text-amber-400">
					<Pause weight="fill" className="size-4 shrink-0" />
					<span className="flex-1">
						{singleLibrary
							? m["enrichment.paused_banner"]()
							: m["enrichment.paused_banner_all"]()}
					</span>
					<Button
						variant="ghost"
						size="sm"
						onClick={() => togglePause(false)}
						disabled={pausePending}
					>
						<Play data-icon="inline-start" weight="fill" />
						{m["enrichment.resume_enrichment"]()}
					</Button>
				</div>
			)}

			{/* One consolidated banner. With a library selected it opens a dialog to
			    disable several providers at once (single reprocess); spanning all
			    libraries it's informational — you must pick a library to fix. */}
			{failureBanners.length > 0 && (
				<div className="flex flex-col gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-2.5 text-destructive text-sm sm:flex-row sm:items-center">
					<div className="flex flex-1 items-start gap-2">
						<Warning weight="fill" className="mt-0.5 size-4 shrink-0" />
						<span>
							{singleLibrary
								? m["enrichment.providers_failed_here"]({
										providers: failureBanners
											.map(([provider]) => providerLabels[provider] ?? provider)
											.join(", "),
									})
								: m["enrichment.providers_failed_summary"]({
										providers: failureBanners
											.map(([provider]) => providerLabels[provider] ?? provider)
											.join(", "),
									})}
						</span>
					</div>
					<div className="flex shrink-0 items-center justify-end gap-1.5">
						{!onlyFailures && (
							<Button
								variant="ghost"
								size="sm"
								onClick={() => patchFilters({ failures: true })}
							>
								{m["enrichment.view_affected"]()}
							</Button>
						)}
						{singleLibrary && (
							<Button
								variant="destructive"
								size="sm"
								onClick={() => setProviderFixOpen(true)}
							>
								<Prohibit data-icon="inline-start" />
								{m["enrichment.review_providers"]()}
							</Button>
						)}
					</div>
				</div>
			)}

			{cooldowns.length > 0 && (
				<div className="flex flex-col gap-2">
					{cooldowns.map(([provider, ms]) => (
						<div
							key={provider}
							className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-amber-700 text-sm dark:text-amber-400"
						>
							<Warning weight="fill" className="size-4 shrink-0" />
							{m["enrichment.cooldown_strip"]({
								provider: providerLabels[provider] ?? provider,
								minutes: minutesFromMs(ms),
							})}
						</div>
					))}
				</div>
			)}

			<div className="flex flex-wrap items-center gap-2">
				{BUCKETS.map((key) => (
					<button
						key={key}
						type="button"
						onClick={() => applyBucket(key)}
						className={cn(
							"inline-flex h-8 items-center gap-1.5 rounded-full border px-3 font-medium text-sm transition-colors",
							bucket === key
								? "border-primary bg-primary text-primary-foreground"
								: "border-border/60 bg-card/60 text-muted-foreground hover:text-foreground",
						)}
					>
						{BUCKET_LABELS[key]()}
						{counts?.[key] != null && (
							<span
								className={cn(
									"rounded-full px-1.5 text-xs tabular-nums",
									bucket === key ? "bg-primary-foreground/20" : "bg-muted",
								)}
							>
								{counts[key]}
							</span>
						)}
					</button>
				))}
				<BucketHelp bucket={bucket} />
				<div className="flex w-full flex-wrap items-center gap-2 sm:ms-auto sm:w-auto">
					<Select
						value={libraryUuid}
						onValueChange={(value) =>
							patchFilters({
								library: value === ALL_LIBRARIES ? undefined : value,
							})
						}
						items={[
							{ value: ALL_LIBRARIES, label: m["enrichment.all_libraries"]() },
							...(libraries ?? []).map((library) => ({
								value: library.uuid,
								label: library.name ?? library.uuid,
							})),
						]}
					>
						<SelectTrigger className="h-8 w-full sm:w-44">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectGroup>
								<SelectItem value={ALL_LIBRARIES}>
									{m["enrichment.all_libraries"]()}
								</SelectItem>
								{(libraries ?? []).map((library) => (
									<SelectItem key={library.uuid} value={library.uuid}>
										{library.name ?? library.uuid}
									</SelectItem>
								))}
							</SelectGroup>
						</SelectContent>
					</Select>
					<Select
						value={mediaType}
						onValueChange={(value) =>
							patchFilters({
								type:
									value === ALL_TYPES ? undefined : (value as MediaTypeFilter),
							})
						}
						items={[
							{ value: ALL_TYPES, label: m["enrichment.all_types"]() },
							{ value: "ebook", label: m["enrichment.type_ebook"]() },
							{ value: "audiobook", label: m["enrichment.type_audiobook"]() },
						]}
					>
						<SelectTrigger className="h-8 flex-1 sm:w-40 sm:flex-none">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectGroup>
								<SelectItem value={ALL_TYPES}>
									{m["enrichment.all_types"]()}
								</SelectItem>
								<SelectItem value="ebook">
									{m["enrichment.type_ebook"]()}
								</SelectItem>
								<SelectItem value="audiobook">
									{m["enrichment.type_audiobook"]()}
								</SelectItem>
							</SelectGroup>
						</SelectContent>
					</Select>
					<Select
						value={sort}
						onValueChange={(value) =>
							patchFilters(
								{ sort: value === "recent" ? undefined : (value as Sort) },
								{ keepSelection: true },
							)
						}
						items={[
							{ value: "recent", label: m["enrichment.sort_recent"]() },
							{ value: "oldest", label: m["enrichment.sort_oldest"]() },
							{ value: "title", label: m["enrichment.sort_title"]() },
						]}
					>
						<SelectTrigger className="h-8 flex-1 sm:w-40 sm:flex-none">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectGroup>
								<SelectItem value="recent">
									{m["enrichment.sort_recent"]()}
								</SelectItem>
								<SelectItem value="oldest">
									{m["enrichment.sort_oldest"]()}
								</SelectItem>
								<SelectItem value="title">
									{m["enrichment.sort_title"]()}
								</SelectItem>
							</SelectGroup>
						</SelectContent>
					</Select>
					<Button
						variant={onlyFailures ? "default" : "outline"}
						size="sm"
						onClick={() =>
							patchFilters({ failures: onlyFailures ? undefined : true })
						}
						aria-pressed={onlyFailures}
					>
						<Warning data-icon="inline-start" />
						{m["enrichment.only_failures"]()}
					</Button>
					<div className="relative w-full sm:w-56">
						<MagnifyingGlass className="absolute start-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
						<Input
							value={search}
							onChange={(event) => {
								setSearch(event.target.value);
								setOffset(0);
							}}
							placeholder={m["enrichment.search_placeholder"]()}
							className="h-8 w-full ps-8"
						/>
					</div>
				</div>
			</div>

			<LifecycleFilterRow
				bucket={bucket}
				active={lifecycle}
				counts={data?.lifecycleCounts}
				onSelect={(next) => patchFilters({ lifecycle: next })}
			/>

			{isLoading && (
				<div className="flex flex-col gap-2">
					{["s1", "s2", "s3", "s4", "s5"].map((id) => (
						<Skeleton key={id} className="h-16 w-full rounded-xl" />
					))}
				</div>
			)}

			{!isLoading && items.length === 0 && (
				<EmptyState
					title={m["enrichment.empty_title"]()}
					description={emptyDescription}
				>
					{suggestedBucket && (
						<Button
							variant="outline"
							onClick={() => applyBucket(suggestedBucket)}
						>
							{m["enrichment.empty_goto"]({
								bucket: BUCKET_LABELS[suggestedBucket](),
								count: counts?.[suggestedBucket] ?? 0,
							})}
						</Button>
					)}
				</EmptyState>
			)}

			{!isLoading && items.length > 0 && (
				<div
					className={cn(
						"flex flex-col gap-2 transition-opacity",
						isPlaceholderData && "pointer-events-none opacity-50",
					)}
				>
					<div className="flex flex-wrap items-center gap-2 px-1 text-muted-foreground text-xs">
						<Checkbox
							checked={allPageSelected}
							onCheckedChange={toggleSelectPage}
							aria-label={m["enrichment.select_page"]()}
						/>
						<button
							type="button"
							onClick={toggleSelectPage}
							className="hover:text-foreground"
						>
							{m["enrichment.select_page"]()}
						</button>
						{allPageSelected &&
							total > pageUuids.length &&
							!selectAllFilter && (
								<button
									type="button"
									onClick={() => setSelectAllFilter(true)}
									className="font-medium text-primary hover:underline"
								>
									{m["enrichment.select_all_results"]({ count: total })}
								</button>
							)}
						{selectAllFilter && (
							<span className="font-medium text-primary">
								{m["enrichment.selected_count"]({ count: total })}
							</span>
						)}
					</div>
					{items.map((item) => (
						<EnrichmentRow
							key={item.bookUuid}
							item={item}
							selected={selected.has(item.bookUuid) || selectAllFilter}
							onToggle={() => toggleSelected(item.bookUuid)}
							providerLabels={providerLabels}
							providerUrlTemplates={data?.providerUrlTemplates}
							busy={busy}
							onRetry={() => retryOne(item.bookUuid)}
							onRefresh={() => retryOne(item.bookUuid, true)}
							onCancelRetry={() => cancelRetryOne(item.bookUuid)}
							onApprove={() => approveOne(item.bookUuid)}
							onStop={() =>
								requestStop({ bookUuids: [item.bookUuid], count: 1 })
							}
							onArchive={() => archiveOne(item.bookUuid)}
							onUnarchive={() => unarchiveOne(item.bookUuid)}
							onFix={() => openFix(item)}
							onDetail={() => setDetailUuid(item.bookUuid)}
						/>
					))}
				</div>
			)}

			{!isLoading && total > 0 && (
				<div className="flex flex-col items-center justify-between gap-3 sm:flex-row">
					<p className="text-muted-foreground text-xs tabular-nums">
						{m["enrichment.showing_range"]({
							from: offset + 1,
							to: Math.min(offset + PAGE_SIZE, total),
							total,
						})}
					</p>
					<nav
						aria-label={m["enrichment.pagination"]()}
						className="flex items-center gap-1"
					>
						<Button
							size="icon-sm"
							variant="outline"
							onClick={() => goToPage(currentPage - 1)}
							disabled={currentPage === 1}
							aria-label={m["enrichment.previous_page"]()}
						>
							<CaretLeft />
						</Button>
						{paginationPages.map((page, index) => {
							const previousPage = paginationPages[index - 1];
							return (
								<Fragment key={page}>
									{previousPage != null && page - previousPage > 1 && (
										<span
											aria-hidden="true"
											className="px-1 text-muted-foreground text-sm"
										>
											…
										</span>
									)}
									<Button
										size="icon-sm"
										variant={page === currentPage ? "default" : "outline"}
										onClick={() => goToPage(page)}
										aria-current={page === currentPage ? "page" : undefined}
										aria-label={m["enrichment.go_to_page"]({ page })}
									>
										{page}
									</Button>
								</Fragment>
							);
						})}
						<Button
							size="icon-sm"
							variant="outline"
							onClick={() => goToPage(currentPage + 1)}
							disabled={currentPage === totalPages}
							aria-label={m["enrichment.next_page"]()}
						>
							<CaretRight />
						</Button>
					</nav>
				</div>
			)}

			{inSelectionMode && (
				<div className="sticky bottom-20 z-10 flex justify-center sm:bottom-4">
					<div
						role="toolbar"
						aria-label={m["enrichment.bulk_actions"]()}
						className="flex max-w-full flex-wrap items-center justify-center gap-1.5 rounded-2xl bg-floating-action p-2 text-floating-action-foreground shadow-xl"
					>
						<span className="px-2 font-medium text-sm tabular-nums">
							{m["enrichment.selected_count"]({ count: selectionCount })}
						</span>
						<div className="mx-1 h-5 w-px bg-floating-action-foreground/20" />
						<SelectionActions
							bucket={bucket}
							busy={busy}
							eligibility={selectAllFilter ? eligibility : undefined}
							onRetry={() =>
								runBulk(
									retryMutation,
									m["enrichment.retry_enqueued"]({ count: selectionCount }),
								)
							}
							onApprove={() =>
								runBulk(
									approveMutation,
									m["enrichment.approve_enqueued"]({ count: selectionCount }),
								)
							}
							onStop={() =>
								requestStop({
									useFilter: selectAllFilter,
									bookUuids: selectAllFilter ? undefined : [...selected],
									count: selectionCount,
								})
							}
							onArchive={bulkArchive}
							onRestore={() =>
								runBulk(
									unarchiveMutation,
									m["enrichment.restored_toast"]({ count: selectionCount }),
								)
							}
						/>
						<Button
							size="sm"
							variant="ghost"
							onClick={clearSelection}
							disabled={busy}
						>
							{m["enrichment.clear_selection"]()}
						</Button>
					</div>
				</div>
			)}

			<Modal
				open={stopRequest != null}
				onOpenChange={(open) => !open && setStopRequest(null)}
				title={m["enrichment.stop_confirm_title"]({
					count: stopRequest?.count ?? 0,
				})}
				description={m["enrichment.stop_confirm_body"]()}
			>
				<div className="flex justify-end gap-2">
					<Button variant="outline" onClick={() => setStopRequest(null)}>
						{m["enrichment.action_cancel"]()}
					</Button>
					<Button
						variant="destructive"
						onClick={confirmStop}
						disabled={stopMutation.isPending}
					>
						{stopMutation.isPending ? (
							<CircleNotch data-icon="inline-start" className="animate-spin" />
						) : (
							<Prohibit data-icon="inline-start" />
						)}
						{m["enrichment.stop_confirm_cta"]()}
					</Button>
				</div>
			</Modal>

			<Modal
				open={archiveRequest != null}
				onOpenChange={(open) => !open && setArchiveRequest(null)}
				title={m["enrichment.archive_confirm_title"]({
					count: archiveRequest ?? 0,
				})}
				description={m["enrichment.archive_confirm_body"]()}
			>
				<div className="flex justify-end gap-2">
					<Button variant="outline" onClick={() => setArchiveRequest(null)}>
						{m["enrichment.action_cancel"]()}
					</Button>
					<Button onClick={confirmArchive} disabled={archiveMutation.isPending}>
						{archiveMutation.isPending ? (
							<CircleNotch data-icon="inline-start" className="animate-spin" />
						) : (
							<Archive data-icon="inline-start" />
						)}
						{m["enrichment.archive_confirm_cta"]()}
					</Button>
				</div>
			</Modal>

			<ProviderFixDialog
				open={providerFixOpen}
				onOpenChange={setProviderFixOpen}
				failures={failureBanners}
				providerLabels={providerLabels}
				reprocessCount={providerStatus?.failingBooks ?? 0}
				pending={resolveProviderMutation.isPending}
				onConfirm={(providers) =>
					resolveProviderMutation.mutate({ libraryUuid, providers })
				}
			/>

			<EnrichmentDetailModal
				bookUuid={detailUuid}
				onClose={() => setDetailUuid(null)}
				providerLabels={providerLabels}
			/>

			{fixTarget?.mediaType === "ebook" && (
				<BookMatchDialog
					open
					onOpenChange={(open) => {
						if (!open) {
							setFixTarget(null);
							invalidateAll();
						}
					}}
					bookUuid={fixTarget.bookUuid}
					initialTitle={fixTarget.title}
				/>
			)}
			{fixTarget?.mediaType === "audiobook" && (
				<AudiobookMatchDialog
					open
					onOpenChange={(open) => {
						if (!open) {
							setFixTarget(null);
							invalidateAll();
						}
					}}
					audiobookUuid={fixTarget.bookUuid}
					initialTitle={fixTarget.title}
				/>
			)}
		</div>
	);
}

type RowItem = {
	bookUuid: string;
	title: string | null;
	filename: string | null;
	cover: string | null;
	mediaType: "ebook" | "audiobook";
	libraryName: string | null;
	status: EnrichmentStatus;
	lifecycle: Lifecycle;
	matched: {
		provider: string;
		providerId?: string | null;
		title?: string;
		reasons?: string[];
	}[];
	failures: { provider: string; code: string }[];
	lastRunAt: string | null;
	retry: Parameters<typeof resolveRetryView>[0];
};

function EnrichmentRow({
	item,
	selected,
	onToggle,
	providerLabels,
	providerUrlTemplates,
	busy,
	onRetry,
	onRefresh,
	onCancelRetry,
	onApprove,
	onStop,
	onArchive,
	onUnarchive,
	onFix,
	onDetail,
}: {
	item: RowItem;
	selected: boolean;
	onToggle: () => void;
	providerLabels: Record<string, string>;
	providerUrlTemplates: Record<string, string> | undefined;
	busy: boolean;
	onRetry: () => void;
	onRefresh: () => void;
	onCancelRetry: () => void;
	onApprove: () => void;
	onStop: () => void;
	onArchive: () => void;
	onUnarchive: () => void;
	onFix: () => void;
	onDetail: () => void;
}) {
	const coverFilename = getCoverFilename(item.cover);
	const matchedLabels = item.matched
		.map(({ provider }) => providerLabels[provider] ?? provider)
		.join(", ");
	const primaryMatch = item.matched[0];
	// What the pipeline actually picked, as the provider described it. Rows
	// matched before this was recorded have no title and fall back to the
	// provider list alone.
	const chosen = primaryMatch?.title;
	const chosenUrl = providerRecordUrl(
		providerUrlTemplates,
		primaryMatch?.provider,
		primaryMatch?.providerId,
	);
	// Only worth showing the source when it disagrees with what we ended up
	// with — otherwise it is the same string twice.
	const sourceName = item.filename?.replace(/\.[^./\\]+$/, "");
	const showSource = Boolean(chosen && sourceName && sourceName !== chosen);
	const firstFailure = item.failures[0];
	const {
		automaticRetryAt,
		automaticRetryCancelled,
		automaticRetryScheduled,
		providerRetryExhausted,
	} = resolveRetryView(item.retry);
	const providerName = firstFailure
		? (providerLabels[firstFailure.provider] ?? firstFailure.provider)
		: "";

	return (
		<div className="flex flex-col gap-2 rounded-xl border border-border/60 bg-card/60 px-3 py-3 sm:flex-row sm:items-center sm:gap-3 sm:px-4">
			<div className="flex min-w-0 flex-1 items-center gap-3">
				<Checkbox
					checked={selected}
					onCheckedChange={onToggle}
					aria-label={item.title ?? item.bookUuid}
				/>
				{coverFilename ? (
					<img
						src={getCoverUrl(coverFilename, coverPresets.activity.widths[1])}
						alt=""
						loading="lazy"
						className="h-14 w-10 shrink-0 rounded object-cover"
					/>
				) : (
					<div className="h-14 w-10 shrink-0 rounded bg-muted" />
				)}
				<div className="min-w-0 flex-1">
					<div className="flex min-w-0 items-center gap-2">
						<Link
							to={
								item.mediaType === "audiobook"
									? "/dashboard/audiobooks/$uuid"
									: "/dashboard/books/$uuid"
							}
							params={{ uuid: item.bookUuid }}
							className="truncate font-medium text-sm hover:underline"
						>
							{item.title ?? item.bookUuid}
						</Link>
						<LifecycleChip lifecycle={item.lifecycle} />
					</div>
					{/* What the automatic match chose, so a reviewer can judge the row
					    without opening it. */}
					{chosen && (
						<p className="mt-1 flex min-w-0 items-center gap-1.5 text-xs">
							{showSource && (
								<>
									<span
										className="truncate text-muted-foreground"
										title={sourceName ?? undefined}
									>
										{sourceName}
									</span>
									<ArrowRight className="size-3 shrink-0 text-muted-foreground/60" />
								</>
							)}
							<span className="truncate font-medium" title={chosen}>
								{chosen}
							</span>
							{chosenUrl ? (
								<a
									href={chosenUrl}
									target="_blank"
									rel="noreferrer noopener"
									className="inline-flex shrink-0 items-center gap-0.5 text-muted-foreground hover:text-foreground"
								>
									{providerLabels[primaryMatch.provider] ??
										primaryMatch.provider}
									<ArrowSquareOut className="size-3" />
								</a>
							) : (
								<span className="shrink-0 text-muted-foreground">
									{providerLabels[primaryMatch.provider] ??
										primaryMatch.provider}
								</span>
							)}
							{primaryMatch.reasons?.length ? (
								<MatchReasonChip reasons={primaryMatch.reasons} />
							) : null}
						</p>
					)}
					<p className="mt-0.5 truncate text-muted-foreground text-xs">
						{item.libraryName && <span>{item.libraryName} · </span>}
						{item.matched.length > 0 && !chosen && (
							<span>
								{m["enrichment.matched_via"]({ providers: matchedLabels })}
							</span>
						)}
						{firstFailure && (
							<span className="text-amber-600 dark:text-amber-400">
								{item.matched.length > 0 && " · "}
								{automaticRetryCancelled
									? m["enrichment.retry_cancelled_summary"]({
											provider: providerName,
										})
									: automaticRetryScheduled && automaticRetryAt
										? m["enrichment.automatic_retry_summary"]({
												provider: providerName,
												minutes: minutesFromMs(
													automaticRetryAt.getTime() - Date.now(),
												),
											})
										: providerRetryExhausted
											? m["enrichment.retry_exhausted_summary"]({
													provider: providerName,
												})
											: m["enrichment.provider_failure_summary"]({
													provider: providerName,
													reason: failureLabel(firstFailure.code),
												})}
							</span>
						)}
						{item.matched.length === 0 && !firstFailure && (
							<span>
								{item.lastRunAt
									? m["enrichment.last_run"]({
											date: formatDate(item.lastRunAt),
										})
									: m["enrichment.never_ran"]()}
							</span>
						)}
					</p>
				</div>
			</div>
			<div className="flex shrink-0 items-center justify-end gap-1.5">
				<PrimaryAction
					lifecycle={item.lifecycle}
					busy={busy}
					onRetry={onRetry}
					onCancelRetry={onCancelRetry}
					onApprove={onApprove}
					onStop={onStop}
					onFix={onFix}
					onUnarchive={onUnarchive}
					onDetail={onDetail}
				/>
				<RowMenu
					lifecycle={item.lifecycle}
					onRetry={onRetry}
					onRefresh={onRefresh}
					onApprove={onApprove}
					onStop={onStop}
					onArchive={onArchive}
					onUnarchive={onUnarchive}
					onFix={onFix}
					onDetail={onDetail}
				/>
			</div>
		</div>
	);
}

function PrimaryAction({
	lifecycle,
	busy,
	onRetry,
	onCancelRetry,
	onApprove,
	onStop,
	onFix,
	onUnarchive,
	onDetail,
}: {
	lifecycle: Lifecycle;
	busy: boolean;
	onRetry: () => void;
	onCancelRetry: () => void;
	onApprove: () => void;
	onStop: () => void;
	onFix: () => void;
	onUnarchive: () => void;
	onDetail: () => void;
}) {
	switch (lifecycle) {
		case "running":
			return (
				<Button size="sm" variant="outline" onClick={onStop} disabled={busy}>
					<Prohibit data-icon="inline-start" />
					{m["enrichment.action_stop"]()}
				</Button>
			);
		case "scheduled":
			return (
				<Button
					size="sm"
					variant="outline"
					onClick={onCancelRetry}
					disabled={busy}
				>
					<XCircle data-icon="inline-start" />
					{m["enrichment.cancel_retry"]()}
				</Button>
			);
		case "review":
			return (
				<Button size="sm" onClick={onApprove} disabled={busy}>
					<CheckCircle data-icon="inline-start" />
					{m["enrichment.approve"]()}
				</Button>
			);
		case "no_match":
		case "partial":
			return (
				<Button size="sm" variant="outline" onClick={onFix}>
					<PencilSimple data-icon="inline-start" />
					{m["enrichment.fix_match"]()}
				</Button>
			);
		case "failed":
			return (
				<Button size="sm" variant="outline" onClick={onRetry} disabled={busy}>
					<ArrowClockwise data-icon="inline-start" />
					{m["enrichment.retry"]()}
				</Button>
			);
		case "stopped":
			return (
				<Button size="sm" variant="outline" onClick={onRetry} disabled={busy}>
					<ArrowClockwise data-icon="inline-start" />
					{m["enrichment.action_reprocess"]()}
				</Button>
			);
		case "archived":
			return (
				<Button
					size="sm"
					variant="outline"
					onClick={onUnarchive}
					disabled={busy}
				>
					<ArrowCounterClockwise data-icon="inline-start" />
					{m["enrichment.action_restore"]()}
				</Button>
			);
		default:
			return (
				<Button size="sm" variant="ghost" onClick={onDetail}>
					{m["enrichment.view_detail"]()}
				</Button>
			);
	}
}

function RowMenu({
	lifecycle,
	onRetry,
	onRefresh,
	onApprove,
	onStop,
	onArchive,
	onUnarchive,
	onFix,
	onDetail,
}: {
	lifecycle: Lifecycle;
	onRetry: () => void;
	onRefresh: () => void;
	onApprove: () => void;
	onStop: () => void;
	onArchive: () => void;
	onUnarchive: () => void;
	onFix: () => void;
	onDetail: () => void;
}) {
	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button
					size="icon-sm"
					variant="ghost"
					aria-label={m["enrichment.more"]()}
				>
					<DotsThreeVertical weight="bold" />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end">
				{/* Secondary actions only — never repeat the row's primary action. */}
				{lifecycle === "scheduled" && (
					<DropdownMenuItem onClick={onRetry}>
						{m["enrichment.action_retry_now"]()}
					</DropdownMenuItem>
				)}
				{(lifecycle === "review" ||
					lifecycle === "failed" ||
					lifecycle === "stopped") && (
					<DropdownMenuItem onClick={onFix}>
						{m["enrichment.fix_match"]()}
					</DropdownMenuItem>
				)}
				{(lifecycle === "no_match" || lifecycle === "partial") && (
					<DropdownMenuItem onClick={onRetry}>
						{m["enrichment.retry"]()}
					</DropdownMenuItem>
				)}
				{lifecycle === "partial" && (
					<DropdownMenuItem onClick={onApprove}>
						{m["enrichment.approve"]()}
					</DropdownMenuItem>
				)}
				{(lifecycle === "failed" || lifecycle === "partial") && (
					<DropdownMenuItem onClick={onStop}>
						{m["enrichment.action_stop"]()}
					</DropdownMenuItem>
				)}
				{lifecycle === "done" && (
					<DropdownMenuItem onClick={onRefresh}>
						{m["enrichment.action_refresh"]()}
					</DropdownMenuItem>
				)}
				{lifecycle !== "done" && (
					<DropdownMenuItem onClick={onDetail}>
						{m["enrichment.view_detail"]()}
					</DropdownMenuItem>
				)}
				<DropdownMenuSeparator />
				{lifecycle === "archived" ? (
					<DropdownMenuItem onClick={onUnarchive}>
						{m["enrichment.action_restore"]()}
					</DropdownMenuItem>
				) : (
					<DropdownMenuItem onClick={onArchive}>
						{m["enrichment.action_archive"]()}
					</DropdownMenuItem>
				)}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

function SelectionActions({
	bucket,
	busy,
	eligibility,
	onRetry,
	onApprove,
	onStop,
	onArchive,
	onRestore,
}: {
	bucket: Bucket;
	busy: boolean;
	eligibility?: {
		retryable: number;
		stoppable: number;
		approvable: number;
		archivable: number;
		restorable: number;
	};
	onRetry: () => void;
	onApprove: () => void;
	onStop: () => void;
	onArchive: () => void;
	onRestore: () => void;
}) {
	const hint = (count: number | undefined) =>
		count == null ? null : (
			<span className="ms-1 text-floating-action-foreground/70 text-xs tabular-nums">
				{count}
			</span>
		);

	if (bucket === "history") {
		return (
			<Button
				size="sm"
				variant="secondary"
				onClick={onRestore}
				disabled={busy || eligibility?.restorable === 0}
			>
				<ArrowCounterClockwise data-icon="inline-start" />
				{m["enrichment.action_restore"]()}
				{hint(eligibility?.restorable)}
			</Button>
		);
	}

	return (
		<>
			{bucket !== "completed" && (
				<Button
					size="sm"
					variant="secondary"
					onClick={onRetry}
					disabled={busy || eligibility?.retryable === 0}
				>
					<ArrowClockwise data-icon="inline-start" />
					{bucket === "stopped"
						? m["enrichment.action_reprocess"]()
						: m["enrichment.retry"]()}
					{hint(eligibility?.retryable)}
				</Button>
			)}
			{bucket === "attention" && (
				<Button
					size="sm"
					variant="secondary"
					onClick={onApprove}
					disabled={busy || eligibility?.approvable === 0}
				>
					<CheckCircle data-icon="inline-start" />
					{m["enrichment.approve"]()}
					{hint(eligibility?.approvable)}
				</Button>
			)}
			{(bucket === "in_progress" || bucket === "attention") && (
				<Button
					size="sm"
					variant="destructive"
					onClick={onStop}
					disabled={busy || eligibility?.stoppable === 0}
				>
					<Prohibit data-icon="inline-start" />
					{m["enrichment.action_stop"]()}
					{hint(eligibility?.stoppable)}
				</Button>
			)}
			<Button
				size="sm"
				variant="secondary"
				onClick={onArchive}
				disabled={busy || eligibility?.archivable === 0}
			>
				<Archive data-icon="inline-start" />
				{m["enrichment.action_archive"]()}
				{hint(eligibility?.archivable)}
			</Button>
		</>
	);
}

function ProviderFixDialog({
	open,
	onOpenChange,
	failures,
	providerLabels,
	reprocessCount,
	pending,
	onConfirm,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	failures: [string, number][];
	providerLabels: Record<string, string>;
	reprocessCount: number;
	pending: boolean;
	onConfirm: (providers: string[]) => void;
}) {
	// Providers start all-checked; reset the selection each time the dialog opens.
	const [unchecked, setUnchecked] = useState<Set<string>>(new Set());
	const wasOpen = useRef(open);
	if (open && !wasOpen.current) {
		wasOpen.current = true;
		if (unchecked.size > 0) setUnchecked(new Set());
	} else if (!open && wasOpen.current) {
		wasOpen.current = false;
	}

	const selected = failures
		.map(([provider]) => provider)
		.filter((provider) => !unchecked.has(provider));

	const toggle = (provider: string) =>
		setUnchecked((prev) => {
			const next = new Set(prev);
			if (next.has(provider)) next.delete(provider);
			else next.add(provider);
			return next;
		});

	return (
		<Modal
			open={open}
			onOpenChange={onOpenChange}
			title={m["enrichment.fix_providers_title"]()}
			description={m["enrichment.fix_providers_body"]()}
			className="sm:max-w-lg"
		>
			<div className="flex flex-col gap-4">
				<div className="flex flex-col gap-1.5">
					{failures.map(([provider, count]) => {
						const label = providerLabels[provider] ?? provider;
						return (
							<button
								key={provider}
								type="button"
								onClick={() => toggle(provider)}
								aria-pressed={!unchecked.has(provider)}
								className="flex items-center gap-3 rounded-lg border border-border/60 px-3 py-2.5 text-start text-sm hover:bg-muted/50"
							>
								<Checkbox
									checked={!unchecked.has(provider)}
									aria-hidden
									tabIndex={-1}
									className="pointer-events-none"
								/>
								<span className="flex-1 font-medium">{label}</span>
								<span className="text-muted-foreground text-xs tabular-nums">
									{m["enrichment.fix_providers_count"]({ count })}
								</span>
							</button>
						);
					})}
				</div>
				<p className="text-muted-foreground text-xs">
					{selected.length === 0
						? m["enrichment.fix_providers_none"]()
						: m["enrichment.fix_providers_reprocess"]({
								count: reprocessCount,
							})}
				</p>
				<div className="flex justify-end gap-2">
					<Button variant="outline" onClick={() => onOpenChange(false)}>
						{m["enrichment.action_cancel"]()}
					</Button>
					<Button
						variant="destructive"
						onClick={() => onConfirm(selected)}
						disabled={pending || selected.length === 0}
					>
						{pending ? (
							<CircleNotch data-icon="inline-start" className="animate-spin" />
						) : (
							<Prohibit data-icon="inline-start" />
						)}
						{m["enrichment.fix_providers_cta"]()}
					</Button>
				</div>
			</div>
		</Modal>
	);
}

function EnrichmentDetailModal({
	bookUuid,
	onClose,
	providerLabels,
}: {
	bookUuid: string | null;
	onClose: () => void;
	providerLabels: Record<string, string>;
}) {
	const { data: detail, isLoading } = useQuery({
		...orpc.enrichment.detail.queryOptions({
			input: { bookUuid: bookUuid ?? "" },
		}),
		enabled: bookUuid != null,
		staleTime: 0,
		refetchOnMount: "always",
	});

	const labels = detail?.providerLabels ?? providerLabels;
	const fieldSources = Object.entries(detail?.fieldSources ?? {});
	const locked = new Set(detail?.lockedFields ?? []);

	return (
		<Modal
			open={bookUuid != null}
			onOpenChange={(open) => !open && onClose()}
			title={m["enrichment.detail_title"]()}
			description={detail?.title ?? undefined}
			className="sm:max-w-2xl"
		>
			{isLoading && <Skeleton className="h-48 w-full rounded-xl" />}

			{!isLoading && detail && detail.status == null && (
				<p className="text-muted-foreground text-sm">
					{m["enrichment.no_state"]()}
				</p>
			)}

			{!isLoading && detail && detail.status != null && (
				<div className="flex flex-col gap-5">
					{detail.status === "review" && (
						<div className="flex items-start gap-2 rounded-lg border border-sky-500/30 bg-sky-500/10 px-3 py-2 text-sky-700 text-sm dark:text-sky-400">
							<Warning weight="fill" className="mt-0.5 size-4 shrink-0" />
							{m["enrichment.review_hint"]()}
						</div>
					)}
					<div className="flex flex-wrap items-center gap-2">
						<Badge variant="secondary">{STATUS_LABELS[detail.status]()}</Badge>
						{(detail.attempts ?? 0) > 0 && (
							<span className="text-muted-foreground text-xs">
								{m["enrichment.attempts"]({ count: detail.attempts ?? 0 })}
							</span>
						)}
						{(detail.providerAttempts ?? 0) > 0 && (
							<span className="text-muted-foreground text-xs">
								{m["enrichment.provider_attempts"]({
									count: detail.providerAttempts ?? 0,
								})}
							</span>
						)}
						{detail.lastRunAt && (
							<span className="text-muted-foreground text-xs">
								{m["enrichment.last_run"]({
									date: formatDate(detail.lastRunAt),
								})}
							</span>
						)}
						<Link
							to={
								detail.mediaType === "audiobook"
									? "/dashboard/audiobooks/$uuid"
									: "/dashboard/books/$uuid"
							}
							params={{ uuid: detail.bookUuid }}
							className="ms-auto inline-flex items-center gap-1 text-primary text-xs hover:underline"
						>
							{m["enrichment.open_book"]()}
							<ArrowSquareOut className="size-3.5" />
						</Link>
					</div>

					{(detail.matched?.length ?? 0) > 0 && (
						<section className="flex flex-col gap-1.5">
							<h4 className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
								{m["enrichment.provider_journey"]()}
							</h4>
							{detail.matched?.map((match) => (
								<div
									key={`${match.provider}-${match.providerId}`}
									className="flex items-center gap-2 text-sm"
								>
									<span className="text-emerald-600 dark:text-emerald-400">
										✓
									</span>
									<span className="font-medium">
										{labels[match.provider] ?? match.provider}
									</span>
									{match.providerId && (
										<span className="truncate text-muted-foreground text-xs">
											{match.providerId}
										</span>
									)}
								</div>
							))}
						</section>
					)}

					{(detail.failures?.length ?? 0) > 0 && (
						<section className="flex flex-col gap-1.5">
							<h4 className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
								{m["enrichment.failures_title"]()}
							</h4>
							{detail.failures?.map((failure) => (
								<div
									key={`${failure.provider}-${failure.at}`}
									className="flex items-center gap-2 text-sm"
								>
									<span className="text-amber-600 dark:text-amber-400">✗</span>
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

					{fieldSources.length > 0 && (
						<section className="flex flex-col gap-1.5">
							<h4 className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
								{m["enrichment.field_origins"]()}
							</h4>
							{/* Books with a full manifest list ~20 fields — scroll them here
							    so the modal keeps its header and close button on screen. */}
							<div className="max-h-72 overflow-y-auto overscroll-contain rounded-lg border border-border/60">
								<table className="w-full text-sm">
									<tbody>
										{fieldSources.map(([field, source]) => (
											<tr
												key={field}
												className="border-border/40 border-b last:border-b-0"
											>
												<td className="px-3 py-1.5 font-medium">{field}</td>
												<td className="px-3 py-1.5 text-muted-foreground">
													{sourceLabel(source.p, labels)}
													{locked.has(field) && (
														<span className="ms-2 text-xs">
															🔒 {m["enrichment.locked"]()}
														</span>
													)}
												</td>
											</tr>
										))}
									</tbody>
								</table>
							</div>
						</section>
					)}
				</div>
			)}
		</Modal>
	);
}
