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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { m } from "@/paraglide/messages";
import { formatReadingTime, getErrorMessage } from "@/utils/format";
import { client, orpc } from "@/utils/orpc";

// Fix match: search an external source for the correct entry and replace this
// item's metadata with it. Locked (hand-edited) fields survive server-side.

export type MatchCandidate = {
	provider: string;
	providerId: string;
	title: string;
	subtitle?: string | null;
	/** Pre-formatted secondary rows (authors, series · year …). */
	metaLines: string[];
	previewCover?: string | null;
	/** Provider page — cover and title link out to it when present. */
	url?: string | null;
};

export type ProviderOption = {
	id: string;
	label: string;
	/** Shows the optional ASIN field when this source is selected. */
	supportsAsin?: boolean;
};

export type MetadataPreview = {
	metadata: Record<string, unknown>;
	lockedFields: string[];
};

type ProviderSearchStatus =
	| "found"
	| "no_results"
	| "rate_limited"
	| "invalid_credentials"
	| "failed";

type ProviderSearchOutcome = {
	provider: string;
	status: ProviderSearchStatus;
	count: number;
	durationMs: number;
};

function providerFailureStatus(error: unknown): ProviderSearchStatus {
	const details =
		typeof error === "object" && error
			? (error as { code?: unknown; message?: unknown; cause?: unknown })
			: null;
	const cause =
		typeof details?.cause === "object" && details.cause
			? (details.cause as { code?: unknown; message?: unknown })
			: null;
	const text = [details?.code, details?.message, cause?.code, cause?.message]
		.filter((value): value is string => typeof value === "string")
		.join(" ")
		.toLowerCase();
	if (
		text.includes("too_many_requests") ||
		text.includes("rate limit") ||
		text.includes("cooldown")
	) {
		return "rate_limited";
	}
	if (
		text.includes("unauthorized") ||
		text.includes("invalid credential") ||
		text.includes("invalid api") ||
		text.includes("api key")
	) {
		return "invalid_credentials";
	}
	return "failed";
}

function providerOutcomeText(outcome: ProviderSearchOutcome): string {
	switch (outcome.status) {
		case "found":
			return m["match.outcome_found"]({ count: outcome.count });
		case "no_results":
			return m["match.outcome_no_results"]();
		case "rate_limited":
			return m["match.outcome_rate_limited"]();
		case "invalid_credentials":
			return m["match.outcome_invalid_credentials"]();
		case "failed":
			return m["match.outcome_failed"]();
	}
}

const PREVIEW_FIELDS = [
	"title",
	"titleRomaji",
	"subtitle",
	"description",
	"publishedDate",
	"languageCode",
	"pageCount",
	"isbn10",
	"isbn13",
	"asin",
	"cover",
	"authors",
	"publisher",
	"series",
	"genres",
	"tags",
] as const;

const AUDIOBOOK_PREVIEW_FIELDS = [
	"title",
	"subtitle",
	"description",
	"publishedDate",
	"languageCode",
	"isbn",
	"asin",
	"cover",
	"explicit",
	"abridged",
	"authors",
	"narrators",
	"publisher",
	"series",
	"genres",
	"tags",
] as const;

function displayMetadataValue(value: unknown): string {
	if (value == null || value === "") return "—";
	if (Array.isArray(value)) {
		return value
			.map((entry) =>
				typeof entry === "string"
					? entry
					: String((entry as { name?: unknown }).name ?? ""),
			)
			.filter(Boolean)
			.join(", ");
	}
	if (typeof value === "object") {
		return String((value as { name?: unknown }).name ?? JSON.stringify(value));
	}
	return String(value);
}

function displayFieldName(field: string): string {
	const spaced = field.replace(/([A-Z])/g, " $1").replaceAll("_", " ");
	return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

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
			src={candidate.previewCover}
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
	previewFields = PREVIEW_FIELDS,
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
	const suggestions = allSuggestions.filter((candidate) =>
		providers.some(({ id }) => id === candidate.provider),
	);
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

	const showAsin = providers.some(
		(option) => selectedProviders.has(option.id) && option.supportsAsin,
	);
	const canSearch =
		selectedProviders.size > 0 &&
		(title.trim() !== "" || (showAsin && asin.trim() !== ""));

	const runSearch = async (query: {
		providerIds: string[];
		title: string;
		author: string;
		asin: string;
		withAsin: boolean;
	}) => {
		const ids = query.providerIds;
		const settled = await Promise.allSettled(
			ids.map(async (provider) => {
				const startedAt = performance.now();
				const candidates = await search({
					provider,
					title: query.title.trim() || undefined,
					author: query.author.trim() || undefined,
					asin: query.withAsin ? query.asin.trim() || undefined : undefined,
				});
				return {
					provider,
					candidates,
					durationMs: Math.round(performance.now() - startedAt),
				};
			}),
		);
		return {
			candidates: settled.flatMap((entry) =>
				entry.status === "fulfilled" ? entry.value.candidates : [],
			),
			outcomes: settled.map((entry, index): ProviderSearchOutcome => {
				const provider = ids[index] ?? "provider";
				if (entry.status === "rejected") {
					return {
						provider,
						status: providerFailureStatus(entry.reason),
						count: 0,
						durationMs: 0,
					};
				}
				return {
					provider,
					status: entry.value.candidates.length > 0 ? "found" : "no_results",
					count: entry.value.candidates.length,
					durationMs: entry.value.durationMs,
				};
			}),
		};
	};

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
			setSelectedFields(
				new Set(
					previewFields.filter(
						(field) =>
							!data.lockedFields.includes(field) &&
							data.metadata[field] != null &&
							(current?.[field] == null || current[field] === ""),
					),
				),
			);
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
	const suggestionKeys = new Set(
		suggestions.map(({ provider, providerId }) => `${provider}:${providerId}`),
	);
	// A suggestion the search finds again stays in its own section only.
	const results =
		shownSearch?.candidates.filter(
			({ provider, providerId }) =>
				!suggestionKeys.has(`${provider}:${providerId}`),
		) ?? null;
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
						<div className="max-h-[48vh] overflow-y-auto rounded-lg border">
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
											{displayFieldName(field)}
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
								<ul className="max-h-[45vh] space-y-2 overflow-y-auto p-3">
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

type BookCandidate = Awaited<
	ReturnType<typeof client.books.searchMetadata>
>[number];

type BookProviderId = Parameters<
	typeof client.books.searchMetadata
>[0]["provider"];

function bookMeta(candidate: BookCandidate): string[] {
	const lines: string[] = [];
	const authors = candidate.authors?.map((a) => a.name).join(", ");
	if (authors) lines.push(authors);
	const seriesLine = [
		candidate.series?.name
			? `${candidate.series.name}${
					candidate.series.position != null
						? ` #${candidate.series.position}`
						: ""
				}`
			: null,
		candidate.publishedDate?.slice(0, 4),
	]
		.filter(Boolean)
		.join(" · ");
	if (seriesLine) lines.push(seriesLine);
	return lines;
}

const BOOK_PROVIDER_OPTIONS: ProviderOption[] = [
	{ id: "ranobedb", label: "RanobeDB" },
	{ id: "amazon", label: "Amazon", supportsAsin: true },
	{ id: "googlebooks", label: "Google Books" },
	{ id: "openlibrary", label: "Open Library" },
	{ id: "goodreads", label: "Goodreads" },
	{ id: "hardcover", label: "Hardcover" },
	{ id: "comicvine", label: "Comic Vine" },
];

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
					metaLines: bookMeta(c),
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

type AudiobookCandidate = Awaited<
	ReturnType<typeof client.audiobooks.searchMetadata>
>[number];

function audiobookMeta(candidate: AudiobookCandidate): string[] {
	const lines: string[] = [];
	const people = [
		candidate.authors?.map((a) => a.name).join(", "),
		candidate.narrators?.map((n) => n.name).join(", "),
	]
		.filter(Boolean)
		.join(" · ");
	if (people) lines.push(people);
	const detail = [
		candidate.series?.name
			? `${candidate.series.name}${
					candidate.series.sequence
						? ` · ${candidate.series.sequence}`
						: candidate.series.position != null
							? ` #${candidate.series.position}`
							: ""
				}`
			: null,
		candidate.duration ? formatReadingTime(candidate.duration) : null,
		candidate.publishedDate?.slice(0, 4),
	]
		.filter(Boolean)
		.join(" · ");
	if (detail) lines.push(detail);
	return lines;
}

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
			providers={[
				{ id: "audible", label: "Audible", supportsAsin: true },
				{ id: "itunes", label: "Apple iTunes" },
			]}
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
					metaLines: audiobookMeta(c),
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
