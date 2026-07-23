import {
	ArrowClockwise,
	ArrowSquareOut,
	CheckCircle,
	CircleNotch,
	MagnifyingGlass,
	PencilSimple,
	Warning,
} from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useDeferredValue, useState } from "react";
import { toast } from "sonner";
import {
	AudiobookMatchDialog,
	BookMatchDialog,
} from "@/components/metadata/match-metadata-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { m } from "@/paraglide/messages";
import { coverPresets, getCoverFilename, getCoverUrl } from "@/utils/covers";
import { formatDate } from "@/utils/format";
import { orpc } from "@/utils/orpc";

type EnrichmentStatus =
	| "pending"
	| "enriched"
	| "partial"
	| "no_match"
	| "review";
type StatusFilter = EnrichmentStatus | "all";

const PAGE_SIZE = 50;
const ALL_LIBRARIES = "__all__";

const STATUS_LABELS: Record<EnrichmentStatus, () => string> = {
	no_match: () => m["enrichment.status_no_match"](),
	partial: () => m["enrichment.status_partial"](),
	pending: () => m["enrichment.status_pending"](),
	enriched: () => m["enrichment.status_enriched"](),
	review: () => m["enrichment.status_review"](),
};

const STATUS_STYLES: Record<EnrichmentStatus, string> = {
	no_match:
		"border-destructive/30 bg-destructive/10 text-destructive dark:text-red-400",
	partial:
		"border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400",
	pending: "border-border/60 bg-muted/60 text-muted-foreground",
	enriched:
		"border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
	review: "border-sky-500/30 bg-sky-500/10 text-sky-600 dark:text-sky-400",
};

function StatusBadge({ status }: { status: EnrichmentStatus }) {
	return (
		<Badge variant="outline" className={STATUS_STYLES[status]}>
			{STATUS_LABELS[status]()}
		</Badge>
	);
}

function minutesFromMs(ms: number): number {
	return Math.max(1, Math.ceil(ms / 60_000));
}

function sourceLabel(
	source: string,
	providerLabels: Record<string, string>,
): string {
	if (source === "local") return m["enrichment.source_local"]();
	if (source === "user") return m["enrichment.source_user"]();
	return providerLabels[source] ?? source;
}

type FixTarget = {
	bookUuid: string;
	title: string;
	mediaType: "ebook" | "audiobook";
};

export function MatchManager({
	initialStatus,
	initialLibraryUuid,
}: {
	initialStatus?: StatusFilter;
	initialLibraryUuid?: string;
} = {}) {
	const queryClient = useQueryClient();
	const [status, setStatus] = useState<StatusFilter>(
		initialStatus ?? "no_match",
	);
	const [libraryUuid, setLibraryUuid] = useState(
		initialLibraryUuid ?? ALL_LIBRARIES,
	);
	const [search, setSearch] = useState("");
	const [offset, setOffset] = useState(0);
	const [selected, setSelected] = useState<Set<string>>(new Set());
	const [detailUuid, setDetailUuid] = useState<string | null>(null);
	const [fixTarget, setFixTarget] = useState<FixTarget | null>(null);
	const deferredSearch = useDeferredValue(search);

	const filters = {
		status: status === "all" ? undefined : status,
		libraryUuid: libraryUuid === ALL_LIBRARIES ? undefined : libraryUuid,
		query: deferredSearch.trim() || undefined,
		limit: PAGE_SIZE,
		offset,
	};

	const { data, isLoading } = useQuery(
		orpc.enrichment.list.queryOptions({ input: filters }),
	);
	const { data: libraries } = useQuery(
		orpc.libraries.getLibrariesOverview.queryOptions(),
	);
	const { data: providerStatus } = useQuery({
		...orpc.enrichment.providerStatus.queryOptions(),
		refetchInterval: 30_000,
	});

	const invalidateList = () =>
		queryClient.invalidateQueries({ queryKey: orpc.enrichment.list.key() });

	const retryMutation = useMutation({
		...orpc.enrichment.retry.mutationOptions(),
		onSuccess: (result) => {
			toast.success(m["enrichment.retry_enqueued"]({ count: result.enqueued }));
			setSelected(new Set());
			invalidateList();
		},
		onError: (error) => toast.error(error.message),
	});

	const approveMutation = useMutation({
		...orpc.enrichment.approve.mutationOptions(),
		onSuccess: (result) => {
			toast.success(
				m["enrichment.approve_enqueued"]({ count: result.approved }),
			);
			setSelected(new Set());
			invalidateList();
		},
		onError: (error) => toast.error(error.message),
	});

	const counts = data?.counts;
	const items = data?.items ?? [];
	const total = data?.total ?? 0;
	const providerLabels = providerStatus?.labels ?? {};
	const cooldowns = Object.entries(providerStatus?.cooldowns ?? {});
	const busy = retryMutation.isPending || approveMutation.isPending;

	const tabs: { key: StatusFilter; label: string; count?: number }[] = [
		{
			key: "no_match",
			label: m["enrichment.tab_no_match"](),
			count: counts?.no_match,
		},
		{
			key: "review",
			label: m["enrichment.tab_review"](),
			count: counts?.review,
		},
		{
			key: "partial",
			label: m["enrichment.tab_partial"](),
			count: counts?.partial,
		},
		{
			key: "pending",
			label: m["enrichment.tab_pending"](),
			count: counts?.pending,
		},
		{
			key: "enriched",
			label: m["enrichment.tab_enriched"](),
			count: counts?.enriched,
		},
		{ key: "all", label: m["enrichment.tab_all"]() },
	];

	const applyStatus = (next: StatusFilter) => {
		setStatus(next);
		setOffset(0);
		setSelected(new Set());
	};

	const toggleSelected = (uuid: string) => {
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
	const toggleSelectAll = () => {
		setSelected((prev) => {
			if (pageUuids.every((uuid) => prev.has(uuid))) {
				const next = new Set(prev);
				for (const uuid of pageUuids) next.delete(uuid);
				return next;
			}
			return new Set([...prev, ...pageUuids]);
		});
	};

	const isReview = status === "review";
	const retrySelected = () =>
		retryMutation.mutate({ bookUuids: [...selected] });
	const retryAllFailed = () =>
		retryMutation.mutate({
			filter: {
				status: status === "all" ? undefined : status,
				libraryUuid: libraryUuid === ALL_LIBRARIES ? undefined : libraryUuid,
			},
		});
	const retryOne = (uuid: string, refresh = false) =>
		retryMutation.mutate({ bookUuids: [uuid], refresh });
	const approveSelected = () =>
		approveMutation.mutate({ bookUuids: [...selected] });
	const approveOne = (uuid: string) =>
		approveMutation.mutate({ bookUuids: [uuid] });
	const approveAllInView = () =>
		approveMutation.mutate({ bookUuids: pageUuids });

	return (
		<div className="space-y-6 p-6 lg:p-8">
			<div className="space-y-1">
				<h1 className="font-bold text-2xl tracking-tight">
					{m["enrichment.title"]()}
				</h1>
				<p className="text-muted-foreground text-sm">
					{m["enrichment.subtitle"]()}
				</p>
			</div>

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
				{tabs.map((tab) => (
					<button
						key={tab.key}
						type="button"
						onClick={() => applyStatus(tab.key)}
						className={`inline-flex h-8 items-center gap-1.5 rounded-full border px-3 font-medium text-sm transition-colors ${
							status === tab.key
								? "border-primary bg-primary text-primary-foreground"
								: "border-border/60 bg-card/60 text-muted-foreground hover:text-foreground"
						}`}
					>
						{tab.label}
						{tab.count != null && (
							<span
								className={`rounded-full px-1.5 text-xs tabular-nums ${
									status === tab.key ? "bg-primary-foreground/20" : "bg-muted"
								}`}
							>
								{tab.count}
							</span>
						)}
					</button>
				))}
				<div className="ms-auto flex flex-wrap items-center gap-2">
					<Select
						value={libraryUuid}
						onValueChange={(value) => {
							setLibraryUuid(value);
							setOffset(0);
						}}
						items={[
							{
								value: ALL_LIBRARIES,
								label: m["enrichment.all_libraries"](),
							},
							...(libraries ?? []).map((library) => ({
								value: library.uuid,
								label: library.name ?? library.uuid,
							})),
						]}
					>
						<SelectTrigger className="h-8 w-48">
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
					<div className="relative">
						<MagnifyingGlass className="absolute start-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
						<Input
							value={search}
							onChange={(event) => {
								setSearch(event.target.value);
								setOffset(0);
							}}
							placeholder={m["enrichment.search_placeholder"]()}
							className="h-8 w-56 ps-8"
						/>
					</div>
				</div>
			</div>

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
					description={
						status === "no_match"
							? m["enrichment.empty_no_match_desc"]()
							: status === "review"
								? m["enrichment.empty_review_desc"]()
								: status === "partial"
									? m["enrichment.empty_partial_desc"]()
									: m["enrichment.empty_desc"]()
					}
				/>
			)}

			{!isLoading && items.length > 0 && (
				<div className="flex flex-col gap-2">
					<div className="flex items-center gap-2 px-1 text-muted-foreground text-xs">
						<Checkbox
							checked={allPageSelected}
							onCheckedChange={toggleSelectAll}
							aria-label={m["enrichment.select_all"]()}
						/>
						<button
							type="button"
							onClick={toggleSelectAll}
							className="hover:text-foreground"
						>
							{selected.size > 0
								? m["enrichment.retry_selected"]({ count: selected.size })
								: m["enrichment.select_all"]()}
						</button>
					</div>
					{items.map((item) => {
						const coverFilename = getCoverFilename(item.cover);
						const matchedLabels = item.matched
							.map(({ provider }) => providerLabels[provider] ?? provider)
							.join(", ");
						const firstFailure = item.failures[0];
						return (
							<div
								key={item.bookUuid}
								className="flex items-center gap-3 rounded-xl border border-border/60 bg-card/60 px-4 py-3"
							>
								<Checkbox
									checked={selected.has(item.bookUuid)}
									onCheckedChange={() => toggleSelected(item.bookUuid)}
									aria-label={item.title ?? item.bookUuid}
								/>
								{coverFilename ? (
									<img
										src={getCoverUrl(
											coverFilename,
											coverPresets.activity.widths[1],
										)}
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
										<StatusBadge status={item.status} />
									</div>
									<p className="mt-0.5 truncate text-muted-foreground text-xs">
										{item.libraryName && <span>{item.libraryName} · </span>}
										{item.matched.length > 0 && (
											<span>
												{m["enrichment.matched_via"]({
													providers: matchedLabels,
												})}
											</span>
										)}
										{firstFailure && (
											<span className="text-amber-600 dark:text-amber-400">
												{item.matched.length > 0 && " · "}
												{m["enrichment.failed_summary"]({
													provider:
														providerLabels[firstFailure.provider] ??
														firstFailure.provider,
													code: firstFailure.code,
												})}
												{item.nextRetryAt &&
													new Date(item.nextRetryAt) > new Date() && (
														<>
															{" — "}
															{m["enrichment.retry_in"]({
																minutes: minutesFromMs(
																	new Date(item.nextRetryAt).getTime() -
																		Date.now(),
																),
															})}
														</>
													)}
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
								<div className="flex shrink-0 items-center gap-1.5">
									{item.status === "review" ? (
										<Button
											size="sm"
											onClick={() => approveOne(item.bookUuid)}
											disabled={busy}
										>
											<CheckCircle data-icon="inline-start" />
											{m["enrichment.approve"]()}
										</Button>
									) : (
										<Button
											size="sm"
											variant="outline"
											onClick={() => retryOne(item.bookUuid)}
											disabled={busy}
										>
											<ArrowClockwise data-icon="inline-start" />
											{m["enrichment.retry"]()}
										</Button>
									)}
									<Button
										size="sm"
										variant="outline"
										onClick={() =>
											setFixTarget({
												bookUuid: item.bookUuid,
												title: item.title ?? "",
												mediaType: item.mediaType,
											})
										}
									>
										<PencilSimple data-icon="inline-start" />
										{m["enrichment.fix_match"]()}
									</Button>
									<Button
										size="sm"
										variant="ghost"
										onClick={() => setDetailUuid(item.bookUuid)}
									>
										{m["enrichment.view_detail"]()}
									</Button>
								</div>
							</div>
						);
					})}
				</div>
			)}

			{!isLoading && total > 0 && (
				<div className="flex items-center justify-between">
					<p className="text-muted-foreground text-xs tabular-nums">
						{m["enrichment.showing"]({
							shown: Math.min(offset + PAGE_SIZE, total),
							total,
						})}
					</p>
					{offset + PAGE_SIZE < total && (
						<Button
							size="sm"
							variant="outline"
							onClick={() => setOffset(offset + PAGE_SIZE)}
						>
							{m["enrichment.load_more"]()}
						</Button>
					)}
				</div>
			)}

			{(selected.size > 0 || status !== "enriched") && (
				<div className="sticky bottom-4 flex flex-wrap items-center justify-end gap-2">
					{isReview ? (
						<>
							{selected.size > 0 && (
								<Button size="sm" onClick={approveSelected} disabled={busy}>
									{approveMutation.isPending ? (
										<CircleNotch
											data-icon="inline-start"
											className="animate-spin"
										/>
									) : (
										<CheckCircle data-icon="inline-start" />
									)}
									{m["enrichment.approve_selected"]({ count: selected.size })}
								</Button>
							)}
							{items.length > 0 && (
								<Button
									size="sm"
									variant="outline"
									onClick={approveAllInView}
									disabled={busy}
								>
									{m["enrichment.approve_all"]()}
								</Button>
							)}
						</>
					) : (
						<>
							{selected.size > 0 && (
								<Button size="sm" onClick={retrySelected} disabled={busy}>
									{retryMutation.isPending ? (
										<CircleNotch
											data-icon="inline-start"
											className="animate-spin"
										/>
									) : (
										<ArrowClockwise data-icon="inline-start" />
									)}
									{m["enrichment.retry_selected"]({ count: selected.size })}
								</Button>
							)}
							<Button
								size="sm"
								variant="outline"
								onClick={retryAllFailed}
								disabled={busy}
							>
								{m["enrichment.retry_all_failed"]()}
							</Button>
						</>
					)}
				</div>
			)}

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
							invalidateList();
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
							invalidateList();
						}
					}}
					audiobookUuid={fixTarget.bookUuid}
					initialTitle={fixTarget.title}
				/>
			)}
		</div>
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
						<StatusBadge status={detail.status} />
						{(detail.attempts ?? 0) > 0 && (
							<span className="text-muted-foreground text-xs">
								{m["enrichment.attempts"]({ count: detail.attempts ?? 0 })}
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
										{failure.code} · {failure.kind}
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
							<div className="overflow-hidden rounded-lg border border-border/60">
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
