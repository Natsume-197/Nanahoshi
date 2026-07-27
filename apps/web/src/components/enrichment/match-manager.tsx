import {
	Archive,
	ArrowClockwise,
	ArrowCounterClockwise,
	ArrowLeft,
	ArrowsDownUp,
	CaretDown,
	CaretLeft,
	CaretRight,
	CaretUp,
	CheckCircle,
	CircleNotch,
	DotsThreeVertical,
	FunnelSimple,
	MagnifyingGlass,
	Pause,
	Play,
	Prohibit,
	Question,
	SlidersHorizontal,
	Warning,
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
import { Skeleton } from "@/components/ui/skeleton";
import { useDebounce } from "@/hooks/use-debounce";
import { useMediaQuery } from "@/hooks/use-media-query";
import { useWindowEvent } from "@/hooks/use-window-event";
import { cn } from "@/lib/utils";
import { m } from "@/paraglide/messages";
import { coverPresets, getCoverFilename, getCoverUrl } from "@/utils/covers";
import { formatRelativeTime } from "@/utils/format";
import { orpc } from "@/utils/orpc";
import {
	ALL_BUCKETS,
	ALL_LIBRARIES,
	ALL_TYPES,
	type EnrichmentBucket as Bucket,
	type BucketFilter,
	DEFAULT_BUCKET,
	type EnrichmentLifecycle as Lifecycle,
	listInputFromSearch,
	type MediaTypeFilter,
	PAGE_SIZE,
	type EnrichmentSort as Sort,
} from "./filters";
import {
	failureLabel,
	LIFECYCLE_LABELS,
	LifecycleChip,
	MatchReasonChip,
	minutesFromMs,
} from "./lifecycle";
import { MatchDetailPanel } from "./match-detail-panel";
import {
	BUCKET_LABELS,
	MatchSidebar,
	type ScopeSelection,
} from "./match-sidebar";
import { visiblePageNumbers } from "./pagination";
import { IDLE_POLL_MS, resolvePollInterval } from "./poll";
import { resolveRetryView } from "./retry-view";
import type { MatchRow, RowActions } from "./types";

type FixTarget = {
	bookUuid: string;
	title: string;
	mediaType: "ebook" | "audiobook";
};

type StopRequest = { bookUuids?: string[]; useFilter?: boolean; count: number };

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
						className="inline-flex size-7 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
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
			bucket: BucketFilter;
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
	const [detailFallback, setDetailFallback] = useState<MatchRow | null>(null);
	const [fixTarget, setFixTarget] = useState<FixTarget | null>(null);
	const [stopRequest, setStopRequest] = useState<StopRequest | null>(null);
	const [archiveRequest, setArchiveRequest] = useState<number | null>(null);
	const [providerFixOpen, setProviderFixOpen] = useState(false);
	// Debounced, not deferred: this value is part of the list query key, and
	// useDeferredValue only smooths rendering — it would still fire a request
	// (three full scans server-side) per settled keystroke.
	const debouncedSearch = useDebounce(search, 300);
	// The detail pane only earns its width on a wide screen; below that the same
	// component opens as a modal, so exactly one copy is ever mounted.
	const detailFits = useMediaQuery("(min-width: 1280px)");

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
	const items: MatchRow[] = data?.items ?? [];
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

	// The open row, preferring the live list entry so the pane follows the
	// worker; the click-time snapshot keeps it from blanking when a refresh
	// moves that book out of the current filter.
	const detailItem =
		detailUuid == null
			? null
			: (items.find((item) => item.bookUuid === detailUuid) ??
				(detailFallback?.bookUuid === detailUuid ? detailFallback : null));

	const closeDetail = () => {
		setDetailUuid(null);
		setDetailFallback(null);
	};
	const openDetail = (item: MatchRow) => {
		setDetailUuid(item.bookUuid);
		setDetailFallback(item);
	};
	const anyDialogOpen =
		stopRequest != null ||
		archiveRequest != null ||
		fixTarget != null ||
		providerFixOpen;
	// Escape closes the pane, matching what it would do if this were the modal.
	useWindowEvent("keydown", (event: KeyboardEvent) => {
		if (event.key !== "Escape" || anyDialogOpen || detailUuid == null) return;
		closeDetail();
	});

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

	const applyScope = (scope: ScopeSelection) => {
		patchFilters({ bucket: scope.bucket, lifecycle: scope.lifecycle });
		closeDetail();
	};

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
	const unarchiveOne = (uuid: string) =>
		unarchiveMutation.mutate(
			{ bookUuids: [uuid] },
			mutationSettled(m["enrichment.restored_toast"]({ count: 1 })),
		);
	const openFix = (item: MatchRow) =>
		setFixTarget({
			bookUuid: item.bookUuid,
			title: item.title ?? "",
			mediaType: item.mediaType,
		});

	const rowActions = (item: MatchRow): RowActions => ({
		onRetry: () => retryOne(item.bookUuid),
		onRefresh: () => retryOne(item.bookUuid, true),
		onCancelRetry: () => cancelRetryOne(item.bookUuid),
		onApprove: () => approveOne(item.bookUuid),
		onStop: () => setStopRequest({ bookUuids: [item.bookUuid], count: 1 }),
		onArchive: () => archiveWithUndo([item.bookUuid]),
		onUnarchive: () => unarchiveOne(item.bookUuid),
		onFix: () => openFix(item),
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

	// Sorting lives in the column headers: "Title" is the only ascending order
	// the API offers, "Updated" flips between newest and oldest.
	const toggleTitleSort = () =>
		patchFilters(
			{ sort: sort === "title" ? undefined : "title" },
			{ keepSelection: true },
		);
	const toggleUpdatedSort = () =>
		patchFilters(
			{ sort: sort === "recent" ? "oldest" : undefined },
			{ keepSelection: true },
		);

	const scopeLabel = lifecycle
		? LIFECYCLE_LABELS[lifecycle]()
		: bucket === ALL_BUCKETS
			? m["enrichment.nav_all"]()
			: BUCKET_LABELS[bucket]();

	const emptyDescription =
		bucket === "attention"
			? m["enrichment.empty_attention_desc"]()
			: bucket === "stopped"
				? m["enrichment.empty_stopped_desc"]()
				: bucket === "completed"
					? m["enrichment.empty_completed_desc"]()
					: bucket === "history"
						? m["enrichment.empty_history_desc"]()
						: bucket === "in_progress"
							? m["enrichment.empty_in_progress_desc"]()
							: m["enrichment.empty_all_desc"]();

	// When the current scope is empty, point at the most relevant non-empty one
	// — a nudge instead of a surprising auto-switch on load.
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

	const activeFilterCount =
		(mediaType !== ALL_TYPES ? 1 : 0) + (onlyFailures ? 1 : 0);

	const sidebar = (
		<MatchSidebar
			bucket={bucket}
			lifecycle={lifecycle}
			counts={counts}
			lifecycleCounts={data?.lifecycleCounts}
			libraryUuid={libraryUuid}
			libraries={libraries ?? []}
			onSelectScope={applyScope}
			onSelectLibrary={(uuid) =>
				patchFilters({ library: uuid === ALL_LIBRARIES ? undefined : uuid })
			}
		/>
	);

	return (
		<div className="flex h-full min-h-0 flex-col">
			<header className="flex shrink-0 flex-wrap items-center gap-x-2 gap-y-2 px-3 py-3 sm:px-4">
				{/* This route hides the app rail (see SELF_NAVIGATING_ROUTES), so the
				    way back to the rest of the app has to live here. */}
				<Button
					variant="ghost"
					size="icon-sm"
					asChild
					aria-label={m["nav.home"]()}
					title={m["nav.home"]()}
				>
					<Link to="/dashboard">
						<ArrowLeft />
					</Link>
				</Button>
				<h1 className="font-semibold text-lg tracking-tight">
					{m["enrichment.title"]()}
				</h1>
				<div className="ms-auto flex items-center gap-1.5">
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
						<span className="hidden sm:inline">
							{isFetching
								? m["enrichment.updating"]()
								: m["enrichment.refresh_now"]()}
						</span>
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
			</header>

			{(isPaused || failureBanners.length > 0 || cooldowns.length > 0) && (
				<div className="flex shrink-0 flex-col gap-2 px-4 pb-3 sm:px-5">
					{isPaused && (
						<div className="flex items-center gap-2 rounded-lg border border-warning/30 bg-warning/10 px-4 py-2.5 text-sm text-warning">
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

					{/* One consolidated banner. With a library selected it opens a dialog
					    to disable several providers at once (single reprocess); spanning
					    all libraries it's informational — you must pick a library. */}
					{failureBanners.length > 0 && (
						<div className="flex flex-col gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-2.5 text-destructive text-sm sm:flex-row sm:items-center">
							<div className="flex flex-1 items-start gap-2">
								<Warning weight="fill" className="mt-0.5 size-4 shrink-0" />
								<span>
									{singleLibrary
										? m["enrichment.providers_failed_here"]({
												providers: failureBanners
													.map(
														([provider]) =>
															providerLabels[provider] ?? provider,
													)
													.join(", "),
											})
										: m["enrichment.providers_failed_summary"]({
												providers: failureBanners
													.map(
														([provider]) =>
															providerLabels[provider] ?? provider,
													)
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

					{cooldowns.map(([provider, ms]) => (
						<div
							key={provider}
							className="flex items-center gap-2 rounded-lg border border-warning/30 bg-warning/10 px-4 py-2.5 text-sm text-warning"
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

			<div className="flex min-h-0 flex-1 border-border/60 border-t">
				<div className="hidden w-56 shrink-0 overflow-y-auto overscroll-contain border-border/60 border-e px-2 py-2 lg:block">
					{sidebar}
				</div>

				<section className="flex min-h-0 min-w-0 flex-1 flex-col">
					<div className="flex shrink-0 items-center gap-2 border-border/60 border-b px-3 py-2.5">
						{/* Below lg the nav collapses into the scope button, which is also
						    the label for where you are. */}
						<Popover>
							<PopoverTrigger
								render={
									<Button variant="outline" size="sm" className="lg:hidden">
										<FunnelSimple data-icon="inline-start" />
										{scopeLabel}
									</Button>
								}
							/>
							<PopoverContent
								align="start"
								className="max-h-[70vh] w-60 overflow-y-auto p-2"
							>
								{sidebar}
							</PopoverContent>
						</Popover>
						<div className="hidden items-center gap-1 lg:flex">
							<h2 className="font-medium text-sm">{scopeLabel}</h2>
							{bucket !== ALL_BUCKETS && <BucketHelp bucket={bucket} />}
						</div>

						<div className="relative ms-auto w-full min-w-0 max-w-72 flex-1">
							<MagnifyingGlass className="pointer-events-none absolute start-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
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

						<Popover>
							<PopoverTrigger
								render={
									<Button
										variant={activeFilterCount > 0 ? "secondary" : "ghost"}
										size="sm"
										aria-label={m["enrichment.filters"]()}
									>
										<SlidersHorizontal data-icon="inline-start" />
										<span className="hidden sm:inline">
											{m["enrichment.filters"]()}
										</span>
										{activeFilterCount > 0 && (
											<span className="tabular-nums">{activeFilterCount}</span>
										)}
									</Button>
								}
							/>
							<PopoverContent align="end" className="w-64">
								<div className="flex flex-col gap-4">
									<div className="flex flex-col gap-1.5">
										<p className="font-medium text-xs">
											{m["enrichment.all_types"]()}
										</p>
										<div className="flex gap-1.5">
											{(
												[
													[ALL_TYPES, m["enrichment.all_types"]()],
													["ebook", m["enrichment.type_ebook"]()],
													["audiobook", m["enrichment.type_audiobook"]()],
												] as const
											).map(([value, label]) => (
												<button
													key={value}
													type="button"
													onClick={() =>
														patchFilters({
															type:
																value === ALL_TYPES
																	? undefined
																	: (value as MediaTypeFilter),
														})
													}
													aria-pressed={mediaType === value}
													className={cn(
														"h-7 flex-1 rounded-lg border px-2 text-xs transition-colors",
														mediaType === value
															? "border-primary/40 bg-primary/12 font-medium text-foreground"
															: "border-border/60 text-muted-foreground hover:text-foreground",
													)}
												>
													{label}
												</button>
											))}
										</div>
									</div>
									<button
										type="button"
										onClick={() =>
											patchFilters({
												failures: onlyFailures ? undefined : true,
											})
										}
										aria-pressed={onlyFailures}
										className="flex items-center gap-2.5 text-start text-sm"
									>
										<Checkbox
											checked={onlyFailures}
											aria-hidden
											tabIndex={-1}
											className="pointer-events-none"
										/>
										{m["enrichment.only_failures"]()}
									</button>
								</div>
							</PopoverContent>
						</Popover>
					</div>

					<div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
						{isLoading && (
							<div className="flex flex-col gap-px p-3">
								{["s1", "s2", "s3", "s4", "s5", "s6", "s7", "s8"].map((id) => (
									<Skeleton key={id} className="h-13 w-full rounded-lg" />
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
										onClick={() => applyScope({ bucket: suggestedBucket })}
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
									"transition-opacity",
									isPlaceholderData && "pointer-events-none opacity-50",
								)}
							>
								<div className="sticky top-0 z-10 flex items-center border-border/60 border-b bg-background text-muted-foreground text-xs">
									<div className="flex w-11 shrink-0 justify-center">
										<Checkbox
											checked={allPageSelected}
											onCheckedChange={toggleSelectPage}
											aria-label={m["enrichment.select_page"]()}
										/>
									</div>
									<div className={cn("min-w-0 flex-1 py-2 pe-2", ROW_COLUMNS)}>
										<SortHeader
											label={m["enrichment.col_book"]()}
											active={sort === "title"}
											direction="asc"
											onClick={toggleTitleSort}
										/>
										<span className="hidden font-medium xl:block">
											{m["enrichment.col_match"]()}
										</span>
										<span className="hidden font-medium md:block">
											{m["enrichment.col_status"]()}
										</span>
										<SortHeader
											className="hidden lg:inline-flex"
											label={m["enrichment.col_updated"]()}
											active={sort === "recent" || sort === "oldest"}
											direction={sort === "oldest" ? "asc" : "desc"}
											onClick={toggleUpdatedSort}
										/>
									</div>
									<div className="w-9 shrink-0" />
								</div>
								<ul>
									{items.map((item) => (
										<EnrichmentRow
											key={item.bookUuid}
											item={item}
											selected={selected.has(item.bookUuid) || selectAllFilter}
											open={item.bookUuid === detailUuid}
											onToggle={() => toggleSelected(item.bookUuid)}
											onOpen={() => openDetail(item)}
											providerLabels={providerLabels}
											actions={rowActions(item)}
										/>
									))}
								</ul>
							</div>
						)}
					</div>

					{inSelectionMode && (
						<div
							role="toolbar"
							aria-label={m["enrichment.bulk_actions"]()}
							className="flex shrink-0 flex-wrap items-center gap-1.5 border-border/60 border-t bg-muted/40 px-3 py-2"
						>
							<span className="ps-1 font-medium text-sm tabular-nums">
								{m["enrichment.selected_count"]({ count: selectionCount })}
							</span>
							{allPageSelected &&
								total > pageUuids.length &&
								!selectAllFilter && (
									<button
										type="button"
										onClick={() => setSelectAllFilter(true)}
										className="font-medium text-primary text-sm hover:underline"
									>
										{m["enrichment.select_all_results"]({ count: total })}
									</button>
								)}
							<div className="mx-1 h-5 w-px bg-border" />
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
									setStopRequest({
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
								className="ms-auto"
								onClick={clearSelection}
								disabled={busy}
							>
								{m["enrichment.clear_selection"]()}
							</Button>
						</div>
					)}

					{!isLoading && total > 0 && (
						<div className="flex shrink-0 items-center justify-between gap-3 border-border/60 border-t px-3 py-2">
							<p className="text-muted-foreground text-xs tabular-nums">
								{m["enrichment.showing_range"]({
									from: offset + 1,
									to: Math.min(offset + PAGE_SIZE, total),
									total,
								})}
							</p>
							{totalPages > 1 && (
								<nav
									aria-label={m["enrichment.pagination"]()}
									className="flex items-center gap-1"
								>
									<Button
										size="icon-sm"
										variant="ghost"
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
													variant={page === currentPage ? "default" : "ghost"}
													onClick={() => goToPage(page)}
													aria-current={
														page === currentPage ? "page" : undefined
													}
													aria-label={m["enrichment.go_to_page"]({ page })}
												>
													{page}
												</Button>
											</Fragment>
										);
									})}
									<Button
										size="icon-sm"
										variant="ghost"
										onClick={() => goToPage(currentPage + 1)}
										disabled={currentPage === totalPages}
										aria-label={m["enrichment.next_page"]()}
									>
										<CaretRight />
									</Button>
								</nav>
							)}
						</div>
					)}
				</section>

				{detailItem && detailFits && (
					<MatchDetailPanel
						item={detailItem}
						providerLabels={providerLabels}
						providerUrlTemplates={data?.providerUrlTemplates}
						busy={busy}
						actions={rowActions(detailItem)}
						onClose={closeDetail}
						className="w-96 shrink-0 border-border/60 border-s"
					/>
				)}
			</div>

			{detailItem && !detailFits && (
				<Modal
					open
					onOpenChange={(open) => !open && closeDetail()}
					title={m["enrichment.detail_title"]()}
					className="max-h-[85dvh] overflow-hidden p-0 sm:max-w-xl"
					bare
				>
					<MatchDetailPanel
						item={detailItem}
						providerLabels={providerLabels}
						providerUrlTemplates={data?.providerUrlTemplates}
						busy={busy}
						actions={rowActions(detailItem)}
						onClose={closeDetail}
						className="max-h-[85dvh] bg-transparent"
					/>
				</Modal>
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

// One template shared by the header and every row. Columns are declared per
// breakpoint in DOM order (book, match, status, updated); a hidden cell drops
// out of grid placement entirely, so each breakpoint's template lists exactly
// the cells that are visible at it.
const ROW_COLUMNS =
	"grid grid-cols-[minmax(0,1fr)] items-center gap-3 md:grid-cols-[minmax(0,1fr)_10rem] lg:grid-cols-[minmax(0,1fr)_10rem_6.5rem] xl:grid-cols-[minmax(0,1fr)_minmax(0,30%)_10rem_6.5rem]";

function SortHeader({
	label,
	active,
	direction,
	onClick,
	className,
}: {
	label: string;
	active: boolean;
	direction: "asc" | "desc";
	onClick: () => void;
	className?: string;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			className={cn(
				"inline-flex w-fit items-center gap-1 font-medium transition-colors hover:text-foreground",
				active && "text-foreground",
				className,
			)}
		>
			{label}
			{active ? (
				direction === "asc" ? (
					<CaretUp weight="bold" className="size-3" />
				) : (
					<CaretDown weight="bold" className="size-3" />
				)
			) : (
				<ArrowsDownUp className="size-3 opacity-50" />
			)}
		</button>
	);
}

function EnrichmentRow({
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
	// What the pipeline actually picked, as the provider described it. Rows
	// matched before this was recorded have no title and fall back to the
	// provider list alone.
	const chosen = primaryMatch?.title;
	const providerName = primaryMatch
		? (providerLabels[primaryMatch.provider] ?? primaryMatch.provider)
		: "";
	const matchedLabels = item.matched
		.map(({ provider }) => providerLabels[provider] ?? provider)
		.join(", ");
	// The row's whole job is letting you compare what is on disk with what the
	// pipeline chose, so the filename is the book cell's second line — the
	// library is a sidebar filter and would only repeat itself down the column.
	const sourceName = item.filename?.replace(/\.[^./\\]+$/, "") ?? null;
	const firstFailure = item.failures[0];
	const {
		automaticRetryAt,
		automaticRetryCancelled,
		automaticRetryScheduled,
		providerRetryExhausted,
	} = resolveRetryView(item.retry);
	const failureProvider = firstFailure
		? (providerLabels[firstFailure.provider] ?? firstFailure.provider)
		: "";
	const failureLine = firstFailure
		? automaticRetryCancelled
			? m["enrichment.retry_cancelled_summary"]({ provider: failureProvider })
			: automaticRetryScheduled && automaticRetryAt
				? m["enrichment.automatic_retry_summary"]({
						provider: failureProvider,
						minutes: minutesFromMs(automaticRetryAt.getTime() - Date.now()),
					})
				: providerRetryExhausted
					? m["enrichment.retry_exhausted_summary"]({
							provider: failureProvider,
						})
					: m["enrichment.provider_failure_summary"]({
							provider: failureProvider,
							reason: failureLabel(firstFailure.code),
						})
		: null;

	return (
		<li
			className={cn(
				"group flex items-stretch border-border/40 border-b transition-colors duration-150",
				open ? "bg-primary/10" : "hover:bg-muted/50",
			)}
		>
			<div className="flex w-11 shrink-0 items-center justify-center">
				<Checkbox
					checked={selected}
					onCheckedChange={onToggle}
					aria-label={item.title ?? item.bookUuid}
				/>
			</div>

			{/* The whole row is one button: clicking anywhere opens the detail, and
			    it is a single tab stop with the book title as its accessible name.
			    Nothing interactive may live inside it — provider links belong to the
			    detail pane. Every cell is capped to two lines so the list keeps one
			    scan rhythm no matter how long a title or a failure reason runs. */}
			<button
				type="button"
				onClick={onOpen}
				aria-current={open ? "true" : undefined}
				className={cn(
					"h-14 min-w-0 flex-1 pe-2 text-start outline-none focus-visible:outline-2 focus-visible:outline-ring focus-visible:-outline-offset-2",
					ROW_COLUMNS,
				)}
			>
				<span className="flex min-w-0 items-center gap-2.5">
					{coverFilename ? (
						<img
							src={getCoverUrl(coverFilename, coverPresets.activity.widths[1])}
							alt=""
							loading="lazy"
							className="h-11 w-8 shrink-0 rounded-sm object-cover"
						/>
					) : (
						<span className="h-11 w-8 shrink-0 rounded-sm bg-muted" />
					)}
					<span className="min-w-0 flex-1">
						<span
							className={cn("block truncate text-sm", open && "font-medium")}
							title={item.title ?? undefined}
						>
							{item.title ?? item.bookUuid}
						</span>
						<span
							className="block truncate text-muted-foreground text-xs"
							title={sourceName ?? undefined}
						>
							{/* Without the match column there is nowhere else to say what
							    the pipeline chose, so the comparison collapses inline. */}
							{chosen && <span className="xl:hidden">{chosen} · </span>}
							{sourceName ?? item.libraryName}
						</span>
					</span>
				</span>

				<span className="hidden min-w-0 xl:block">
					{chosen ? (
						<>
							<span className="flex min-w-0 items-center gap-1.5">
								<span className="truncate text-sm" title={chosen}>
									{chosen}
								</span>
								{primaryMatch?.reasons?.length ? (
									<MatchReasonChip reasons={primaryMatch.reasons} />
								) : null}
							</span>
							<span className="block truncate text-muted-foreground text-xs">
								{providerName}
							</span>
						</>
					) : item.matched.length > 0 ? (
						<span className="block truncate text-muted-foreground text-xs">
							{m["enrichment.matched_via"]({ providers: matchedLabels })}
						</span>
					) : (
						<span className="text-muted-foreground/50 text-sm">—</span>
					)}
				</span>

				<span className="hidden min-w-0 md:block">
					<LifecycleChip lifecycle={item.lifecycle} />
					{failureLine && (
						<span
							className="mt-0.5 block truncate text-warning text-xs"
							title={failureLine}
						>
							{failureLine}
						</span>
					)}
				</span>

				<span className="hidden truncate text-muted-foreground text-xs tabular-nums lg:block">
					{item.lastRunAt
						? formatRelativeTime(item.lastRunAt)
						: m["enrichment.never_ran"]()}
				</span>
			</button>

			<div className="flex w-9 shrink-0 items-center justify-center">
				<RowMenu lifecycle={item.lifecycle} actions={actions} />
			</div>
		</li>
	);
}

function RowMenu({
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
					size="icon-sm"
					variant="ghost"
					aria-label={m["enrichment.more"]()}
					className="text-muted-foreground opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100 aria-expanded:opacity-100 max-md:opacity-100"
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
				{lifecycle === "running" && (
					<DropdownMenuItem onClick={actions.onStop}>
						{m["enrichment.action_stop"]()}
					</DropdownMenuItem>
				)}
				{(lifecycle === "review" || lifecycle === "partial") && (
					<DropdownMenuItem onClick={actions.onApprove}>
						{m["enrichment.approve"]()}
					</DropdownMenuItem>
				)}
				{lifecycle !== "running" && lifecycle !== "archived" && (
					<DropdownMenuItem onClick={actions.onFix}>
						{m["enrichment.fix_match"]()}
					</DropdownMenuItem>
				)}
				{lifecycle === "done" ? (
					<DropdownMenuItem onClick={actions.onRefresh}>
						{m["enrichment.action_refresh"]()}
					</DropdownMenuItem>
				) : (
					lifecycle !== "running" &&
					lifecycle !== "scheduled" && (
						<DropdownMenuItem onClick={actions.onRetry}>
							{lifecycle === "stopped"
								? m["enrichment.action_reprocess"]()
								: m["enrichment.retry"]()}
						</DropdownMenuItem>
					)
				)}
				<DropdownMenuSeparator />
				{lifecycle === "archived" ? (
					<DropdownMenuItem onClick={actions.onUnarchive}>
						{m["enrichment.action_restore"]()}
					</DropdownMenuItem>
				) : (
					<DropdownMenuItem onClick={actions.onArchive}>
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
	bucket: BucketFilter;
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
			<span className="text-muted-foreground text-xs tabular-nums">
				{count}
			</span>
		);

	if (bucket === "history") {
		return (
			<Button
				size="sm"
				variant="outline"
				onClick={onRestore}
				disabled={busy || eligibility?.restorable === 0}
			>
				<ArrowCounterClockwise data-icon="inline-start" />
				{m["enrichment.action_restore"]()}
				{hint(eligibility?.restorable)}
			</Button>
		);
	}

	const showApprove = bucket === "attention" || bucket === ALL_BUCKETS;
	const showStop =
		bucket === "in_progress" ||
		bucket === "attention" ||
		bucket === ALL_BUCKETS;

	return (
		<>
			{bucket !== "completed" && (
				<Button
					size="sm"
					variant="outline"
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
			{showApprove && (
				<Button
					size="sm"
					variant="outline"
					onClick={onApprove}
					disabled={busy || eligibility?.approvable === 0}
				>
					<CheckCircle data-icon="inline-start" />
					{m["enrichment.approve"]()}
					{hint(eligibility?.approvable)}
				</Button>
			)}
			{showStop && (
				<Button
					size="sm"
					variant="outline"
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
				variant="outline"
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
