import {
	ArrowSquareOut,
	ArrowsClockwise,
	CheckCircle,
	FunnelSimple,
	Hourglass,
	ListChecks,
	MagnifyingGlass,
	Question,
	Sparkle,
	WarningCircle,
	Waveform,
} from "@phosphor-icons/react";
import {
	keepPreviousData,
	useMutation,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { type ReactNode, useState } from "react";
import { toast } from "sonner";
import { NavRow } from "@/components/enrichment/match-sidebar";
import {
	TrayBulkBar,
	TrayPagination,
	TraySearch,
	TrayToolbar,
} from "@/components/enrichment/tray-parts";
import {
	TrayCell,
	TrayHeaderCell,
	TrayRow,
	TraySelectCell,
	TrayTable,
} from "@/components/enrichment/tray-table";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { useDebounce } from "@/hooks/use-debounce";
import { useMediaQuery } from "@/hooks/use-media-query";
import { cn } from "@/lib/utils";
import { m } from "@/paraglide/messages";
import { formatRelativeTime, getErrorMessage } from "@/utils/format";
import { client, orpc } from "@/utils/orpc";
import {
	type ReadListenCandidate as Candidate,
	EbookPickerDialog,
} from "./read-listen-dialogs";
import { ReadListenReviewPanel } from "./read-listen-match-review";
import {
	type ReadListenPublicationView as Publication,
	PublicationLink,
} from "./read-listen-publication";

export type PairState = "no_alignment" | "failed" | "generating" | "ready";
export type PairView = "pending" | "decided" | "unmatched" | PairState;

export const PAIR_VIEWS: readonly PairView[] = [
	"pending",
	"no_alignment",
	"failed",
	"unmatched",
	"generating",
	"ready",
	"decided",
];

const PAGE_SIZE = 50;

type Pairing = Awaited<
	ReturnType<typeof client.readListen.pairQueue>
>["items"][number];

export const PAIR_VIEW_LABELS: Record<PairView, () => string> = {
	pending: () => m["read_listen.pending_matches"](),
	decided: () => m["read_listen.reviewed_matches"](),
	unmatched: () => m["read_listen.pairs_unmatched"](),
	no_alignment: () => m["read_listen.pairs_no_alignment"](),
	failed: () => m["read_listen.pairs_failed"](),
	generating: () => m["read_listen.pairs_generating"](),
	ready: () => m["read_listen.pairs_ready"](),
};

const PAIR_VIEW_ICONS: Record<PairView, ReactNode> = {
	pending: <Sparkle />,
	no_alignment: <Waveform />,
	failed: <WarningCircle />,
	unmatched: <Question />,
	generating: <Hourglass />,
	ready: <CheckCircle />,
	decided: <ListChecks />,
};

// Grouped by what the row asks of you, the same way the metadata tab groups
// its lifecycles: work to do, work running, work done.
const NAV_GROUPS: { label: () => string; views: PairView[] }[] = [
	{
		label: () => m["enrichment.bucket_attention"](),
		views: ["pending", "no_alignment", "failed", "unmatched"],
	},
	{
		label: () => m["enrichment.bucket_in_progress"](),
		views: ["generating"],
	},
	{
		label: () => m["enrichment.bucket_completed"](),
		views: ["ready", "decided"],
	},
];

function PairingsTrayNav({
	view,
	counts,
	onSelect,
}: {
	view: PairView;
	counts: Partial<Record<PairView, number>>;
	onSelect: (view: PairView) => void;
}) {
	return (
		<nav
			aria-label={m["read_listen.match_status_filter"]()}
			className="flex flex-col gap-3"
		>
			{NAV_GROUPS.map((group) => (
				<div key={group.views[0]} className="flex flex-col gap-0.5">
					<p className="px-2 pb-1 font-medium text-[0.6875rem] text-muted-foreground/70 uppercase tracking-wider">
						{group.label()}
					</p>
					{group.views.map((entry) => (
						<NavRow
							key={entry}
							active={view === entry}
							label={PAIR_VIEW_LABELS[entry]()}
							count={counts[entry]}
							icon={PAIR_VIEW_ICONS[entry]}
							onClick={() => onSelect(entry)}
						/>
					))}
				</div>
			))}
		</nav>
	);
}

/** The Read & Listen tab of the metadata page: its own nav, its own lists. */
export function ReadListenReviewTab({
	view,
	onViewChange,
}: {
	view: PairView;
	onViewChange: (view: PairView) => void;
}) {
	const { data: stateCounts } = useQuery({
		...orpc.readListen.pairQueueCounts.queryOptions(),
		staleTime: 0,
		refetchOnWindowFocus: false,
	});
	// Only the totals matter for the nav badges.
	const { data: pending } = useQuery(
		orpc.readListen.listMatchProposals.queryOptions({
			input: { status: "pending", offset: 0, limit: 1 },
		}),
	);
	const { data: decided } = useQuery(
		orpc.readListen.listMatchProposals.queryOptions({
			input: { status: "decided", offset: 0, limit: 1 },
		}),
	);
	const counts: Partial<Record<PairView, number>> = {
		...stateCounts,
		pending: pending?.total,
		decided: decided?.total,
	};
	const nav = (
		<PairingsTrayNav view={view} counts={counts} onSelect={onViewChange} />
	);
	const scopeButton = (
		<Popover>
			<PopoverTrigger
				render={
					<Button variant="outline" size="sm" className="lg:hidden">
						<FunnelSimple data-icon="inline-start" />
						{PAIR_VIEW_LABELS[view]()}
					</Button>
				}
			/>
			<PopoverContent
				align="start"
				className="max-h-[70vh] w-60 overflow-y-auto p-2"
			>
				{nav}
			</PopoverContent>
		</Popover>
	);
	return (
		<div className="flex min-h-0 flex-1">
			<div className="hidden w-56 shrink-0 overflow-y-auto overscroll-contain border-border/60 border-e px-2 py-2 lg:block">
				{nav}
			</div>
			{view === "pending" || view === "decided" ? (
				<ReadListenReviewPanel
					key={view}
					status={view}
					onShowPending={() => onViewChange("pending")}
					scopeButton={scopeButton}
				/>
			) : view === "unmatched" ? (
				<UnmatchedPanel scopeButton={scopeButton} />
			) : (
				<PairQueuePanel key={view} state={view} scopeButton={scopeButton} />
			)}
		</div>
	);
}

// ─── Pairs by alignment state ─────────────────────────────

const GENERATABLE: ReadonlySet<PairState> = new Set(["no_alignment", "failed"]);
const PAIR_GRID =
	"grid min-w-[760px] grid-cols-[2.5rem_minmax(12rem,1fr)_minmax(12rem,1fr)_minmax(10rem,0.8fr)_auto]";
const PAIR_GRID_READONLY =
	"grid min-w-[700px] grid-cols-[minmax(12rem,1fr)_minmax(12rem,1fr)_minmax(10rem,0.8fr)_auto]";

// A pair whose alignment no longer matches its files counts as having none;
// only the wording tells it apart.
function isOutdated(pairing: Pairing): boolean {
	return pairing.alignment.status === "stale";
}

function generateLabel(state: PairState, pairing: Pairing): string {
	if (state === "failed") return m["read_listen.action_retry_generation"]();
	if (isOutdated(pairing)) return m["read_listen.action_regenerate"]();
	return m["read_listen.action_generate_alignment"]();
}

function PairStateNote({
	pairing,
	state,
	placeholder = null,
}: {
	pairing: Pairing;
	state: PairState;
	/** Shown when the state has nothing to add (the table keeps its column). */
	placeholder?: ReactNode;
}) {
	if (state === "generating") {
		const generation = pairing.generation;
		return (
			<span className="text-muted-foreground text-xs">
				{generation?.status === "running"
					? m["read_listen.generation_running_since"]({
							time: formatRelativeTime(generation.createdAt),
						})
					: m["read_listen.generation_queued"]()}
			</span>
		);
	}
	if (state === "failed") {
		const error = pairing.generation?.error;
		return (
			<span
				title={error ?? undefined}
				className="line-clamp-2 text-destructive text-xs"
			>
				{error ?? m["read_listen.pairs_failed"]()}
			</span>
		);
	}
	if (state === "no_alignment" && isOutdated(pairing)) {
		return (
			<span className="text-muted-foreground text-xs">
				{m["read_listen.stale_hint"]()}
			</span>
		);
	}
	if (state === "ready" && pairing.alignment.status !== "not_imported") {
		return (
			<span className="text-muted-foreground text-xs tabular-nums">
				{m["read_listen.ready_hint"]({
					count: pairing.alignment.artifact.cueCount,
				})}
			</span>
		);
	}
	return placeholder;
}

function OpenAudiobookLink({ uuid }: { uuid: string }) {
	return (
		<Button
			variant="ghost"
			size="icon-sm"
			asChild
			aria-label={m["read_listen.action_open_audiobook"]()}
			title={m["read_listen.action_open_audiobook"]()}
		>
			<Link to="/dashboard/audiobooks/$uuid" params={{ uuid }}>
				<ArrowSquareOut />
			</Link>
		</Button>
	);
}

function TrayListSkeleton() {
	return (
		<div aria-busy="true" className="divide-y divide-border/40">
			<span className="sr-only">{m["common.loading"]()}</span>
			{[0, 1, 2, 3, 4, 5].map((key) => (
				<div key={key} className="flex items-center gap-3 px-3 py-3">
					<Skeleton className="size-11 shrink-0 rounded-md" />
					<Skeleton className="h-3.5 w-48 max-w-[40%] rounded-sm" />
					<Skeleton className="h-8 w-11 shrink-0 rounded-md" />
					<Skeleton className="h-3.5 w-40 max-w-[30%] rounded-sm" />
				</div>
			))}
		</div>
	);
}

function PairQueuePanel({
	state,
	scopeButton,
}: {
	state: PairState;
	scopeButton: ReactNode;
}) {
	const queryClient = useQueryClient();
	const wideTable = useMediaQuery("(min-width: 1024px)");
	const [query, setQuery] = useState("");
	const debouncedQuery = useDebounce(query.trim(), 300);
	const [page, setPage] = useState(1);
	const [selected, setSelected] = useState<Set<string>>(new Set());
	const listQuery = useQuery({
		...orpc.readListen.pairQueue.queryOptions({
			input: {
				state,
				query: debouncedQuery || undefined,
				offset: (page - 1) * PAGE_SIZE,
				limit: PAGE_SIZE,
			},
		}),
		placeholderData: keepPreviousData,
		staleTime: 0,
		refetchOnWindowFocus: false,
	});
	const items = listQuery.data?.items ?? [];
	const total = listQuery.data?.total ?? 0;
	const generatable = GENERATABLE.has(state);
	const generateMutation = useMutation({
		mutationFn: (pairUuids: string[]) =>
			client.readListen.generateAlignments({ pairUuids }),
		onSuccess: ({ enqueued, failed }) => {
			if (enqueued > 0)
				toast.success(
					m["read_listen.generation_enqueued"]({ count: enqueued }),
				);
			if (failed.length > 0)
				toast.error(
					m["read_listen.generation_partial_failed"]({
						count: failed.length,
					}),
					{ description: failed[0]?.message },
				);
			setSelected(new Set());
		},
		onError: (error) =>
			toast.error(getErrorMessage(error, m["read_listen.pairs_failed"]())),
		onSettled: () =>
			queryClient.invalidateQueries({ queryKey: orpc.readListen.key() }),
	});
	const busy = generateMutation.isPending;
	const pageIds = items.map((pairing) => pairing.id);
	const allPageSelected =
		pageIds.length > 0 && pageIds.every((id) => selected.has(id));
	const toggle = (id: string) =>
		setSelected((current) => {
			const next = new Set(current);
			if (next.has(id)) next.delete(id);
			else next.add(id);
			return next;
		});
	const togglePage = () =>
		setSelected(allPageSelected ? new Set() : new Set(pageIds));

	const renderActions = (pairing: Pairing) => (
		<>
			{generatable && (
				<Button
					size="sm"
					variant={state === "failed" ? "outline" : "default"}
					disabled={busy}
					onClick={() => generateMutation.mutate([pairing.id])}
				>
					{state === "failed" || isOutdated(pairing) ? (
						<ArrowsClockwise data-icon="inline-start" />
					) : (
						<Waveform data-icon="inline-start" />
					)}
					{generateLabel(state, pairing)}
				</Button>
			)}
			<OpenAudiobookLink uuid={pairing.audiobook.uuid} />
		</>
	);

	return (
		<section className="flex min-h-0 min-w-0 flex-1 flex-col">
			<TrayToolbar>
				{scopeButton}
				<h2 className="hidden font-medium text-sm lg:block">
					{PAIR_VIEW_LABELS[state]()}
				</h2>
				<TraySearch
					value={query}
					onValueChange={(value) => {
						setQuery(value);
						setPage(1);
						setSelected(new Set());
					}}
					placeholder={m["read_listen.search_matches_placeholder"]()}
				/>
			</TrayToolbar>

			<div className="min-h-0 flex-1 overflow-auto overscroll-contain">
				{listQuery.isLoading ? (
					<TrayListSkeleton />
				) : items.length === 0 ? (
					<EmptyState
						title={m["read_listen.pairs_empty"]()}
						description={m["read_listen.pairs_empty_description"]()}
					/>
				) : wideTable ? (
					<TrayTable
						label={PAIR_VIEW_LABELS[state]()}
						gridClassName={generatable ? PAIR_GRID : PAIR_GRID_READONLY}
						dimmed={listQuery.isPlaceholderData}
						header={
							<>
								{generatable && (
									<TraySelectCell
										header
										checked={allPageSelected}
										indeterminate={!allPageSelected && selected.size > 0}
										onToggle={togglePage}
										label={m["read_listen.select_page_matches"]()}
									/>
								)}
								<TrayHeaderCell>{m["read_listen.audiobook"]()}</TrayHeaderCell>
								<TrayHeaderCell>{m["read_listen.ebook"]()}</TrayHeaderCell>
								<TrayHeaderCell>{m["enrichment.col_status"]()}</TrayHeaderCell>
								<TrayHeaderCell className="justify-end">
									{m["read_listen.actions"]()}
								</TrayHeaderCell>
							</>
						}
					>
						{items.map((pairing) => (
							<TrayRow
								key={pairing.id}
								rowKey={pairing.id}
								selected={selected.has(pairing.id)}
							>
								{generatable && (
									<TraySelectCell
										checked={selected.has(pairing.id)}
										disabled={busy}
										onToggle={() => toggle(pairing.id)}
										label={pairing.audiobook.title}
									/>
								)}
								<TrayCell className="min-h-16">
									<PublicationLink
										publication={pairing.audiobook}
										mediaType="audiobook"
									/>
								</TrayCell>
								<TrayCell>
									<PublicationLink
										publication={pairing.ebook}
										mediaType="ebook"
									/>
								</TrayCell>
								<TrayCell>
									<PairStateNote
										pairing={pairing}
										state={state}
										placeholder={
											<span className="text-muted-foreground/50 text-sm">
												—
											</span>
										}
									/>
								</TrayCell>
								<TrayCell className="justify-end gap-1.5">
									{renderActions(pairing)}
								</TrayCell>
							</TrayRow>
						))}
					</TrayTable>
				) : (
					<ul
						className={cn(
							listQuery.isPlaceholderData && "pointer-events-none opacity-50",
						)}
					>
						{items.map((pairing) => (
							<li
								key={pairing.id}
								className={cn(
									"flex items-start gap-3 border-border/50 border-b px-3 py-3",
									selected.has(pairing.id) && "bg-primary/6",
								)}
							>
								{generatable && (
									<Checkbox
										checked={selected.has(pairing.id)}
										disabled={busy}
										onCheckedChange={() => toggle(pairing.id)}
										aria-label={pairing.audiobook.title}
										className="mt-1"
									/>
								)}
								<div className="flex min-w-0 flex-1 flex-col gap-2">
									<PublicationLink
										publication={pairing.audiobook}
										mediaType="audiobook"
									/>
									<PublicationLink
										publication={pairing.ebook}
										mediaType="ebook"
									/>
									<PairStateNote pairing={pairing} state={state} />
									<div className="flex items-center gap-1.5">
										{renderActions(pairing)}
									</div>
								</div>
							</li>
						))}
					</ul>
				)}
			</div>

			{generatable && selected.size > 0 && (
				<TrayBulkBar
					count={selected.size}
					total={total}
					offerSelectAll={false}
					onSelectAll={() => {}}
					onClear={() => setSelected(new Set())}
					busy={busy}
				>
					<Button
						size="sm"
						disabled={busy}
						onClick={() => generateMutation.mutate([...selected])}
					>
						<Waveform data-icon="inline-start" />
						{m["read_listen.generate_selected"]({ count: selected.size })}
					</Button>
				</TrayBulkBar>
			)}

			{!listQuery.isLoading && total > 0 && (
				<TrayPagination
					offset={(page - 1) * PAGE_SIZE}
					pageSize={PAGE_SIZE}
					total={total}
					currentPage={page}
					totalPages={Math.ceil(total / PAGE_SIZE)}
					onPageChange={(next) => {
						setPage(next);
						setSelected(new Set());
					}}
				/>
			)}
		</section>
	);
}

// ─── Audiobooks the matcher found nothing for ─────────────

const UNMATCHED_GRID =
	"grid min-w-[640px] grid-cols-[minmax(14rem,1.4fr)_minmax(10rem,1fr)_auto]";

function UnmatchedPanel({ scopeButton }: { scopeButton: ReactNode }) {
	const queryClient = useQueryClient();
	const wideTable = useMediaQuery("(min-width: 1024px)");
	const [query, setQuery] = useState("");
	const debouncedQuery = useDebounce(query.trim(), 300);
	const [page, setPage] = useState(1);
	const [pairing, setPairing] = useState<Publication | null>(null);
	const listQuery = useQuery({
		...orpc.readListen.unmatchedAudiobooks.queryOptions({
			input: {
				query: debouncedQuery || undefined,
				offset: (page - 1) * PAGE_SIZE,
				limit: PAGE_SIZE,
			},
		}),
		placeholderData: keepPreviousData,
		staleTime: 0,
		refetchOnWindowFocus: false,
	});
	const items = listQuery.data?.items ?? [];
	const total = listQuery.data?.total ?? 0;
	const associateMutation = useMutation({
		mutationFn: (input: { audiobook: Publication; ebook: Candidate }) =>
			client.readListen.associate({
				publicationUuid: input.audiobook.uuid,
				candidateUuid: input.ebook.uuid,
			}),
		onSuccess: () => {
			toast.success(m["read_listen.paired_manually"]());
			setPairing(null);
		},
		onError: (error) =>
			toast.error(getErrorMessage(error, m["read_listen.remove_failed"]())),
		onSettled: () =>
			queryClient.invalidateQueries({ queryKey: orpc.readListen.key() }),
	});
	const detail = (item: (typeof items)[number]) =>
		item.maxScore == null
			? m["read_listen.unmatched_detail_none"]({ count: item.candidateCount })
			: m["read_listen.unmatched_detail"]({
					count: item.candidateCount,
					score: item.maxScore,
				});
	const pairButton = (audiobook: Publication) => (
		<Button size="sm" variant="outline" onClick={() => setPairing(audiobook)}>
			<MagnifyingGlass data-icon="inline-start" />
			{m["read_listen.action_pair_manually"]()}
		</Button>
	);

	return (
		<section className="flex min-h-0 min-w-0 flex-1 flex-col">
			<TrayToolbar>
				{scopeButton}
				<h2 className="hidden font-medium text-sm lg:block">
					{PAIR_VIEW_LABELS.unmatched()}
				</h2>
				<TraySearch
					value={query}
					onValueChange={(value) => {
						setQuery(value);
						setPage(1);
					}}
					placeholder={m["read_listen.search_matches_placeholder"]()}
				/>
			</TrayToolbar>
			<div className="min-h-0 flex-1 overflow-auto overscroll-contain">
				{listQuery.isLoading ? (
					<TrayListSkeleton />
				) : items.length === 0 ? (
					<EmptyState
						title={m["read_listen.unmatched_empty"]()}
						description={m["read_listen.unmatched_empty_description"]()}
					/>
				) : wideTable ? (
					<TrayTable
						label={PAIR_VIEW_LABELS.unmatched()}
						gridClassName={UNMATCHED_GRID}
						dimmed={listQuery.isPlaceholderData}
						header={
							<>
								<TrayHeaderCell>{m["read_listen.audiobook"]()}</TrayHeaderCell>
								<TrayHeaderCell>{m["read_listen.matches"]()}</TrayHeaderCell>
								<TrayHeaderCell className="justify-end">
									{m["read_listen.actions"]()}
								</TrayHeaderCell>
							</>
						}
					>
						{items.map((item) => (
							<TrayRow
								key={item.audiobook.uuid}
								rowKey={item.audiobook.uuid}
								selected={false}
							>
								<TrayCell className="min-h-16">
									<PublicationLink
										publication={item.audiobook}
										mediaType="audiobook"
									/>
								</TrayCell>
								<TrayCell>
									<span className="text-muted-foreground text-xs">
										{detail(item)}
									</span>
								</TrayCell>
								<TrayCell className="justify-end">
									{pairButton(item.audiobook)}
								</TrayCell>
							</TrayRow>
						))}
					</TrayTable>
				) : (
					<ul>
						{items.map((item) => (
							<li
								key={item.audiobook.uuid}
								className="flex flex-col gap-2 border-border/50 border-b px-3 py-3"
							>
								<PublicationLink
									publication={item.audiobook}
									mediaType="audiobook"
								/>
								<span className="text-muted-foreground text-xs">
									{detail(item)}
								</span>
								<div>{pairButton(item.audiobook)}</div>
							</li>
						))}
					</ul>
				)}
			</div>
			{!listQuery.isLoading && total > 0 && (
				<TrayPagination
					offset={(page - 1) * PAGE_SIZE}
					pageSize={PAGE_SIZE}
					total={total}
					currentPage={page}
					totalPages={Math.ceil(total / PAGE_SIZE)}
					onPageChange={setPage}
				/>
			)}
			{pairing && (
				<EbookPickerDialog
					audiobook={pairing}
					title={m["read_listen.pair_manually_title"]()}
					description={m["read_listen.pair_manually_description"]()}
					isPending={associateMutation.isPending}
					onOpenChange={(open) => !open && setPairing(null)}
					onSelect={(ebook) =>
						associateMutation.mutate({ audiobook: pairing, ebook })
					}
				/>
			)}
		</section>
	);
}
