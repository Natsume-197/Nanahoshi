import {
	ArrowClockwise,
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
	Warning,
} from "@phosphor-icons/react";
import {
	keepPreviousData,
	useMutation,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import { getRouteApi, Link } from "@tanstack/react-router";
import {
	type ComponentProps,
	type CSSProperties,
	Fragment,
	type ReactNode,
	useRef,
	useState,
} from "react";
import { toast } from "sonner";
import {
	AudiobookMatchDialog,
	BookMatchDialog,
} from "@/components/metadata/match-metadata-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
	Drawer,
	DrawerContent,
	DrawerDescription,
	DrawerTitle,
} from "@/components/ui/drawer";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
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
import { useWindowEvent } from "@/hooks/use-window-event";
import { cn } from "@/lib/utils";
import { m } from "@/paraglide/messages";
import {
	COVER_EDGE,
	coverPresets,
	getCoverFilename,
	getCoverUrl,
} from "@/utils/covers";
import { formatRelativeTime } from "@/utils/format";
import { client, orpc } from "@/utils/orpc";
import {
	ALL_BUCKETS,
	ALL_LIBRARIES,
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
import type { MatchDecisionCandidate, MatchRow, RowActions } from "./types";

type FixTarget = {
	bookUuid: string;
	title: string;
	mediaType: "ebook" | "audiobook";
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
		actions: ["retry"],
	},
	attention: {
		summary: () => m["enrichment.help_bucket_attention"](),
		actions: ["retry", "approve"],
	},
	completed: {
		summary: () => m["enrichment.help_bucket_completed"](),
		actions: ["retry"],
	},
};

const ACTION_HELP = {
	retry: {
		label: () => m["enrichment.retry"](),
		body: () => m["enrichment.help_action_retry"](),
	},
	approve: {
		label: () => m["enrichment.approve"](),
		body: () => m["enrichment.help_action_approve"](),
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
						{/* Not the Button component, so nothing normalises the glyph — a
						    bare Phosphor icon inherits 1em and would out-weigh the
						    text-sm heading beside it. */}
						<Question className="size-4" />
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

/**
 * Cross-fade between glyphs sharing one slot. No motion library here, so every
 * icon stays mounted, stacked in a single grid cell, and CSS animates
 * scale/opacity/blur — that way the outgoing icon gets an exit, not just a
 * disappearance. `data-icon` rides on the wrapper so the Button padding
 * selectors (`has-data-[icon=inline-start]`) still see it.
 */
function IconSwap({
	active,
	icons,
	className,
	...rest
}: {
	active: string;
	icons: Record<string, ReactNode>;
	className?: string;
} & ComponentProps<"span">) {
	return (
		<span
			aria-hidden="true"
			className={cn("grid size-4 shrink-0 place-items-center", className)}
			{...rest}
		>
			{Object.entries(icons).map(([key, icon]) => (
				<span
					key={key}
					className={cn(
						"col-start-1 row-start-1 grid place-items-center transition-[opacity,scale,filter] duration-[var(--duration-quick)] ease-[cubic-bezier(0.2,0,0,1)]",
						key === active
							? "scale-100 opacity-100 blur-0"
							: "scale-25 opacity-0 blur-[4px]",
					)}
				>
					{icon}
				</span>
			))}
		</span>
	);
}

const SKELETON_ROWS = [
	"s1",
	"s2",
	"s3",
	"s4",
	"s5",
	"s6",
	"s7",
	"s8",
	"s9",
	"s10",
];

// URL is the source of truth for the discrete filters (shareable + survives
// reload). Search text stays local so keystrokes don't spam browser history.
const routeApi = getRouteApi("/dashboard/metadata");

export function MatchManager() {
	const queryClient = useQueryClient();
	const urlSearch = routeApi.useSearch();
	const navigate = routeApi.useNavigate();

	const bucket = urlSearch.bucket ?? DEFAULT_BUCKET;
	const libraryUuid = urlSearch.library ?? ALL_LIBRARIES;
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
	const [providerFixOpen, setProviderFixOpen] = useState(false);
	const [restoreRequest, setRestoreRequest] = useState<number | null>(null);
	// Spin only for a refresh the user asked for. `isFetching` is true on every
	// background poll too, so binding the icon to it would spin the header every
	// few seconds unprompted.
	const [manualRefresh, setManualRefresh] = useState(false);
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
				detailOpen: detailUuid != null,
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
	const restoreMutation = useMutation(
		orpc.enrichment.restoreOriginal.mutationOptions(),
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
	const selectCandidateMutation = useMutation({
		mutationFn: async ({
			item,
			candidate,
		}: {
			item: MatchRow;
			candidate: MatchDecisionCandidate;
		}) => {
			if (item.mediaType === "audiobook") {
				const result = await client.audiobooks.applyMetadata({
					uuid: item.bookUuid,
					provider: candidate.provider as "audible" | "itunes",
					providerId: candidate.providerId,
				});
				if (result == null) throw new Error(m["match.apply_failed"]());
				return;
			}
			const result = await client.books.applyMetadata({
				uuid: item.bookUuid,
				provider: candidate.provider as Parameters<
					typeof client.books.applyMetadata
				>[0]["provider"],
				providerId: candidate.providerId,
			});
			if (!result.success) throw new Error(m["match.apply_failed"]());
		},
		onSuccess: () => {
			toast.success(m["match.applied"]());
			setDetailUuid(null);
			setDetailFallback(null);
			invalidateAll();
		},
		onError: (error: Error) => toast.error(error.message),
	});

	const counts = data?.counts;
	const items: MatchRow[] = data?.items ?? [];
	const total = data?.total ?? 0;
	const providerLabels = providerStatus?.labels ?? {};
	const cooldowns = Object.entries(providerStatus?.cooldowns ?? {});
	const retrySettled = (count: number) => ({
		onSuccess: () => {
			if (cooldowns.length > 0) {
				const providers = cooldowns
					.map(([provider]) => providerLabels[provider] ?? provider)
					.join(", ");
				toast.info(
					m["enrichment.retry_deferred"]({
						count,
						providers,
					}),
				);
			} else {
				toast.success(m["enrichment.retry_enqueued"]({ count }));
			}
			clearSelection();
			invalidateAll();
		},
		onError: (error: Error) => toast.error(error.message),
	});
	const currentPage = Math.floor(offset / PAGE_SIZE) + 1;
	const totalPages = Math.ceil(total / PAGE_SIZE);
	const paginationPages = visiblePageNumbers(currentPage, totalPages);
	const busy =
		retryMutation.isPending ||
		approveMutation.isPending ||
		cancelRetryMutation.isPending ||
		restoreMutation.isPending ||
		selectCandidateMutation.isPending;

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
		fixTarget != null || providerFixOpen || restoreRequest != null;
	// Escape closes the drawer. The drawer handles it natively too; this is
	// the fallback for the same keypress so selection state always resets.
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
	// "Select all results" checks every row, so the header has to follow or it
	// reads as empty while the page below it is full. Three rows out of fifty
	// must not look like none either — hence the indeterminate middle state.
	const headerChecked = selectAllFilter || allPageSelected;
	const headerIndeterminate =
		!headerChecked && pageUuids.some((uuid) => selected.has(uuid));
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
		retryMutation.mutate({ bookUuids: [uuid], refresh }, retrySettled(1));
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
		onFix: () => openFix(item),
		onSelectCandidate: (candidate) =>
			selectCandidateMutation.mutate({ item, candidate }),
	});

	// ── Bulk actions ─────────────────────────────────────────────────────────
	const runBulk = (
		mutation: typeof retryMutation | typeof approveMutation,
		message: string,
		extra: Record<string, unknown> = {},
	) =>
		mutation.mutate({ ...targetInput(), ...extra }, mutationSettled(message));

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
			: bucket === "completed"
				? m["enrichment.empty_completed_desc"]()
				: bucket === "in_progress"
					? m["enrichment.empty_in_progress_desc"]()
					: m["enrichment.empty_all_desc"]();

	// When the current scope is empty, point at the most relevant non-empty one
	// — a nudge instead of a surprising auto-switch on load.
	const SUGGEST_ORDER: Bucket[] = ["attention", "in_progress", "completed"];
	const suggestedBucket =
		items.length === 0 && counts
			? SUGGEST_ORDER.find((key) => key !== bucket && (counts[key] ?? 0) > 0)
			: undefined;

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
					{/* The tray polls itself; this is the escape hatch when you don't
					    want to wait. The label is fixed — swapping it to "Updating…" on
					    every poll resized the button and shoved Pause sideways. */}
					<Button
						variant="ghost"
						size="sm"
						onClick={() => {
							setManualRefresh(true);
							refetchList().finally(() => setManualRefresh(false));
						}}
						aria-label={m["enrichment.refresh_now"]()}
					>
						<ArrowClockwise
							data-icon="inline-start"
							className={cn(manualRefresh && "animate-spin")}
						/>
						<span className="hidden sm:inline">
							{m["enrichment.refresh_now"]()}
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
							<IconSwap
								data-icon="inline-start"
								active={isPaused ? "play" : "pause"}
								icons={{
									play: <Play weight="fill" className="size-4" />,
									pause: <Pause className="size-4" />,
								}}
							/>
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
							<MagnifyingGlass className="pointer-events-none absolute start-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
							<Input
								value={search}
								onChange={(event) => {
									setSearch(event.target.value);
									setOffset(0);
								}}
								placeholder={m["enrichment.search_placeholder"]()}
								className="h-[30px] w-full rounded-full ps-8 text-xs"
							/>
						</div>
					</div>

					<div className="min-h-0 flex-1 overflow-auto overscroll-contain">
						{/* Mirrors the loaded geometry exactly — dense 38px header over
						    52px rows — so nothing shifts when the data lands. */}
						{isLoading && (
							<div className={TABLE_GRID}>
								<div
									className={cn(
										ROW_SUBGRID,
										"h-[38px] border-border/60 border-b px-3",
									)}
								>
									<span className="flex items-center justify-center">
										<Skeleton className="size-4 rounded-[5px]" />
									</span>
									<Skeleton className="h-3 w-16 rounded-sm" />
									<Skeleton className="h-3 w-14 rounded-sm" />
									<Skeleton className="h-5 w-20 rounded-full" />
									<Skeleton className="h-3 w-14 rounded-sm" />
									<span />
								</div>
								{SKELETON_ROWS.map((id) => (
									<div
										key={id}
										className={cn(
											ROW_SUBGRID,
											"h-[52px] border-border/40 border-b px-3",
										)}
									>
										<span className="flex items-center justify-center">
											<Skeleton className="size-4 rounded-[5px]" />
										</span>
										<span className="flex min-w-0 items-center gap-2.5">
											<Skeleton className="h-9 w-6 shrink-0 rounded-[4px]" />
											<Skeleton className="h-3.5 w-48 max-w-[60%] rounded-sm" />
										</span>
										<Skeleton className="h-3.5 w-3/4 rounded-sm" />
										<Skeleton className="h-5 w-20 rounded-full" />
										<Skeleton className="h-3 w-14 rounded-sm" />
										<span />
									</div>
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
									TABLE_GRID,
									"transition-opacity",
									isPlaceholderData && "pointer-events-none opacity-50",
								)}
							>
								<div
									className={cn(
										ROW_SUBGRID,
										"sticky top-0 z-10 border-border/60 border-b bg-background px-3 text-muted-foreground",
									)}
								>
									<span className="flex h-[38px] items-center justify-center">
										<Checkbox
											checked={headerChecked}
											indeterminate={headerIndeterminate}
											onCheckedChange={toggleSelectPage}
											aria-label={m["enrichment.select_page"]()}
										/>
									</span>
									<span className="flex h-[38px] items-center">
										<SortHeader
											label={m["enrichment.col_book"]()}
											active={sort === "title"}
											direction="asc"
											onClick={toggleTitleSort}
										/>
									</span>
									<span className="flex h-[38px] items-center font-medium text-xs">
										{m["enrichment.col_match"]()}
									</span>
									<span className="flex h-[38px] items-center font-medium text-xs">
										{m["enrichment.col_status"]()}
									</span>
									<SortHeader
										label={m["enrichment.col_updated"]()}
										active={sort === "recent" || sort === "oldest"}
										direction={sort === "oldest" ? "asc" : "desc"}
										onClick={toggleUpdatedSort}
									/>
									<span />
								</div>
								<ul className="contents">
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
							className="bar-in flex shrink-0 flex-wrap items-center gap-1.5 border-border/60 border-t bg-muted/40 px-3 py-2"
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
									retryMutation.mutate(
										{
											...targetInput(),
											refresh: bucket === "completed",
										},
										retrySettled(selectionCount),
									)
								}
								onApprove={() =>
									runBulk(
										approveMutation,
										m["enrichment.approve_enqueued"]({ count: selectionCount }),
									)
								}
								onRestore={() => setRestoreRequest(selectionCount)}
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
			</div>

			<Drawer
				open={detailItem != null}
				onOpenChange={(open) => {
					if (!open) closeDetail();
				}}
				swipeDirection="right"
				overlayClassName="supports-backdrop-filter:backdrop-blur-none"
			>
				<DrawerContent
					className="rounded-none border-border/60 border-y-0 border-r-0 bg-background"
					style={
						{
							"--drawer-content-width": "min(26rem, calc(100dvw - 3rem))",
							"--drawer-inset": "0px",
						} as CSSProperties
					}
				>
					<DrawerTitle className="sr-only">
						{m["enrichment.detail_title"]()}
					</DrawerTitle>
					<DrawerDescription className="sr-only">
						{detailItem?.title ?? detailItem?.bookUuid ?? ""}
					</DrawerDescription>
					{detailItem && (
						<MatchDetailPanel
							item={detailItem}
							providerLabels={providerLabels}
							providerUrlTemplates={data?.providerUrlTemplates}
							busy={busy}
							actions={rowActions(detailItem)}
							onClose={closeDetail}
							className="min-h-0 flex-1 bg-transparent"
						/>
					)}
				</DrawerContent>
			</Drawer>

			<Modal
				open={restoreRequest != null}
				onOpenChange={(open) => !open && setRestoreRequest(null)}
				title={m["enrichment.restore_original_title"]({
					count: restoreRequest ?? 0,
				})}
				description={m["enrichment.restore_original_body"]()}
			>
				<div className="flex justify-end gap-2">
					<Button variant="outline" onClick={() => setRestoreRequest(null)}>
						{m["enrichment.action_cancel"]()}
					</Button>
					<Button
						variant="destructive"
						disabled={restoreMutation.isPending}
						onClick={() => {
							restoreMutation.mutate(targetInput(), {
								onSuccess: () => {
									setRestoreRequest(null);
									clearSelection();
									invalidateAll();
									toast.success(m["enrichment.restore_original_done"]());
								},
								onError: (error) => toast.error(error.message),
							});
						}}
					>
						{m["enrichment.restore_original"]()}
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

// Dense CRM grid: the outer wrapper owns the column template, the header and
// every row are subgrids of it, and the list itself is `contents` so rows
// participate directly. Track 1 is the checkbox gutter, tracks 2–5 are the
// content columns (owned by one row button, so the row stays a single tab
// stop with no nested buttons), track 6 is the row menu.
const TABLE_GRID =
	"grid min-w-[860px] grid-cols-[2.5rem_minmax(0,1.7fr)_minmax(0,1fr)_9.5rem_7rem_1.5rem]";
const ROW_SUBGRID = "col-span-full grid grid-cols-subgrid items-center gap-3";

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
				"inline-flex w-fit items-center gap-1 text-xs transition-colors hover:text-foreground",
				active ? "font-medium text-foreground" : "font-normal",
				className,
			)}
		>
			{label}
			<IconSwap
				className="size-3"
				active={active ? direction : "none"}
				icons={{
					asc: <CaretUp weight="bold" className="size-3" />,
					desc: <CaretDown weight="bold" className="size-3" />,
					none: <ArrowsDownUp className="size-3 opacity-50" />,
				}}
			/>
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
	const { automaticRetryAt, automaticRetryScheduled, providerRetryExhausted } =
		resolveRetryView(item.retry);
	const failureProvider = firstFailure
		? (providerLabels[firstFailure.provider] ?? firstFailure.provider)
		: "";
	const failureLine = firstFailure
		? automaticRetryScheduled && automaticRetryAt
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
				ROW_SUBGRID,
				"group border-border/40 border-b px-3 transition-colors duration-150",
				// Selection needs to read at a glance across 50 rows; the open row
				// stays clearly the stronger tint so the two never compete.
				open ? "bg-primary/16" : "hover:bg-card/60",
				selected && !open && "bg-primary/6",
			)}
			data-active={open}
		>
			{/* Checkbox gutter and row menu stay outside the row button: the
			    button owns tracks 2–5 as its own subgrid, so the row keeps one
			    tab stop and never nests buttons. */}
			<span className="flex items-center justify-center">
				<Checkbox
					checked={selected}
					onCheckedChange={onToggle}
					aria-label={item.title ?? item.bookUuid}
				/>
			</span>
			<button
				type="button"
				onClick={onOpen}
				aria-current={open ? "true" : undefined}
				aria-label={item.title ?? item.bookUuid}
				className="col-span-4 grid min-h-[52px] grid-cols-subgrid items-center gap-3 py-1.5 text-start outline-none focus-visible:outline-2 focus-visible:outline-ring focus-visible:-outline-offset-2"
			>
				<span className="flex min-w-0 items-center gap-2.5">
					{coverFilename ? (
						<img
							src={getCoverUrl(coverFilename, coverPresets.activity.widths[1])}
							alt=""
							loading="lazy"
							decoding="async"
							className={cn(
								"h-9 w-6 shrink-0 rounded-[4px] object-cover ring-1 ring-foreground/10",
								COVER_EDGE,
							)}
						/>
					) : (
						<span className="h-9 w-6 shrink-0 rounded-[4px] bg-muted ring-1 ring-foreground/10" />
					)}
					<span className="min-w-0 flex-1">
						<span
							className={cn(
								"block truncate text-[14px] leading-tight",
								open && "font-medium",
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

				<span className="min-w-0">
					{chosen ? (
						<>
							<span className="flex min-w-0 items-center gap-1.5">
								<span
									className="truncate text-[14px] leading-tight"
									title={chosen}
								>
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

				<span className="min-w-0">
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

				<span className="truncate text-muted-foreground text-xs tabular-nums">
					{item.lastRunAt
						? formatRelativeTime(item.lastRunAt)
						: m["enrichment.never_ran"]()}
				</span>
			</button>

			<span className="flex items-center justify-center">
				<RowMenu lifecycle={item.lifecycle} actions={actions} />
			</span>
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
				{(lifecycle === "review" || lifecycle === "partial") && (
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

function SelectionActions({
	bucket,
	busy,
	eligibility,
	onRetry,
	onApprove,
	onRestore,
}: {
	bucket: BucketFilter;
	busy: boolean;
	eligibility?: {
		retryable: number;
		approvable: number;
		refreshable: number;
	};
	onRetry: () => void;
	onApprove: () => void;
	onRestore: () => void;
}) {
	const hint = (count: number | undefined) =>
		count == null ? null : (
			<span className="text-muted-foreground text-xs tabular-nums">
				{count}
			</span>
		);

	const showApprove = bucket === "attention" || bucket === ALL_BUCKETS;
	return (
		<>
			<Button
				size="sm"
				variant="outline"
				onClick={onRetry}
				disabled={
					busy ||
					(bucket === "completed"
						? eligibility?.refreshable === 0
						: eligibility?.retryable === 0)
				}
			>
				<ArrowClockwise data-icon="inline-start" />
				{m["enrichment.retry"]()}
				{hint(
					bucket === "completed"
						? eligibility?.refreshable
						: eligibility?.retryable,
				)}
			</Button>
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
			{bucket === "completed" && (
				<Button size="sm" variant="outline" onClick={onRestore} disabled={busy}>
					{m["enrichment.restore_original"]()}
				</Button>
			)}
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
