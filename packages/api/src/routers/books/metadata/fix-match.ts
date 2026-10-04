// The manual "Fix match" flow, shared by the web dialog and the phone
// screen: search several providers at once, report how each one did, pick
// which incoming fields to apply. Free of server code (no imports).

export type ProviderOption = {
	id: string;
	label: string;
	/** Shows the optional ASIN field when this source is selected. */
	supportsAsin?: boolean;
};

export type MatchCandidate = {
	provider: string;
	providerId: string;
	title: string;
	subtitle?: string | null;
	metaLines: string[];
	previewCover?: string | null;
	url?: string | null;
};

export type MetadataPreview = {
	metadata: Record<string, unknown>;
	lockedFields: string[];
};

export type ProviderSearchStatus =
	| "found"
	| "no_results"
	| "rate_limited"
	| "invalid_credentials"
	| "failed";

export type ProviderSearchOutcome = {
	provider: string;
	status: ProviderSearchStatus;
	count: number;
	durationMs: number;
};

export type MatchQuery = {
	providerIds: string[];
	title: string;
	author: string;
	asin: string;
	withAsin: boolean;
};

export type MatchSearch = (params: {
	provider: string;
	title?: string;
	author?: string;
	asin?: string;
}) => Promise<MatchCandidate[]>;

/** Message key (web catalog) describing each provider's search outcome. */
export const OUTCOME_MESSAGE_KEYS: Record<ProviderSearchStatus, string> = {
	found: "match.outcome_found",
	no_results: "match.outcome_no_results",
	rate_limited: "match.outcome_rate_limited",
	invalid_credentials: "match.outcome_invalid_credentials",
	failed: "match.outcome_failed",
};

export const BOOK_PROVIDER_OPTIONS: ProviderOption[] = [
	{ id: "ranobedb", label: "RanobeDB" },
	{ id: "amazon", label: "Amazon", supportsAsin: true },
	{ id: "googlebooks", label: "Google Books" },
	{ id: "openlibrary", label: "Open Library" },
	{ id: "goodreads", label: "Goodreads" },
	{ id: "hardcover", label: "Hardcover" },
	{ id: "comicvine", label: "Comic Vine" },
];

export const AUDIOBOOK_PROVIDER_OPTIONS: ProviderOption[] = [
	{ id: "audible", label: "Audible", supportsAsin: true },
	{ id: "itunes", label: "Apple iTunes" },
];

export const BOOK_PREVIEW_FIELDS = [
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

export const AUDIOBOOK_PREVIEW_FIELDS = [
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

export function providerFailureStatus(error: unknown): ProviderSearchStatus {
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

/** Every provider at once; one failing never hides the others' results. */
export async function searchProviders(
	query: MatchQuery,
	search: MatchSearch,
	providers: ProviderOption[],
	now: () => number = () => Date.now(),
): Promise<{
	candidates: MatchCandidate[];
	outcomes: ProviderSearchOutcome[];
}> {
	const ids = query.providerIds;
	const settled = await Promise.allSettled(
		ids.map(async (provider) => {
			const startedAt = now();
			const candidates = await search({
				provider,
				title: query.title.trim() || undefined,
				author: query.author.trim() || undefined,
				// The server answers any provider given an ASIN with Amazon's
				// exact match, so only sources that take one get it.
				asin:
					query.withAsin &&
					providers.some((p) => p.id === provider && p.supportsAsin)
						? query.asin.trim() || undefined
						: undefined,
			});
			return {
				candidates,
				durationMs: Math.round(now() - startedAt),
			};
		}),
	);
	const seen = new Set<string>();
	return {
		// The same entry from two sources is one choice.
		candidates: settled
			.flatMap((entry) =>
				entry.status === "fulfilled" ? entry.value.candidates : [],
			)
			.filter(({ provider, providerId }) => {
				const key = `${provider}:${providerId}`;
				if (seen.has(key)) return false;
				seen.add(key);
				return true;
			}),
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
}

export function canSearchMatch(
	providers: ProviderOption[],
	selected: ReadonlySet<string>,
	title: string,
	asin: string,
): { canSearch: boolean; showAsin: boolean } {
	const showAsin = providers.some(
		(option) => selected.has(option.id) && option.supportsAsin,
	);
	return {
		showAsin,
		canSearch:
			selected.size > 0 &&
			(title.trim() !== "" || (showAsin && asin.trim() !== "")),
	};
}

/** Suggestions from providers this server still offers, and search results
 * minus the ones already suggested. */
export function splitCandidates(
	providers: ProviderOption[],
	suggestions: MatchCandidate[],
	results: MatchCandidate[] | null,
) {
	const offered = suggestions.filter((candidate) =>
		providers.some(({ id }) => id === candidate.provider),
	);
	const keys = new Set(
		offered.map(({ provider, providerId }) => `${provider}:${providerId}`),
	);
	return {
		suggestions: offered,
		results:
			results?.filter(
				({ provider, providerId }) => !keys.has(`${provider}:${providerId}`),
			) ?? null,
	};
}

/** Fill what's missing by default; never offer what the user locked. */
export function defaultSelectedFields(
	previewFields: readonly string[],
	preview: MetadataPreview,
	current: Record<string, unknown> | undefined,
): Set<string> {
	return new Set(
		previewFields.filter(
			(field) =>
				!preview.lockedFields.includes(field) &&
				preview.metadata[field] != null &&
				(current?.[field] == null || current[field] === ""),
		),
	);
}

export function displayMetadataValue(value: unknown): string {
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

export function displayFieldName(field: string): string {
	const spaced = field.replace(/([A-Z])/g, " $1").replaceAll("_", " ");
	return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

// Same wording as the edit form; fields it lacks fall back to their name.
const FIELD_LABEL_KEYS: Record<string, string> = {
	title: "book.meta_title",
	titleRomaji: "metadata.title_romaji",
	subtitle: "book.meta_subtitle",
	description: "book.meta_description",
	publishedDate: "book.meta_published_date",
	languageCode: "book.language",
	pageCount: "book.meta_page_count",
	authors: "book.authors",
	narrators: "audiobook.narrators",
	publisher: "book.publisher",
	series: "book.series",
	genres: "book.genres",
	tags: "book.tags",
};
const FIELD_LITERALS: Record<string, string> = {
	isbn: "ISBN",
	isbn10: "ISBN-10",
	isbn13: "ISBN-13",
	asin: "ASIN",
};

export function matchFieldLabel(
	field: string,
	translate: (key: string) => string,
): string {
	const key = FIELD_LABEL_KEYS[field];
	return key
		? translate(key)
		: (FIELD_LITERALS[field] ?? displayFieldName(field));
}

type Named = { name: string };

export function bookCandidateMeta(candidate: {
	authors?: Named[] | null;
	series?: { name?: string | null; position?: number | null } | null;
	publishedDate?: string | null;
}): string[] {
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

export function audiobookCandidateMeta(
	candidate: {
		authors?: Named[] | null;
		narrators?: Named[] | null;
		series?: {
			name?: string | null;
			sequence?: string | null;
			position?: number | null;
		} | null;
		duration?: number | null;
		publishedDate?: string | null;
	},
	formatDuration: (seconds: number) => string | null,
): string[] {
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
		candidate.duration ? formatDuration(candidate.duration) : null,
		candidate.publishedDate?.slice(0, 4),
	]
		.filter(Boolean)
		.join(" · ");
	if (detail) lines.push(detail);
	return lines;
}

// Google Books answers zoom=0 with an "image not available" placeholder for
// many volumes that do have a zoom=1 thumbnail, which is also the right size
// for a preview.
export function previewCoverUrl(url: string | null | undefined): string | null {
	if (!url) return null;
	try {
		const parsed = new URL(url);
		if (
			parsed.hostname === "books.google.com" &&
			parsed.pathname === "/books/content"
		) {
			parsed.searchParams.set("zoom", "1");
			return parsed.toString();
		}
	} catch {
		return url;
	}
	return url;
}
