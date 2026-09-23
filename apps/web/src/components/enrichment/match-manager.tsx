import {
	ArrowClockwise,
	ArrowLeft,
	CaretDown,
	CaretLeft,
	CaretRight,
	FunnelSimple,
	MagnifyingGlass,
	Pause,
	Play,
	Prohibit,
	Warning,
} from "@phosphor-icons/react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { getRouteApi, Link } from "@tanstack/react-router";
import { Fragment, useRef, useState } from "react";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
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
import { useMediaQuery } from "@/hooks/use-media-query";
import { useOnUnmount } from "@/hooks/use-on-unmount";
import { cn } from "@/lib/utils";
import { m } from "@/paraglide/messages";
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
import { LIFECYCLE_LABELS, minutesFromMs } from "./lifecycle";
import { BucketHelp, IconSwap, SelectionActions } from "./match-controls";
import { MatchDetailPanel } from "./match-detail-panel";
import {
	BUCKET_LABELS,
	MatchSidebar,
	type ScopeSelection,
} from "./match-sidebar";
import {
	MatchResults,
	ROW_SUBGRID,
	SKELETON_ROWS,
	TABLE_GRID,
	useMatchTable,
} from "./match-table";
import { visiblePageNumbers } from "./pagination";
import { IDLE_POLL_MS, resolvePollInterval } from "./poll";
import type { MatchRow } from "./types";
import { useMatchActions } from "./use-match-actions";
import { useMatchSelection } from "./use-match-selection";

// URL is the source of truth for table state. Search keeps a local draft and
// commits after the debounce so typing does not navigate on every keystroke.
const routeApi = getRouteApi("/dashboard/metadata");
// Stable fallback so memoized rows don't re-render while labels load.
const NO_LABELS: Record<string, string> = {};

export function MatchManager() {
	const urlSearch = routeApi.useSearch();
	const navigate = routeApi.useNavigate();

	// Without an explicit bucket the tray opens on "attention"; once that turns
	// out empty it settles on every book for the rest of the visit, so a poll
	// that brings new work in never yanks the view away.
	const [emptyDefault, setEmptyDefault] = useState(false);
	const bucket =
		urlSearch.bucket ?? (emptyDefault ? ALL_BUCKETS : DEFAULT_BUCKET);
	const libraryUuid = urlSearch.library ?? ALL_LIBRARIES;
	const sort = urlSearch.sort;
	const onlyFailures = urlSearch.failures ?? false;
	const mediaType = urlSearch.type ?? ALL_TYPES;
	const page = urlSearch.page ?? 1;
	const desktopTable = useMediaQuery("(min-width: 1280px)");

	// Patch the URL filters in place; every change resets paging + selection.
	const patchFilters = (
		patch: Partial<{
			bucket: BucketFilter;
			lifecycle: Lifecycle | undefined;
			library: string;
			type: MediaTypeFilter;
			sort: Sort;
			failures: boolean;
			q: string;
			page: number;
		}>,
		{ keepSelection = false }: { keepSelection?: boolean } = {},
	) => {
		navigate({
			search: (prev) => ({ ...prev, page: undefined, ...patch }),
			replace: true,
		});
		if (!keepSelection) clearSelection();
	};

	const [search, setSearchDraft] = useState(urlSearch.q ?? "");
	const committedSearch = useRef(urlSearch.q ?? "");
	const searchTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
	useOnUnmount(() => clearTimeout(searchTimer.current));
	const singleLibrary = libraryUuid !== ALL_LIBRARIES;
	// Built by the same helper the route loader uses, so the prefetched entry
	// lands under this exact query key.
	const listInput = listInputFromSearch({ ...urlSearch, bucket });
	const offset = listInput.offset;
	const {
		sort: _sort,
		limit: _limit,
		offset: _offset,
		...filterScope
	} = listInput;
	const lifecycle = filterScope.lifecycle;

	const {
		rowSelection,
		setRowSelection,
		selectAllFilter,
		setSelectAllFilter,
		clearSelection,
	} = useMatchSelection(JSON.stringify(filterScope));
	const [detailUuid, setDetailUuid] = useState<string | null>(null);
	const [detailFallback, setDetailFallback] = useState<MatchRow | null>(null);
	// Spin only for a refresh the user asked for. `isFetching` is true on every
	// background poll too, so binding the icon to it would spin the header every
	// few seconds unprompted.
	const [manualRefresh, setManualRefresh] = useState(false);
	// Back/forward or a deep link changed `q` under us: adopt it as the draft.
	// Our own commits already set committedSearch, so they don't bounce back.
	const urlQuery = urlSearch.q ?? "";
	const previousUrlQuery = useRef(urlQuery);
	if (urlQuery !== previousUrlQuery.current) {
		previousUrlQuery.current = urlQuery;
		if (urlQuery !== committedSearch.current) {
			committedSearch.current = urlQuery;
			setSearchDraft(urlQuery);
		}
	}
	const commitSearch = (value: string) => {
		clearTimeout(searchTimer.current);
		const q = value.trim();
		if (q === committedSearch.current) return;
		committedSearch.current = q;
		patchFilters({ q: q || undefined });
	};
	// Debounced, not deferred: `q` is part of the list query key, and
	// useDeferredValue would still fire a request per settled keystroke.
	const setSearch = (value: string) => {
		setSearchDraft(value);
		clearTimeout(searchTimer.current);
		searchTimer.current = setTimeout(() => commitSearch(value), 300);
	};

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
				selectionActive:
					Object.keys(rowSelection).length > 0 || selectAllFilter,
				detailOpen: detailUuid != null,
				inProgressCount: query.state.data?.counts?.in_progress,
			}),
	});
	if (
		!urlSearch.bucket &&
		!emptyDefault &&
		data &&
		!isPlaceholderData &&
		data.counts.attention === 0
	) {
		setEmptyDefault(true);
	}
	// While the default falls back, the placeholder is the empty attention page;
	// keep the skeleton up instead of flashing "nothing here".
	const showSkeleton = isLoading || (isPlaceholderData && !data?.items.length);
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

	const counts = data?.counts;
	const items: MatchRow[] = data?.items ?? [];
	const total = data?.total ?? 0;
	const providerLabels = providerStatus?.labels ?? NO_LABELS;
	const cooldowns = Object.entries(providerStatus?.cooldowns ?? {});
	// The open row, preferring the live list entry so the pane follows the
	// worker; the click-time snapshot keeps it from blanking when a refresh
	// moves that book out of the current filter.
	const detailItem =
		detailUuid == null
			? null
			: (items.find((item) => item.bookUuid === detailUuid) ??
				(detailFallback?.bookUuid === detailUuid ? detailFallback : null));
	const detailIndex = detailItem
		? items.findIndex((item) => item.bookUuid === detailItem.bookUuid)
		: -1;
	const previousDetail = detailIndex > 0 ? items[detailIndex - 1] : undefined;
	const nextDetail =
		detailIndex >= 0 && detailIndex < items.length - 1
			? items[detailIndex + 1]
			: undefined;

	const closeDetail = () => {
		setDetailUuid(null);
		setDetailFallback(null);
	};
	const openDetail = (item: MatchRow) => {
		setDetailUuid(item.bookUuid);
		setDetailFallback(item);
		requestAnimationFrame(() => {
			const row = [
				...document.querySelectorAll<HTMLElement>("[data-match-row]"),
			]
				.filter((candidate) => candidate.getClientRects().length > 0)
				.find((candidate) => candidate.dataset.matchRow === item.bookUuid);
			row?.scrollIntoView({ block: "nearest" });
		});
	};
	const failureBanners = Object.entries(providerStatus?.failures ?? {})
		.filter(([, count]) => count > 0)
		.sort(([, a], [, b]) => b - a);
	const {
		busy,
		pausePending,
		togglePause,
		rowActions,
		dialogs,
		setProviderFixOpen,
		retry,
		previewApproval,
		requestRestore,
	} = useMatchActions({
		clearSelection,
		closeDetail,
		libraryUuid,
		providerLabels,
		cooldowns,
		failureBanners,
		failingBooks: providerStatus?.failingBooks ?? 0,
	});

	// Pause reads per-library when one is selected, else across every library.
	const scopedLibraries = singleLibrary
		? (libraries ?? []).filter((library) => library.uuid === libraryUuid)
		: (libraries ?? []);
	const isPaused =
		scopedLibraries.length > 0 &&
		scopedLibraries.every((library) => library.autoEnrichPausedAt != null);

	// A bulk mutation targets either the explicit uuid set or the whole filter.
	const targetInput = () =>
		selectAllFilter
			? { filter: filterScope }
			: { bookUuids: Object.keys(rowSelection) };

	const applyScope = (scope: ScopeSelection) => {
		patchFilters({ bucket: scope.bucket, lifecycle: scope.lifecycle });
		closeDetail();
	};

	// Selection cardinality drives every bulk affordance.
	const selectionCount = selectAllFilter
		? total
		: Object.keys(rowSelection).length;
	const inSelectionMode = selectionCount > 0;

	const table = useMatchTable({
		items,
		total,
		page,
		sort,
		search,
		lifecycle,
		bucket,
		rowSelection,
		setRowSelection,
		selectAllFilter,
		setSelectAllFilter,
		setSearch,
		applyScope,
		patchFilters,
		openDetail,
		rowActions,
		onPageChange: (nextPage) => {
			navigate({
				search: (prev) => ({
					...prev,
					page: nextPage === 1 ? undefined : nextPage,
				}),
			});
		},
	});
	const { matchTable, tableRows } = table;
	const currentPage = matchTable.state.pagination.pageIndex + 1;
	const totalPages = matchTable.getPageCount();
	const paginationPages = visiblePageNumbers(currentPage, totalPages);
	const allPageSelected = matchTable.getIsAllPageRowsSelected();
	const pageRowCount = tableRows.length;

	const scopeLabel = lifecycle
		? LIFECYCLE_LABELS[lifecycle]()
		: bucket === ALL_BUCKETS
			? m["enrichment.nav_all"]()
			: BUCKET_LABELS[bucket]();
	const mediaTypeLabel =
		mediaType === "ebook"
			? m["enrichment.type_ebook"]()
			: mediaType === "audiobook"
				? m["enrichment.type_audiobook"]()
				: m["enrichment.all_types"]();
	const mediaTypeOptions: { value: MediaTypeFilter; label: string }[] = [
		{ value: ALL_TYPES, label: m["enrichment.all_types"]() },
		{ value: "ebook", label: m["enrichment.type_ebook"]() },
		{ value: "audiobook", label: m["enrichment.type_audiobook"]() },
	];

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

					{cooldowns.length > 0 && (
						<div className="flex items-center gap-2 rounded-lg border border-warning/30 bg-warning/10 px-4 py-2.5 text-sm text-warning">
							<Warning weight="fill" className="size-4 shrink-0" />
							{cooldowns.length === 1
								? m["enrichment.cooldown_strip"]({
										provider:
											providerLabels[cooldowns[0][0]] ?? cooldowns[0][0],
										minutes: minutesFromMs(cooldowns[0][1]),
									})
								: m["enrichment.cooldown_summary"]({
										count: cooldowns.length,
										providers: cooldowns
											.map(([provider]) => providerLabels[provider] ?? provider)
											.join(", "),
										minutes: minutesFromMs(
											Math.max(...cooldowns.map(([, ms]) => ms)),
										),
									})}
						</div>
					)}
				</div>
			)}

			<div className="flex min-h-0 flex-1 border-border/60 border-t">
				<div className="hidden w-56 shrink-0 overflow-y-auto overscroll-contain border-border/60 border-e px-2 py-2 lg:block">
					{sidebar}
				</div>

				<section className="flex min-h-0 min-w-0 flex-1 flex-col">
					<div className="flex shrink-0 flex-wrap items-center gap-2 border-border/60 border-b px-3 py-2.5">
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

						<DropdownMenu>
							<DropdownMenuTrigger asChild>
								<Button variant="outline" size="sm">
									{mediaTypeLabel}
									<CaretDown data-icon="inline-end" />
								</Button>
							</DropdownMenuTrigger>
							<DropdownMenuContent align="end">
								{mediaTypeOptions.map(({ value, label }) => (
									<DropdownMenuItem
										key={value}
										onClick={() =>
											patchFilters({
												type: value === ALL_TYPES ? undefined : value,
											})
										}
									>
										{label}
									</DropdownMenuItem>
								))}
							</DropdownMenuContent>
						</DropdownMenu>
						<Button
							variant={onlyFailures ? "default" : "outline"}
							size="sm"
							aria-pressed={onlyFailures}
							onClick={() =>
								patchFilters({ failures: onlyFailures ? undefined : true })
							}
						>
							<Warning data-icon="inline-start" weight="fill" />
							<span className="hidden sm:inline">
								{m["enrichment.only_failures"]()}
							</span>
						</Button>

						<div className="relative order-last w-full min-w-0 flex-1 sm:order-none sm:ms-auto sm:max-w-72">
							<MagnifyingGlass className="pointer-events-none absolute start-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
							<Input
								value={search}
								onChange={(event) =>
									matchTable
										.getColumn("book")
										?.setFilterValue(event.target.value)
								}
								onBlur={() => commitSearch(search)}
								onKeyDown={(event) => {
									if (event.key === "Enter") commitSearch(search);
								}}
								placeholder={m["enrichment.search_placeholder"]()}
								className="h-[30px] w-full rounded-full ps-8 text-xs"
							/>
						</div>
					</div>

					<div className="min-h-0 flex-1 overflow-auto overscroll-contain">
						{/* Mirrors the loaded geometry exactly — dense 38px header over
						    52px rows — so nothing shifts when the data lands. */}
						{showSkeleton && (
							<>
								<div className="divide-y xl:hidden">
									{SKELETON_ROWS.slice(0, 6).map((id) => (
										<div key={id} className="flex gap-3 px-3 py-3">
											<Skeleton className="mt-1 size-4 shrink-0 rounded-[5px]" />
											<Skeleton className="h-16 w-11 shrink-0 rounded-md" />
											<div className="flex-1 space-y-2">
												<Skeleton className="h-4 w-3/4 rounded-sm" />
												<Skeleton className="h-3 w-1/2 rounded-sm" />
												<Skeleton className="h-5 w-20 rounded-full" />
											</div>
										</div>
									))}
								</div>
								<div className={cn(TABLE_GRID, "hidden xl:grid")}>
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
												"h-[88px] border-border/40 border-b px-3",
											)}
										>
											<span className="flex items-center justify-center">
												<Skeleton className="size-4 rounded-[5px]" />
											</span>
											<span className="flex min-w-0 items-center gap-2.5">
												<Skeleton className="h-[72px] w-12 shrink-0 rounded-md" />
												<Skeleton className="h-3.5 w-48 max-w-[60%] rounded-sm" />
											</span>
											<Skeleton className="h-3.5 w-3/4 rounded-sm" />
											<Skeleton className="h-5 w-20 rounded-full" />
											<Skeleton className="h-3 w-14 rounded-sm" />
											<span />
										</div>
									))}
								</div>
							</>
						)}

						{!showSkeleton && items.length === 0 && (
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

						{!showSkeleton && items.length > 0 && (
							<MatchResults
								table={table}
								desktopTable={desktopTable}
								scopeLabel={scopeLabel}
								isPlaceholderData={isPlaceholderData}
								selectAllFilter={selectAllFilter}
								detailUuid={detailUuid}
								providerLabels={providerLabels}
							/>
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
							{allPageSelected && total > pageRowCount && !selectAllFilter && (
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
								busy={busy || isPlaceholderData}
								eligibility={selectAllFilter ? eligibility : undefined}
								onRetry={() =>
									retry(targetInput(), selectionCount, bucket === "completed")
								}
								onApprove={() => previewApproval(targetInput())}
								onRestore={() => requestRestore(targetInput(), selectionCount)}
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
										onClick={() => matchTable.previousPage()}
										disabled={!matchTable.getCanPreviousPage()}
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
													onClick={() => matchTable.setPageIndex(page - 1)}
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
										onClick={() => matchTable.nextPage()}
										disabled={!matchTable.getCanNextPage()}
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

			<Modal
				open={detailItem != null}
				onOpenChange={(open) => {
					if (!open) closeDetail();
				}}
				title={m["enrichment.detail_title"]()}
				description={detailItem?.title ?? detailItem?.bookUuid ?? ""}
				bare
				showCloseButton={false}
				className="flex h-[min(48rem,calc(100dvh-2rem))] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl"
			>
				{detailItem && (
					<MatchDetailPanel
						key={detailItem.bookUuid}
						item={detailItem}
						providerLabels={providerLabels}
						providerUrlTemplates={data?.providerUrlTemplates}
						busy={busy}
						actions={rowActions(detailItem)}
						onPrevious={
							previousDetail ? () => openDetail(previousDetail) : undefined
						}
						onNext={nextDetail ? () => openDetail(nextDetail) : undefined}
						onClose={closeDetail}
						className="min-h-0 w-full min-w-0 flex-1"
					/>
				)}
			</Modal>

			{dialogs}
		</div>
	);
}
