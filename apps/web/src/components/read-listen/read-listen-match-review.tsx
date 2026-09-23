import type { Task } from "@nanahoshi/api/modules/taskManager";
import {
	BookOpen,
	Check,
	CheckCircle,
	CircleNotch,
	DotsThree,
	FunnelSimple,
	Headphones,
	Hourglass,
	MagnifyingGlass,
	Sparkle,
	Trash,
	X,
} from "@phosphor-icons/react";
import {
	keepPreviousData,
	useMutation,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { type ReactNode, useId, useState } from "react";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
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
import { cn } from "@/lib/utils";
import { m } from "@/paraglide/messages";
import {
	COVER_EDGE,
	coverPresets,
	getCoverFilename,
	getCoverPresetUrl,
	getCoverSrcSet,
} from "@/utils/covers";
import { formatNames, getErrorMessage } from "@/utils/format";
import { client, orpc } from "@/utils/orpc";

type Proposal = Awaited<
	ReturnType<typeof client.readListen.listMatchProposals>
>["items"][number];
type Candidate = Awaited<
	ReturnType<typeof client.readListen.searchCandidates>
>["candidates"][number];

type ReviewStatus = "pending" | "decided";
type RemovalTarget = {
	proposalUuid: string;
	kind: "pending" | "reviewed";
};
type ReviewFilter = { status: ReviewStatus; query?: string };
type BulkTarget = { proposalUuids: string[] } | { filter: ReviewFilter };
type RemovalRequest = {
	target: BulkTarget;
	count: number;
	kind: "pending" | "reviewed";
};

export function getReviewSelectionTarget(input: {
	selectAllFilter: boolean;
	status: ReviewStatus;
	query?: string;
	selected: Iterable<string>;
}): BulkTarget {
	return input.selectAllFilter
		? {
				filter: {
					status: input.status,
					query: input.query || undefined,
				},
			}
		: { proposalUuids: [...input.selected] };
}

export function getMatchReviewPageQueryOptions(input: {
	status: ReviewStatus;
	query?: string;
	offset: number;
	limit: number;
}) {
	return {
		...orpc.readListen.listMatchProposals.queryOptions({ input }),
		placeholderData: keepPreviousData,
	};
}

export function clampMatchReviewPage(page: number, total: number): number {
	return Math.max(
		0,
		Math.min(page, Math.max(0, Math.ceil(total / PAGE_SIZE) - 1)),
	);
}

const PAGE_SIZE = 10;

// Columns for the shared tray table: checkbox, both publications, then the
// score badges and actions sized to their widest cell on the page.
const PAIR_TABLE_GRID =
	"grid min-w-[760px] grid-cols-[2.5rem_minmax(12rem,1fr)_minmax(12rem,1fr)_auto_auto]";

export function getRemovalTarget(
	proposal: Pick<Proposal, "id" | "removable" | "status">,
): RemovalTarget | null {
	return proposal.removable
		? {
				proposalUuid: proposal.id,
				kind: proposal.status === "pending" ? "pending" : "reviewed",
			}
		: null;
}

function decisionLabel(action: "approve" | "reject" | "correct"): string {
	if (action === "approve") return m["read_listen.decision_approve"]();
	if (action === "reject") return m["read_listen.decision_reject"]();
	return m["read_listen.decision_correct"]();
}

function decisionBadgeVariant(
	action: "approve" | "reject" | "correct",
): "success" | "destructive" | "info" {
	if (action === "approve") return "success";
	if (action === "reject") return "destructive";
	return "info";
}

export function getMatchWarningLabel(warning: string): string | null {
	if (warning === "title.weak") return m["read_listen.match_title_weak"]();
	if (warning === "author.mismatch")
		return m["read_listen.match_author_mismatch"]();
	if (warning === "series.position.conflict")
		return m["read_listen.match_series_position_mismatch"]();
	return null;
}

export function MatchPublicationArtwork({
	cover,
	mediaType,
}: {
	cover: string | null;
	mediaType: "ebook" | "audiobook";
}) {
	const coverFilename = getCoverFilename(cover);
	const isAudiobook = mediaType === "audiobook";
	const frameClass = isAudiobook ? "size-11" : "h-11 w-8";

	if (coverFilename) {
		return (
			<img
				alt=""
				width={isAudiobook ? 44 : 32}
				height={44}
				loading="lazy"
				decoding="async"
				src={getCoverPresetUrl(coverFilename, coverPresets.thumbnail)}
				srcSet={getCoverSrcSet(coverFilename, coverPresets.thumbnail.widths)}
				sizes={coverPresets.thumbnail.sizes}
				className={cn(
					frameClass,
					COVER_EDGE,
					"shrink-0 rounded-md object-cover",
				)}
			/>
		);
	}

	const Icon = isAudiobook ? Headphones : BookOpen;
	return (
		<div
			aria-hidden="true"
			className={cn(
				frameClass,
				"grid shrink-0 place-items-center rounded-md bg-background text-muted-foreground shadow-sm",
			)}
		>
			<Icon className="size-5" />
		</div>
	);
}

function PublicationLink({
	publication,
	mediaType,
}: {
	publication: Proposal["ebook"] | Proposal["audiobook"];
	mediaType: "ebook" | "audiobook";
}) {
	return (
		<Link
			to={
				mediaType === "ebook"
					? "/dashboard/books/$uuid"
					: "/dashboard/audiobooks/$uuid"
			}
			params={{ uuid: publication.uuid }}
			preload="intent"
			className="group flex min-w-0 items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
		>
			<MatchPublicationArtwork
				cover={publication.cover}
				mediaType={mediaType}
			/>
			<div className="min-w-0">
				<p className="text-[0.6875rem] text-muted-foreground leading-none md:hidden">
					{mediaType === "ebook"
						? m["read_listen.ebook"]()
						: m["read_listen.audiobook"]()}
				</p>
				<p
					title={publication.title}
					className="truncate font-medium text-sm group-hover:underline group-hover:decoration-1 group-hover:underline-offset-2"
				>
					{publication.title}
				</p>
				{publication.authors.length > 0 && (
					<p className="truncate text-muted-foreground text-xs">
						{formatNames(publication.authors)}
					</p>
				)}
			</div>
		</Link>
	);
}

function CorrectionDialog({
	proposal,
	onOpenChange,
	onSelect,
	isPending,
}: {
	proposal: Proposal;
	onOpenChange: (open: boolean) => void;
	onSelect: (candidate: Candidate) => void;
	isPending: boolean;
}) {
	const inputId = useId();
	const [query, setQuery] = useState(proposal.audiobook.title);
	const debouncedQuery = useDebounce(query.trim(), 300);
	const candidatesQuery = useQuery({
		...orpc.readListen.searchCandidates.queryOptions({
			input: {
				publicationUuid: proposal.audiobook.uuid,
				query: debouncedQuery || proposal.audiobook.title,
				limit: 8,
			},
		}),
		enabled: debouncedQuery.length > 0,
	});
	const candidates = (candidatesQuery.data?.candidates ?? []).filter(
		(candidate) =>
			candidate.uuid !== proposal.ebook.uuid && !candidate.isPaired,
	);

	return (
		<Modal
			open
			onOpenChange={(open) => {
				if (!isPending) onOpenChange(open);
			}}
			title={m["read_listen.correct_match_title"]()}
			description={m["read_listen.correct_match_description"]()}
			className="sm:max-w-xl"
		>
			<div className="flex flex-col gap-4">
				<FieldGroup>
					<Field>
						<FieldLabel htmlFor={inputId}>
							{m["read_listen.search_ebook_label"]()}
						</FieldLabel>
						<Input
							id={inputId}
							type="search"
							name="ebook-search"
							autoFocus
							value={query}
							onChange={(event) => setQuery(event.target.value)}
							placeholder={m["read_listen.search_placeholder"]()}
							className="h-10! sm:h-8!"
						/>
					</Field>
				</FieldGroup>
				{candidatesQuery.isFetching ? (
					<div className="flex items-center gap-2 py-6 text-muted-foreground text-sm">
						<CircleNotch
							aria-hidden="true"
							className="size-4 animate-spin motion-reduce:animate-none"
						/>
						{m["read_listen.searching"]()}
					</div>
				) : (
					<div className="flex flex-col gap-2">
						{candidates.map((candidate) => (
							<button
								type="button"
								key={candidate.uuid}
								disabled={isPending}
								onClick={() => onSelect(candidate)}
								className="flex w-full items-center gap-3 rounded-xl bg-muted/45 p-3 text-start transition-[background-color,transform] hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.96] disabled:opacity-50 motion-reduce:transition-none motion-reduce:active:scale-100"
							>
								<BookOpen aria-hidden="true" className="size-4 shrink-0" />
								<span className="min-w-0">
									<span
										title={candidate.title}
										className="block truncate font-medium"
									>
										{candidate.title}
									</span>
									<span className="block truncate text-muted-foreground text-xs">
										{candidate.filename}
									</span>
								</span>
							</button>
						))}
						{debouncedQuery && candidates.length === 0 && (
							<p className="py-6 text-muted-foreground text-sm">
								{m["read_listen.no_matches"]()}
							</p>
						)}
					</div>
				)}
			</div>
		</Modal>
	);
}

/**
 * Read & Listen match review as a panel of the metadata tray: the tray's
 * sidebar owns the status, this owns the list, selection and decisions.
 * Mount it keyed by status so paging and selection start fresh per view.
 */
export function ReadListenReviewPanel({
	status,
	scopeButton,
	onShowPending,
}: {
	status: ReviewStatus;
	/** The tray's sidebar trigger, shown where the sidebar is collapsed. */
	scopeButton?: ReactNode;
	onShowPending: () => void;
}) {
	const queryClient = useQueryClient();
	const [query, setQuery] = useState("");
	const [page, setPage] = useState(0);
	const [selected, setSelected] = useState<Set<string>>(new Set());
	const [selectAllFilter, setSelectAllFilter] = useState(false);
	const [correction, setCorrection] = useState<Proposal | null>(null);
	const [removalRequest, setRemovalRequest] = useState<RemovalRequest | null>(
		null,
	);
	const { data: activeTasks } = useQuery(
		orpc.tasks.getActiveTasks.queryOptions(),
	);
	const analysisTask = (activeTasks ?? []).find(
		(task: Task) => task.type === "read-listen-match-analysis",
	);
	const debouncedQuery = useDebounce(query.trim(), 300);
	const hasSearch = debouncedQuery.length > 0;
	const proposalsQuery = useQuery(
		getMatchReviewPageQueryOptions({
			status,
			query: debouncedQuery || undefined,
			offset: page * PAGE_SIZE,
			limit: PAGE_SIZE,
		}),
	);
	const proposals = proposalsQuery.data?.items ?? [];
	const total = proposalsQuery.data?.total ?? 0;
	const showLoadError = proposalsQuery.isError && proposals.length === 0;
	const totalPages = Math.ceil(total / PAGE_SIZE);
	const currentPage = page + 1;
	// A decision can empty the last page; step back once real totals arrive.
	if (!proposalsQuery.isPlaceholderData && proposalsQuery.data) {
		const clampedPage = clampMatchReviewPage(page, total);
		if (clampedPage !== page) setPage(clampedPage);
	}
	const selectableIds = proposals
		.filter((proposal) => status === "pending" || getRemovalTarget(proposal))
		.map((proposal) => proposal.id);
	const allPageSelected =
		selectableIds.length > 0 &&
		selectableIds.every((proposalId) => selected.has(proposalId));
	const headerChecked = selectAllFilter || allPageSelected;
	const somePageSelected = selectableIds.some((proposalId) =>
		selected.has(proposalId),
	);
	const selectedProposals = proposals.filter((proposal) =>
		selected.has(proposal.id),
	);
	const hasCompetingSelections =
		selectAllFilter ||
		new Set(selectedProposals.map((proposal) => proposal.audiobook.uuid)).size <
			selectedProposals.length;
	const selectionCount = selectAllFilter ? total : selected.size;
	const selectionTarget = getReviewSelectionTarget({
		selectAllFilter,
		status,
		query: debouncedQuery,
		selected,
	});
	const removingPendingResults = removalRequest?.kind === "pending";

	function clearSelection() {
		setSelected(new Set());
		setSelectAllFilter(false);
	}

	function changePage(nextPage: number) {
		setPage(nextPage - 1);
		if (!selectAllFilter) clearSelection();
	}

	function toggleProposal(proposalId: string) {
		setSelectAllFilter(false);
		setSelected((current) => {
			const next = new Set(current);
			if (next.has(proposalId)) next.delete(proposalId);
			else next.add(proposalId);
			return next;
		});
	}

	function togglePageSelection() {
		setSelectAllFilter(false);
		setSelected((current) => {
			const next = new Set(current);
			if (selectableIds.every((proposalId) => next.has(proposalId))) {
				for (const proposalId of selectableIds) next.delete(proposalId);
			} else {
				for (const proposalId of selectableIds) next.add(proposalId);
			}
			return next;
		});
	}

	function requestRemoval(targets: RemovalTarget[]) {
		if (targets.length === 0) return;
		setRemovalRequest({
			target: {
				proposalUuids: targets.map((target) => target.proposalUuid),
			},
			count: targets.length,
			kind: targets.every((target) => target.kind === "pending")
				? "pending"
				: "reviewed",
		});
	}

	async function invalidateMatches() {
		await queryClient.invalidateQueries({ queryKey: orpc.readListen.key() });
	}

	const analysisMutation = useMutation({
		mutationFn: () => client.readListen.startMatchAnalysis({}),
		onSuccess: (result) => {
			toast.success(
				result.reused
					? m["read_listen.match_analysis_reused"]()
					: m["read_listen.match_analysis_started"]({
							count: result.candidateCount,
						}),
			);
			setPage(0);
			clearSelection();
			onShowPending();
			void queryClient.invalidateQueries({
				queryKey: orpc.tasks.getActiveTasks.queryOptions().queryKey,
			});
		},
		onError: (error) =>
			toast.error(
				getErrorMessage(error, m["read_listen.match_analysis_start_failed"]()),
			),
	});
	const decisionMutation = useMutation({
		mutationFn: (
			input:
				| { proposalUuid: string; action: "approve" | "reject" }
				| {
						proposalUuid: string;
						action: "correct";
						selectedEbookUuid: string;
				  },
		) => client.readListen.decideMatchProposal(input),
		onSuccess: (_, input) => {
			toast.success(
				input.action === "reject"
					? m["read_listen.match_rejected"]()
					: m["read_listen.match_confirmed"](),
			);
			setCorrection(null);
			setPage(0);
			clearSelection();
		},
		onError: (error) => {
			clearSelection();
			toast.error(
				getErrorMessage(error, m["read_listen.match_decision_failed"]()),
			);
		},
		onSettled: invalidateMatches,
	});
	const bulkDecisionMutation = useMutation({
		mutationFn: (input: {
			target: BulkTarget;
			action: "approve" | "reject";
			count: number;
		}) =>
			client.readListen.decideMatchProposals({
				target: input.target as
					| { proposalUuids: string[] }
					| { filter: { status: "pending"; query?: string } },
				action: input.action,
			}),
		onSuccess: (_, input) => {
			toast.success(
				m["read_listen.bulk_decision_completed"]({
					count: input.count,
				}),
			);
			setPage(0);
			clearSelection();
		},
		onError: (error) => {
			clearSelection();
			toast.error(
				getErrorMessage(error, m["read_listen.match_decision_failed"]()),
			);
		},
		onSettled: invalidateMatches,
	});
	const removePairMutation = useMutation({
		mutationFn: (request: RemovalRequest) =>
			client.readListen.removeReviewedMatches(request.target),
		onSuccess: (_, request) => {
			toast.success(m["read_listen.matches_removed"]({ count: request.count }));
			setRemovalRequest(null);
			clearSelection();
		},
		onError: (error) => {
			setRemovalRequest(null);
			clearSelection();
			toast.error(getErrorMessage(error, m["read_listen.remove_failed"]()));
		},
		onSettled: invalidateMatches,
	});
	const busy =
		Boolean(analysisTask) ||
		analysisMutation.isPending ||
		decisionMutation.isPending ||
		bulkDecisionMutation.isPending ||
		removePairMutation.isPending;

	const wideTable = useMediaQuery("(min-width: 1024px)");
	const canSelect = (proposal: Proposal) =>
		status === "pending" || Boolean(getRemovalTarget(proposal));
	const displayedEbook = (proposal: Proposal) =>
		proposal.decision?.selectedEbook ?? proposal.ebook;
	const renderBadges = (proposal: Proposal) => (
		<>
			{proposal.origin === "manual" ? (
				<span className="font-medium text-muted-foreground text-xs">
					{m["read_listen.manual_pairing"]()}
				</span>
			) : (
				<Badge variant={proposal.confidence === "high" ? "success" : "warning"}>
					{m["read_listen.match_score"]({ score: proposal.score ?? 0 })}
				</Badge>
			)}
			{proposal.warnings.map((warning) => {
				const label = getMatchWarningLabel(warning);
				return label ? (
					<Badge key={warning} variant="warning">
						{label}
					</Badge>
				) : null;
			})}
			{proposal.origin === "matcher" && proposal.decision && (
				<Badge variant={decisionBadgeVariant(proposal.decision.action)}>
					{decisionLabel(proposal.decision.action)}
				</Badge>
			)}
		</>
	);
	const renderActions = (proposal: Proposal) => {
		const isPending =
			decisionMutation.isPending &&
			decisionMutation.variables?.proposalUuid === proposal.id;
		if (status !== "pending") {
			const target = getRemovalTarget(proposal);
			return target ? (
				<Button
					variant="destructive"
					size="sm"
					disabled={busy}
					onClick={() => requestRemoval([target])}
				>
					<Trash aria-hidden="true" data-icon="inline-start" />
					{proposal.decision?.action === "reject"
						? m["read_listen.remove_review"]()
						: m["read_listen.remove_match"]()}
				</Button>
			) : null;
		}
		return (
			<>
				<Button
					size="sm"
					disabled={isPending || busy}
					onClick={() =>
						decisionMutation.mutate({
							proposalUuid: proposal.id,
							action: "approve",
						})
					}
				>
					{isPending ? (
						<CircleNotch
							aria-hidden="true"
							data-icon="inline-start"
							className="animate-spin motion-reduce:animate-none"
						/>
					) : (
						<Check aria-hidden="true" data-icon="inline-start" />
					)}
					{m["read_listen.approve_match"]()}
				</Button>
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button
							variant="ghost"
							size="icon-sm"
							disabled={isPending || busy}
							aria-label={m["aria.more_actions"]()}
						>
							<DotsThree aria-hidden="true" />
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end" className="min-w-52">
						<DropdownMenuGroup>
							<DropdownMenuItem onClick={() => setCorrection(proposal)}>
								<MagnifyingGlass aria-hidden="true" />
								{m["read_listen.choose_another_ebook"]()}
							</DropdownMenuItem>
							<DropdownMenuItem
								variant="destructive"
								onClick={() =>
									decisionMutation.mutate({
										proposalUuid: proposal.id,
										action: "reject",
									})
								}
							>
								<X aria-hidden="true" />
								{m["read_listen.reject_match"]()}
							</DropdownMenuItem>
							<DropdownMenuItem
								variant="destructive"
								onClick={() => {
									const target = getRemovalTarget(proposal);
									if (target) requestRemoval([target]);
								}}
							>
								<Trash aria-hidden="true" />
								{m["read_listen.remove_pending_result"]()}
							</DropdownMenuItem>
						</DropdownMenuGroup>
					</DropdownMenuContent>
				</DropdownMenu>
			</>
		);
	};

	const analysisButton = (
		<Button
			variant="ghost"
			size="sm"
			disabled={Boolean(analysisTask) || analysisMutation.isPending}
			onClick={() => analysisMutation.mutate()}
		>
			{analysisTask || analysisMutation.isPending ? (
				<CircleNotch
					aria-hidden="true"
					data-icon="inline-start"
					className="animate-spin motion-reduce:animate-none"
				/>
			) : (
				<Sparkle aria-hidden="true" data-icon="inline-start" />
			)}
			<span className="hidden sm:inline">
				{analysisTask
					? m["read_listen.match_analysis_progress"]({
							done: analysisTask.completedJobs,
							total: analysisTask.totalJobs,
						})
					: m["read_listen.analyze_next_batch"]()}
			</span>
		</Button>
	);

	return (
		<section
			className="flex min-h-0 min-w-0 flex-1 flex-col motion-reduce:[&_button]:transition-none motion-reduce:[&_button]:active:scale-100"
			aria-label={m["read_listen.matches"]()}
		>
			<p
				role="status"
				aria-live="polite"
				aria-atomic="true"
				className="sr-only"
			>
				{proposalsQuery.isLoading
					? m["common.loading"]()
					: showLoadError
						? m["read_listen.match_proposals_load_failed"]()
						: m["read_listen.results_count"]({ count: total })}
			</p>
			<TrayToolbar>
				{scopeButton}
				<h2 className="hidden font-medium text-sm lg:block">
					{status === "pending"
						? m["read_listen.pending_matches"]()
						: m["read_listen.reviewed_matches"]()}
				</h2>
				{analysisButton}
				<TraySearch
					value={query}
					onValueChange={(value) => {
						setQuery(value);
						setPage(0);
						clearSelection();
					}}
					placeholder={m["read_listen.search_matches_placeholder"]()}
				/>
			</TrayToolbar>

			<div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
				{proposalsQuery.isLoading && (
					<div aria-busy="true">
						<span className="sr-only">{m["common.loading"]()}</span>
						<div className="flex h-8 items-center border-border/60 border-b">
							<div className="flex w-11 shrink-0 justify-center">
								<Skeleton className="size-4 rounded-[5px]" />
							</div>
							<Skeleton className="h-3 w-20 rounded-sm" />
						</div>
						{[0, 1, 2, 3, 4, 5, 6, 7].map((key) => (
							<div
								key={key}
								className="flex min-h-16 items-center border-border/40 border-b"
							>
								<div className="flex w-11 shrink-0 justify-center">
									<Skeleton className="size-4 rounded-[5px]" />
								</div>
								<div className="flex flex-1 items-center gap-3 pe-3">
									<Skeleton className="size-11 shrink-0 rounded" />
									<Skeleton className="h-3.5 w-48 max-w-[35%] rounded-sm" />
									<Skeleton className="ms-auto hidden h-5 w-20 rounded-2xl md:block" />
								</div>
							</div>
						))}
					</div>
				)}

				{showLoadError && (
					<EmptyState
						title={m["read_listen.match_proposals_load_failed"]()}
						description={m[
							"read_listen.match_proposals_load_failed_description"
						]()}
					>
						<Button variant="outline" onClick={() => proposalsQuery.refetch()}>
							{m["common.retry"]()}
						</Button>
					</EmptyState>
				)}

				{!proposalsQuery.isLoading &&
					!showLoadError &&
					proposals.length === 0 && (
						<EmptyState
							title={
								hasSearch
									? m["read_listen.no_match_search_results"]({
											query: debouncedQuery,
										})
									: status === "pending"
										? m["read_listen.no_match_proposals"]()
										: m["read_listen.no_reviewed_matches"]()
							}
							description={
								hasSearch
									? m["read_listen.no_match_search_results_description"]()
									: status === "pending"
										? m["read_listen.no_match_proposals_description"]()
										: m["read_listen.no_reviewed_matches_description"]()
							}
						>
							{hasSearch && (
								<Button
									variant="outline"
									onClick={() => {
										setQuery("");
										setPage(0);
									}}
								>
									{m["common.clear_search"]()}
								</Button>
							)}
						</EmptyState>
					)}

				{!proposalsQuery.isLoading &&
					proposals.length > 0 &&
					(wideTable ? (
						<TrayTable
							label={m["read_listen.matches"]()}
							gridClassName={PAIR_TABLE_GRID}
							dimmed={proposalsQuery.isPlaceholderData}
							header={
								<>
									<TraySelectCell
										header
										checked={headerChecked}
										indeterminate={!headerChecked && somePageSelected}
										onToggle={togglePageSelection}
										label={m["read_listen.select_page_matches"]()}
									/>
									<TrayHeaderCell>
										{m["read_listen.audiobook"]()}
									</TrayHeaderCell>
									<TrayHeaderCell>{m["read_listen.ebook"]()}</TrayHeaderCell>
									<TrayHeaderCell>{m["read_listen.matches"]()}</TrayHeaderCell>
									<TrayHeaderCell className="justify-end">
										{m["read_listen.actions"]()}
									</TrayHeaderCell>
								</>
							}
						>
							{proposals.map((proposal) => (
								<TrayRow
									key={proposal.id}
									rowKey={proposal.id}
									selected={selectAllFilter || selected.has(proposal.id)}
								>
									<TraySelectCell
										checked={selectAllFilter || selected.has(proposal.id)}
										disabled={!canSelect(proposal) || busy}
										onToggle={() => toggleProposal(proposal.id)}
										label={m["read_listen.select_match"]({
											title: proposal.audiobook.title,
										})}
									/>
									<TrayCell className="min-h-16">
										<PublicationLink
											publication={proposal.audiobook}
											mediaType="audiobook"
										/>
									</TrayCell>
									<TrayCell>
										<PublicationLink
											publication={displayedEbook(proposal)}
											mediaType="ebook"
										/>
									</TrayCell>
									<TrayCell className="flex-wrap gap-1.5">
										{renderBadges(proposal)}
									</TrayCell>
									<TrayCell className="justify-end gap-1.5">
										{renderActions(proposal)}
									</TrayCell>
								</TrayRow>
							))}
						</TrayTable>
					) : (
						<ul
							className={cn(
								proposalsQuery.isPlaceholderData &&
									"pointer-events-none opacity-50",
							)}
						>
							{proposals.map((proposal) => (
								<li
									key={proposal.id}
									className={cn(
										"flex items-start gap-3 border-border/50 border-b px-3 py-3",
										(selectAllFilter || selected.has(proposal.id)) &&
											"bg-primary/6",
									)}
								>
									<Checkbox
										checked={selectAllFilter || selected.has(proposal.id)}
										disabled={!canSelect(proposal) || busy}
										onCheckedChange={() => toggleProposal(proposal.id)}
										aria-label={m["read_listen.select_match"]({
											title: proposal.audiobook.title,
										})}
										className="mt-1"
									/>
									<div className="flex min-w-0 flex-1 flex-col gap-2">
										<PublicationLink
											publication={proposal.audiobook}
											mediaType="audiobook"
										/>
										<PublicationLink
											publication={displayedEbook(proposal)}
											mediaType="ebook"
										/>
										<div className="flex flex-wrap items-center gap-1.5">
											{renderBadges(proposal)}
										</div>
										<div className="flex items-center gap-1.5">
											{renderActions(proposal)}
										</div>
									</div>
								</li>
							))}
						</ul>
					))}
			</div>

			{selectionCount > 0 && (
				<TrayBulkBar
					count={selectionCount}
					total={total}
					offerSelectAll={
						allPageSelected && total > selectableIds.length && !selectAllFilter
					}
					onSelectAll={() => setSelectAllFilter(true)}
					onClear={clearSelection}
					busy={busy}
				>
					{status === "pending" ? (
						<>
							<Button
								size="sm"
								disabled={busy || hasCompetingSelections}
								onClick={() =>
									bulkDecisionMutation.mutate({
										target: selectionTarget,
										action: "approve",
										count: selectionCount,
									})
								}
							>
								<Check aria-hidden="true" data-icon="inline-start" />
								{m["read_listen.approve_selected"]()}
							</Button>
							<Button
								size="sm"
								variant="outline"
								disabled={busy}
								onClick={() =>
									bulkDecisionMutation.mutate({
										target: selectionTarget,
										action: "reject",
										count: selectionCount,
									})
								}
							>
								<X aria-hidden="true" data-icon="inline-start" />
								{m["read_listen.reject_selected"]()}
							</Button>
							<Button
								size="sm"
								variant="destructive"
								disabled={busy}
								onClick={() =>
									setRemovalRequest({
										target: selectionTarget,
										count: selectionCount,
										kind: "pending",
									})
								}
							>
								<Trash aria-hidden="true" data-icon="inline-start" />
								{m["read_listen.remove_selected_results"]()}
							</Button>
						</>
					) : (
						<Button
							size="sm"
							variant="destructive"
							disabled={busy}
							onClick={() =>
								setRemovalRequest({
									target: selectionTarget,
									count: selectionCount,
									kind: "reviewed",
								})
							}
						>
							<Trash aria-hidden="true" data-icon="inline-start" />
							{m["read_listen.remove_selected_matches"]()}
						</Button>
					)}
					{status === "pending" && hasCompetingSelections && (
						<p className="w-full text-muted-foreground text-xs lg:w-auto">
							{m["read_listen.approve_competing_matches"]()}
						</p>
					)}
				</TrayBulkBar>
			)}

			{!proposalsQuery.isLoading && total > 0 && (
				<TrayPagination
					offset={page * PAGE_SIZE}
					pageSize={PAGE_SIZE}
					total={total}
					currentPage={currentPage}
					totalPages={totalPages}
					onPageChange={changePage}
				/>
			)}

			{correction && (
				<CorrectionDialog
					proposal={correction}
					onOpenChange={(open) => !open && setCorrection(null)}
					isPending={decisionMutation.isPending}
					onSelect={(candidate) =>
						decisionMutation.mutate({
							proposalUuid: correction.id,
							action: "correct",
							selectedEbookUuid: candidate.uuid,
						})
					}
				/>
			)}
			{removalRequest && (
				<Modal
					open
					onOpenChange={(open) => !open && setRemovalRequest(null)}
					title={
						removingPendingResults
							? m["read_listen.remove_pending_results_title"]()
							: m["read_listen.remove_matches_title"]()
					}
					description={
						removingPendingResults
							? m["read_listen.remove_pending_results_description"]({
									count: removalRequest.count,
								})
							: m["read_listen.remove_matches_description"]({
									count: removalRequest.count,
								})
					}
					footer={
						<>
							<Button
								variant="outline"
								className="motion-reduce:transition-none motion-reduce:active:scale-100"
								disabled={removePairMutation.isPending}
								onClick={() => setRemovalRequest(null)}
							>
								{m["common.cancel"]()}
							</Button>
							<Button
								variant="destructive"
								disabled={removePairMutation.isPending}
								onClick={() => removePairMutation.mutate(removalRequest)}
							>
								{removePairMutation.isPending && (
									<CircleNotch
										aria-hidden="true"
										className="animate-spin motion-reduce:animate-none"
									/>
								)}
								{removingPendingResults
									? m["read_listen.remove_pending_confirm"]()
									: m["read_listen.remove_reviewed_confirm"]()}
							</Button>
						</>
					}
				/>
			)}
		</section>
	);
}

function PairingsNav({
	status,
	pendingCount,
	onSelect,
}: {
	status: ReviewStatus;
	pendingCount: number | undefined;
	onSelect: (status: ReviewStatus) => void;
}) {
	return (
		<nav
			aria-label={m["read_listen.match_status_filter"]()}
			className="flex flex-col gap-0.5"
		>
			<NavRow
				active={status === "pending"}
				label={m["read_listen.pending_matches"]()}
				count={pendingCount}
				icon={<Hourglass />}
				onClick={() => onSelect("pending")}
			/>
			<NavRow
				active={status === "decided"}
				label={m["read_listen.reviewed_matches"]()}
				icon={<CheckCircle />}
				onClick={() => onSelect("decided")}
			/>
		</nav>
	);
}

/** The Read & Listen tab of the metadata page: its own nav, its own list. */
export function ReadListenReviewTab({
	status,
	onStatusChange,
}: {
	status: ReviewStatus;
	onStatusChange: (status: ReviewStatus) => void;
}) {
	// Only the total matters for the nav badge.
	const { data: pending } = useQuery(
		orpc.readListen.listMatchProposals.queryOptions({
			input: { status: "pending", offset: 0, limit: 1 },
		}),
	);
	const nav = (
		<PairingsNav
			status={status}
			pendingCount={pending?.total}
			onSelect={onStatusChange}
		/>
	);
	return (
		<div className="flex min-h-0 flex-1">
			<div className="hidden w-56 shrink-0 overflow-y-auto overscroll-contain border-border/60 border-e px-2 py-2 lg:block">
				{nav}
			</div>
			<ReadListenReviewPanel
				key={status}
				status={status}
				onShowPending={() => onStatusChange("pending")}
				scopeButton={
					<Popover>
						<PopoverTrigger
							render={
								<Button variant="outline" size="sm" className="lg:hidden">
									<FunnelSimple data-icon="inline-start" />
									{status === "pending"
										? m["read_listen.pending_matches"]()
										: m["read_listen.reviewed_matches"]()}
								</Button>
							}
						/>
						<PopoverContent align="start" className="w-60 p-2">
							{nav}
						</PopoverContent>
					</Popover>
				}
			/>
		</div>
	);
}
