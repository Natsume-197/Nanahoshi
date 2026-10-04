import {
	AUDIOBOOK_PREVIEW_FIELDS,
	AUDIOBOOK_PROVIDER_OPTIONS,
	audiobookCandidateMeta,
	BOOK_PREVIEW_FIELDS,
	BOOK_PROVIDER_OPTIONS,
	bookCandidateMeta,
	canSearchMatch,
	defaultSelectedFields,
	displayMetadataValue,
	type MatchCandidate,
	type MatchQuery,
	type MetadataPreview,
	matchFieldLabel,
	OUTCOME_MESSAGE_KEYS,
	type ProviderOption,
	type ProviderSearchOutcome,
	searchProviders,
	splitCandidates,
} from "@nanahoshi/api/routers/books/metadata/fix-match";
import { Button } from "@nanahoshi/ui/components/button";
import { Input } from "@nanahoshi/ui/components/input";
import { Label } from "@nanahoshi/ui/components/label";
import { Modal } from "@nanahoshi/ui/components/modal";
import { Skeleton } from "@nanahoshi/ui/components/skeleton";
import { cn } from "@nanahoshi/ui/lib/utils";
import {
	ArrowSquareOut,
	BookOpen,
	CircleNotch,
	Headphones,
	LockSimple,
	MagnifyingGlass,
	X,
} from "@phosphor-icons/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { type ReactNode, useState } from "react";
import { toast } from "sonner";
import { previewCoverUrl } from "@/components/enrichment/lifecycle";
import { m } from "@/paraglide/messages";
import { formatReadingTime, getErrorMessage } from "@/utils/format";
import { client, orpc } from "@/utils/orpc";

// Fix match: search an external source for the correct entry and replace this
// item's metadata with it. Locked (hand-edited) fields survive server-side.

export type { MatchCandidate, MetadataPreview, ProviderOption };

const messages = m as unknown as Record<
	string,
	(params?: Record<string, unknown>) => string
>;
const providerOutcomeText = (outcome: ProviderSearchOutcome) =>
	messages[OUTCOME_MESSAGE_KEYS[outcome.status]]({ count: outcome.count });

function CandidateRow({
	candidate,
	coverClass,
	fallbackIcon,
	applying,
	disabled,
	onApply,
}: {
	candidate: MatchCandidate;
	coverClass: string;
	fallbackIcon: ReactNode;
	applying: boolean;
	disabled: boolean;
	onApply: () => void;
}) {
	const cover = candidate.previewCover ? (
		<img
			src={previewCoverUrl(candidate.previewCover) ?? undefined}
			alt=""
			className={cn("shrink-0 rounded object-cover", coverClass)}
			loading="lazy"
		/>
	) : (
		<div
			className={cn(
				"flex shrink-0 items-center justify-center rounded bg-muted",
				coverClass,
			)}
		>
			{fallbackIcon}
		</div>
	);

	const title = (
		<p className="line-clamp-2 font-medium text-sm leading-snug">
			{candidate.title}
			{candidate.url && (
				<ArrowSquareOut className="ml-1 inline size-3 align-baseline text-muted-foreground/60" />
			)}
		</p>
	);

	return (
		<li className="flex items-center gap-3 rounded-lg border border-border bg-card p-3 transition-colors hover:bg-accent/40">
			{candidate.url ? (
				<a
					href={candidate.url}
					target="_blank"
					rel="noopener noreferrer"
					className="shrink-0 transition-opacity hover:opacity-80"
					aria-label={m["aria.open_provider_page"]()}
				>
					{cover}
				</a>
			) : (
				cover
			)}
			<div className="min-w-0 flex-1 space-y-0.5">
				<p className="font-medium text-[10px] text-muted-foreground uppercase tracking-wide">
					{candidate.provider}
				</p>
				{candidate.url ? (
					<a
						href={candidate.url}
						target="_blank"
						rel="noopener noreferrer"
						className="decoration-muted-foreground/40 underline-offset-2 hover:underline"
					>
						{title}
					</a>
				) : (
					title
				)}
				{candidate.subtitle && (
					<p className="truncate text-muted-foreground text-xs">
						{candidate.subtitle}
					</p>
				)}
				{candidate.metaLines.map((line) => (
					<p key={line} className="truncate text-muted-foreground text-xs">
						{line}
					</p>
				))}
			</div>
			<Button
				type="button"
				size="sm"
				variant="outline"
				className="shrink-0"
				disabled={disabled}
				onClick={onApply}
			>
				{applying && <CircleNotch className="size-3.5 animate-spin" />}
				{m["match.use_this"]()}
			</Button>
		</li>
	);
}

function ResultsPlaceholder({ icon, text }: { icon: ReactNode; text: string }) {
	return (
		<div className="flex flex-col items-center gap-2 py-10 text-center">
			{icon}
			<p className="max-w-xs text-muted-foreground text-sm">{text}</p>
		</div>
	);
}

export function FixMatchDialog({
	open,
	onOpenChange,
	providers,
	initialTitle,
	initialAuthor,
	initialAsin,
	coverClass,
	fallbackIcon,
	search,
	preview,
	previewFields = BOOK_PREVIEW_FIELDS,
	current,
	apply,
	searchKey,
	suggestions: allSuggestions = [],
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	providers: ProviderOption[];
	initialTitle: string;
	initialAuthor?: string;
	initialAsin?: string | null;
	coverClass: string;
	fallbackIcon: ReactNode;
	search: (params: {
		provider: string;
		title?: string;
		author?: string;
		asin?: string;
	}) => Promise<MatchCandidate[]>;
	preview?: (candidate: MatchCandidate) => Promise<MetadataPreview | null>;
	previewFields?: readonly string[];
	current?: Record<string, unknown>;
	apply: (candidate: MatchCandidate, fields?: string[]) => Promise<boolean>;
	/** Identifies the item so the opening search is cached per book. */
	searchKey: readonly unknown[];
	/** Candidates the matcher already found; listed above the search results. */
	suggestions?: MatchCandidate[];
}) {
	const router = useRouter();
	// A suggestion from a provider this server no longer offers can't be applied.
	const [selectedProviders, setSelectedProviders] = useState(
		() => new Set(providers.map(({ id }) => id)),
	);
	const [title, setTitle] = useState(initialTitle);
	const [author, setAuthor] = useState(initialAuthor ?? "");
	const [asin, setAsin] = useState(initialAsin ?? "");
	const [manualSearch, setManualSearch] = useState<{
		candidates: MatchCandidate[];
		outcomes: ProviderSearchOutcome[];
	} | null>(null);
	const [previewCandidate, setPreviewCandidate] =
		useState<MatchCandidate | null>(null);
	const [previewData, setPreviewData] = useState<Record<
		string,
		unknown
	> | null>(null);
	const [selectedFields, setSelectedFields] = useState<Set<string>>(new Set());
	const [lockedFields, setLockedFields] = useState<Set<string>>(new Set());

	const { showAsin, canSearch } = canSearchMatch(
		providers,
		selectedProviders,
		title,
		asin,
	);

	const runSearch = (query: MatchQuery) =>
		searchProviders(query, search, providers, () => performance.now());

	// Opening the dialog already knows the title, so the first search runs by
	// itself; the button is for refining it.
	const initialQuery = {
		providerIds: providers.map(({ id }) => id),
		title: initialTitle,
		author: initialAuthor ?? "",
		asin: initialAsin ?? "",
		withAsin: providers.some((option) => option.supportsAsin),
	};
	const initialSearch = useQuery({
		queryKey: ["fix-match-search", ...searchKey, initialQuery],
		queryFn: () => runSearch(initialQuery),
		enabled:
			open &&
			initialQuery.providerIds.length > 0 &&
			(initialQuery.title.trim() !== "" || initialQuery.asin.trim() !== ""),
		staleTime: 5 * 60 * 1000,
		retry: false,
	});

	const searchMutation = useMutation({
		mutationFn: () =>
			runSearch({
				providerIds: [...selectedProviders],
				title,
				author,
				asin,
				withAsin: showAsin,
			}),
		onSuccess: ({ candidates, outcomes }) => {
			setManualSearch({ candidates, outcomes });
		},
		onError: (error) => {
			toast.error(getErrorMessage(error, m["match.failed"]()));
		},
	});

	const previewMutation = useMutation({
		mutationFn: async (candidate: MatchCandidate) => ({
			candidate,
			data: preview ? await preview(candidate) : null,
		}),
		onSuccess: ({ candidate, data }) => {
			if (!data) {
				toast.info(m["match.no_data"]());
				return;
			}
			setPreviewCandidate(candidate);
			setPreviewData(data.metadata);
			setLockedFields(new Set(data.lockedFields));
			setSelectedFields(defaultSelectedFields(previewFields, data, current));
		},
		onError: (error) =>
			toast.error(getErrorMessage(error, m["match.failed"]())),
	});

	const applyMutation = useMutation({
		mutationFn: ({
			candidate,
			fields,
		}: {
			candidate: MatchCandidate;
			fields?: string[];
		}) => apply(candidate, fields),
		onSuccess: async (applied) => {
			if (applied) {
				toast.success(m["match.applied"]());
				await router.invalidate();
				onOpenChange(false);
			} else {
				toast.info(m["match.no_data"]());
			}
		},
		onError: (error) => {
			toast.error(getErrorMessage(error, m["match.apply_failed"]()));
		},
	});

	const busy =
		searchMutation.isPending ||
		previewMutation.isPending ||
		applyMutation.isPending;
	const shownSearch = manualSearch ?? initialSearch.data ?? null;
	const providerOutcomes = shownSearch?.outcomes ?? [];
	const searching =
		searchMutation.isPending ||
		(manualSearch == null && initialSearch.isFetching);
	// A suggestion the search finds again stays in its own section only.
	const { suggestions, results } = splitCandidates(
		providers,
		allSuggestions,
		shownSearch?.candidates ?? null,
	);
	const renderCandidate = (candidate: MatchCandidate) => (
		<CandidateRow
			key={`${candidate.provider}-${candidate.providerId}`}
			candidate={candidate}
			coverClass={coverClass}
			fallbackIcon={fallbackIcon}
			applying={
				applyMutation.isPending &&
				applyMutation.variables?.candidate.providerId === candidate.providerId
			}
			disabled={busy}
			onApply={() =>
				preview
					? previewMutation.mutate(candidate)
					: applyMutation.mutate({ candidate })
			}
		/>
	);

	return (
		<Modal
			open={open}
			onOpenChange={onOpenChange}
			title={m["match.dialog_title"]()}
			description={m["match.dialog_description"]()}
			className="sm:max-w-xl"
			onSubmit={(e) => {
				e.preventDefault();
				if (canSearch && !busy) searchMutation.mutate();
			}}
		>
			<div className="space-y-4">
				{providers.length > 1 && !previewData && (
					<div className="space-y-1.5">
						<Label className="text-muted-foreground text-xs">
							{m["match.source"]()}
						</Label>
						<div className="flex flex-wrap gap-1.5">
							{providers.map((option) => (
								<Button
									key={option.id}
									type="button"
									size="sm"
									variant={
										selectedProviders.has(option.id) ? "default" : "outline"
									}
									onClick={() => {
										setSelectedProviders((previous) => {
											const next = new Set(previous);
											if (next.has(option.id)) next.delete(option.id);
											else next.add(option.id);
											return next;
										});
									}}
								>
									{option.label}
								</Button>
							))}
						</div>
					</div>
				)}

				{previewData && previewCandidate ? (
					<div className="space-y-3">
						<div className="flex items-center justify-between gap-3">
							<p className="font-medium">{previewCandidate.title}</p>
							<Button
								type="button"
								variant="ghost"
								size="sm"
								onClick={() => {
									setPreviewData(null);
									setPreviewCandidate(null);
									setLockedFields(new Set());
								}}
							>
								<X />
								{m["match.back"]()}
							</Button>
						</div>
						<div className="max-h-[48dvh] overflow-y-auto rounded-lg border">
							<div className="grid grid-cols-[auto_7rem_1fr_1fr] gap-2 border-b bg-muted/40 p-2 text-muted-foreground text-xs">
								<span />
								<span>{m["match.field"]()}</span>
								<span>{m["match.current_value"]()}</span>
								<span>{m["match.incoming_value"]()}</span>
							</div>
							{previewFields
								.filter((field) => previewData[field] != null)
								.map((field) => (
									<label
										key={field}
										className={cn(
											"grid grid-cols-[auto_7rem_1fr_1fr] items-start gap-2 border-b p-2 text-xs last:border-b-0",
											lockedFields.has(field)
												? "cursor-not-allowed bg-muted/30 text-muted-foreground"
												: "cursor-pointer",
										)}
										title={
											lockedFields.has(field)
												? m["match.locked_field"]()
												: undefined
										}
									>
										<input
											type="checkbox"
											checked={selectedFields.has(field)}
											disabled={lockedFields.has(field)}
											onChange={() =>
												setSelectedFields((previous) => {
													const next = new Set(previous);
													if (next.has(field)) next.delete(field);
													else next.add(field);
													return next;
												})
											}
										/>
										<span className="flex items-center gap-1 font-medium">
											{lockedFields.has(field) && <LockSimple aria-hidden />}
											{matchFieldLabel(field, (key) => messages[key]())}
										</span>
										<span className="text-muted-foreground">
											{displayMetadataValue(current?.[field])}
										</span>
										<span>{displayMetadataValue(previewData[field])}</span>
									</label>
								))}
						</div>
						<Button
							type="button"
							disabled={selectedFields.size === 0 || busy}
							onClick={() =>
								applyMutation.mutate({
									candidate: previewCandidate,
									fields: [...selectedFields],
								})
							}
						>
							{m["match.use_this"]()} ({selectedFields.size})
						</Button>
					</div>
				) : (
					<>
						<div className="flex flex-col gap-3 sm:flex-row">
							<div className="flex-1 space-y-1.5">
								<Label
									htmlFor="fix-match-title"
									className="text-muted-foreground text-xs"
								>
									{m["match.field_title"]()}
								</Label>
								<Input
									id="fix-match-title"
									value={title}
									onChange={(e) => setTitle(e.target.value)}
									autoFocus
								/>
							</div>
							<div className="space-y-1.5 sm:w-44">
								<Label
									htmlFor="fix-match-author"
									className="text-muted-foreground text-xs"
								>
									{m["match.field_author"]()}{" "}
									<span className="opacity-60">({m["match.optional"]()})</span>
								</Label>
								<Input
									id="fix-match-author"
									value={author}
									onChange={(e) => setAuthor(e.target.value)}
								/>
							</div>
						</div>
						{providerOutcomes.length > 0 && (
							<ul
								className="flex flex-wrap gap-x-3 gap-y-1 text-xs"
								aria-label={m["match.provider_outcomes"]()}
							>
								{providerOutcomes.map((outcome) => (
									<li
										key={outcome.provider}
										className={cn(
											outcome.status === "found" && "text-success",
											outcome.status === "no_results" &&
												"text-muted-foreground",
											!["found", "no_results"].includes(outcome.status) &&
												"text-warning",
										)}
										title={`${outcome.durationMs} ms`}
									>
										{providers.find(({ id }) => id === outcome.provider)
											?.label ?? outcome.provider}
										: {providerOutcomeText(outcome)}
									</li>
								))}
							</ul>
						)}

						<div className="flex items-end gap-3">
							{showAsin ? (
								<div className="space-y-1.5">
									<Label
										htmlFor="fix-match-asin"
										className="text-muted-foreground text-xs"
									>
										{m["match.field_asin"]()}{" "}
										<span className="opacity-60">
											({m["match.optional"]()})
										</span>
									</Label>
									<Input
										id="fix-match-asin"
										value={asin}
										onChange={(e) => setAsin(e.target.value)}
										className="font-mono sm:w-44"
										title={m["match.asin_hint"]()}
									/>
								</div>
							) : (
								<div className="flex-1" />
							)}
							<Button
								type="submit"
								disabled={busy || !canSearch}
								className={cn(showAsin && "ml-auto")}
							>
								{searching ? (
									<CircleNotch className="size-4 animate-spin" />
								) : (
									<MagnifyingGlass className="size-4" />
								)}
								{m["match.search"]()}
							</Button>
						</div>

						{suggestions.length > 0 && (
							<section className="space-y-2">
								<h3 className="font-medium text-muted-foreground text-xs">
									{m["match.suggested_title"]()}
								</h3>
								<ul className="space-y-2 rounded-lg border border-primary/30 bg-primary/5 p-3">
									{suggestions.map(renderCandidate)}
								</ul>
							</section>
						)}
						{suggestions.length > 0 && (
							<h3 className="font-medium text-muted-foreground text-xs">
								{m["match.search_results_title"]()}
							</h3>
						)}
						<div className="rounded-lg border border-border/60 bg-muted/20">
							{searching ? (
								<ul className="space-y-2 p-3">
									{[0, 1, 2].map((i) => (
										<li key={i} className="flex items-center gap-3 p-1">
											<Skeleton
												className={cn("shrink-0 rounded", coverClass)}
											/>
											<div className="flex-1 space-y-2">
												<Skeleton className="h-4 w-3/4" />
												<Skeleton className="h-3 w-1/2" />
											</div>
										</li>
									))}
								</ul>
							) : results === null ? (
								<ResultsPlaceholder
									icon={
										<MagnifyingGlass className="size-6 text-muted-foreground/40" />
									}
									text={m["match.initial_hint"]()}
								/>
							) : results.length === 0 ? (
								<ResultsPlaceholder
									icon={
										<MagnifyingGlass className="size-6 text-muted-foreground/40" />
									}
									text={m["match.no_results"]()}
								/>
							) : (
								<ul className="max-h-[45dvh] space-y-2 overflow-y-auto p-3">
									{results.map(renderCandidate)}
								</ul>
							)}
						</div>
					</>
				)}
			</div>
		</Modal>
	);
}

// ─── Books ────────────────────────────────────────────────

type BookProviderId = Parameters<
	typeof client.books.searchMetadata
>[0]["provider"];

export function BookMatchDialog({
	open,
	onOpenChange,
	bookUuid,
	initialTitle,
	initialAuthor,
	initialAsin,
	suggestions,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	bookUuid: string;
	initialTitle: string;
	initialAuthor?: string;
	initialAsin?: string | null;
	suggestions?: MatchCandidate[];
}) {
	// Only offer tabs for providers that are enabled and configured for this
	// tenant — an unkeyed Comicvine/Hardcover tab can only return "no results".
	const { data: available } = useQuery(
		orpc.books.availableMetadataProviders.queryOptions({
			input: { uuid: bookUuid },
			enabled: open,
			staleTime: 5 * 60 * 1000,
		}),
	);
	const { data: current } = useQuery(
		orpc.books.getBookWithMetadata.queryOptions({
			input: { uuid: bookUuid },
			enabled: open,
		}),
	);

	const providers = BOOK_PROVIDER_OPTIONS.filter((p) =>
		available?.some((name) => name === p.id),
	);

	// Gate on the availability answer so the tab set never shifts after mount.
	if (open && !available) return null;

	return (
		<FixMatchDialog
			open={open}
			onOpenChange={onOpenChange}
			providers={providers}
			initialTitle={initialTitle}
			initialAuthor={initialAuthor}
			initialAsin={initialAsin}
			searchKey={["books", bookUuid]}
			suggestions={suggestions}
			coverClass="h-16 w-11"
			fallbackIcon={<BookOpen className="size-5 text-muted-foreground/40" />}
			current={current as Record<string, unknown> | undefined}
			search={async ({ provider, title, author, asin }) => {
				const candidates = await client.books.searchMetadata({
					uuid: bookUuid,
					provider: provider as BookProviderId,
					title,
					author,
					asin,
				});
				return candidates.map((c) => ({
					provider: c.provider,
					providerId: c.providerId,
					title: c.title,
					subtitle: c.titleRomaji,
					metaLines: bookCandidateMeta(c),
					previewCover: c.previewCover,
					url: c.url,
				}));
			}}
			preview={async (candidate) =>
				client.books.previewMetadata({
					uuid: bookUuid,
					provider: candidate.provider as BookProviderId,
					providerId: candidate.providerId,
				})
			}
			apply={async (candidate, fields) => {
				const result = await client.books.applyMetadata({
					uuid: bookUuid,
					provider: candidate.provider as BookProviderId,
					providerId: candidate.providerId,
					fields: fields as Parameters<
						typeof client.books.applyMetadata
					>[0]["fields"],
				});
				return result.success;
			}}
		/>
	);
}

// ─── Audiobooks ───────────────────────────────────────────

export function AudiobookMatchDialog({
	open,
	onOpenChange,
	audiobookUuid,
	initialTitle,
	initialAuthor,
	initialAsin,
	suggestions,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	audiobookUuid: string;
	initialTitle: string;
	initialAuthor?: string;
	initialAsin?: string | null;
	suggestions?: MatchCandidate[];
}) {
	const { data: current } = useQuery(
		orpc.audiobooks.getDetails.queryOptions({
			input: { uuid: audiobookUuid },
			enabled: open,
		}),
	);
	return (
		<FixMatchDialog
			open={open}
			onOpenChange={onOpenChange}
			providers={AUDIOBOOK_PROVIDER_OPTIONS}
			initialTitle={initialTitle}
			initialAuthor={initialAuthor}
			initialAsin={initialAsin}
			searchKey={["audiobooks", audiobookUuid]}
			suggestions={suggestions}
			coverClass="size-14"
			fallbackIcon={<Headphones className="size-5 text-muted-foreground/40" />}
			previewFields={AUDIOBOOK_PREVIEW_FIELDS}
			current={current as Record<string, unknown> | undefined}
			search={async ({ provider, title, author, asin }) => {
				const candidates = await client.audiobooks.searchMetadata({
					uuid: audiobookUuid,
					provider: provider as "audible" | "itunes",
					title,
					author,
					asin,
				});
				return candidates.map((c) => ({
					provider: c.provider,
					providerId: c.providerId,
					title: c.title ?? "",
					metaLines: audiobookCandidateMeta(c, formatReadingTime),
					previewCover: c.previewCover,
					url: c.url,
				}));
			}}
			preview={async (candidate) =>
				client.audiobooks.previewMetadata({
					uuid: audiobookUuid,
					provider: candidate.provider as "audible" | "itunes",
					providerId: candidate.providerId,
				})
			}
			apply={async (candidate, fields) => {
				const result = await client.audiobooks.applyMetadata({
					uuid: audiobookUuid,
					provider: candidate.provider as "audible" | "itunes",
					providerId: candidate.providerId,
					fields: fields as Parameters<
						typeof client.audiobooks.applyMetadata
					>[0]["fields"],
				});
				return result !== null;
			}}
		/>
	);
}
