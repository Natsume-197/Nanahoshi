import type { EnrichmentLifecycle as Lifecycle } from "./filters";

export type DetailMetadata = {
	subtitle: string | null;
	description: string | null;
	publishedDate: string | null;
	languageCode: string | null;
	isbn: string | null;
	asin: string | null;
	pageCount: number | null;
	duration: number | null;
	publisher: string | null;
	authors: string[];
	narrators: string[];
	series: { name: string; position: string | null } | null;
	genres: string[];
};

export type FactKey =
	| "cover"
	| "authors"
	| "narrators"
	| "series"
	| "publisher"
	| "published"
	| "language"
	| "length"
	| "identifiers"
	| "genres"
	| "description";

export type Fact = {
	key: FactKey;
	present: boolean;
	/** field_sources keys that fed this fact, first one with a source wins. */
	sourceKeys: string[];
};

// A book without these reads as broken in the catalog; everything else (series,
// narrator, identifiers…) is legitimately absent for plenty of books, so a gap
// there is hidden instead of flagged.
const ESSENTIAL: ReadonlySet<FactKey> = new Set([
	"cover",
	"authors",
	"description",
	"publisher",
	"published",
	"genres",
]);

export function buildFacts(
	metadata: DetailMetadata,
	mediaType: "ebook" | "audiobook",
	options: { hasCover?: boolean } = {},
): Fact[] {
	const audiobook = mediaType === "audiobook";
	const facts: Fact[] = [
		...(options.hasCover === undefined
			? []
			: [
					{
						key: "cover" as const,
						present: options.hasCover,
						sourceKeys: ["cover"],
					},
				]),
		{
			key: "authors",
			present: metadata.authors.length > 0,
			sourceKeys: ["authors"],
		},
		...(audiobook
			? [
					{
						key: "narrators" as const,
						present: metadata.narrators.length > 0,
						sourceKeys: ["narrators"],
					},
				]
			: []),
		{ key: "series", present: metadata.series != null, sourceKeys: ["series"] },
		{
			key: "publisher",
			present: metadata.publisher != null,
			sourceKeys: ["publisher"],
		},
		{
			key: "published",
			present: metadata.publishedDate != null,
			sourceKeys: ["publishedDate"],
		},
		{
			key: "language",
			present: metadata.languageCode != null,
			sourceKeys: ["languageCode"],
		},
		{
			key: "length",
			present: audiobook
				? metadata.duration != null && metadata.duration > 0
				: metadata.pageCount != null && metadata.pageCount > 0,
			sourceKeys: audiobook ? [] : ["pageCount"],
		},
		{
			key: "identifiers",
			present: metadata.isbn != null || metadata.asin != null,
			sourceKeys: ["isbn13", "isbn10", "isbn", "asin"],
		},
		{
			key: "genres",
			present: metadata.genres.length > 0,
			sourceKeys: ["genres"],
		},
		{
			key: "description",
			present: Boolean(metadata.description?.trim()),
			sourceKeys: ["description"],
		},
	];
	return facts.filter((fact) => fact.present || ESSENTIAL.has(fact.key));
}

export function missingFacts(facts: Fact[]): FactKey[] {
	return facts.filter((fact) => !fact.present).map((fact) => fact.key);
}

export function factSource(
	fact: Fact,
	fieldSources: Record<string, { p: string }>,
	lockedFields: ReadonlySet<string>,
): { provider: string | null; locked: boolean } {
	const key = fact.sourceKeys.find((candidate) => fieldSources[candidate]);
	return {
		provider: key ? (fieldSources[key]?.p ?? null) : null,
		locked: fact.sourceKeys.some((candidate) => lockedFields.has(candidate)),
	};
}

export type Situation =
	| "running"
	| "scheduled"
	| "review"
	| "ambiguous"
	| "unresolved"
	| "no_match"
	| "partial"
	| "failed"
	| "done";

/** Lifecycle says where the book sits in the tray; the pane needs one step
 * finer, because "several candidates" and "couldn't confirm" read the same in
 * the list but ask the user for different things here. */
export function resolveSituation(
	lifecycle: Lifecycle,
	hasCandidates: boolean,
): Situation {
	if (hasCandidates && lifecycle !== "running" && lifecycle !== "scheduled")
		return "ambiguous";
	return lifecycle;
}

// ─── Candidate comparison ─────────────────────────────────

/** The fact as one comparable line, or null when the record lacks it. */
export function factText(
	key: FactKey,
	metadata: DetailMetadata,
	mediaType: "ebook" | "audiobook",
): string | null {
	switch (key) {
		case "cover":
			return null;
		case "authors":
			return metadata.authors.length ? metadata.authors.join(", ") : null;
		case "narrators":
			return metadata.narrators.length ? metadata.narrators.join(", ") : null;
		case "series":
			return metadata.series
				? `${metadata.series.name}${metadata.series.position ? ` #${metadata.series.position}` : ""}`
				: null;
		case "publisher":
			return metadata.publisher;
		case "published":
			return metadata.publishedDate?.slice(0, 10) ?? null;
		case "language":
			return metadata.languageCode;
		case "length":
			return mediaType === "audiobook"
				? metadata.duration
					? String(Math.round(metadata.duration))
					: null
				: metadata.pageCount
					? String(metadata.pageCount)
					: null;
		case "identifiers":
			return (
				[
					metadata.isbn && `ISBN ${metadata.isbn}`,
					metadata.asin && `ASIN ${metadata.asin}`,
				]
					.filter(Boolean)
					.join(" · ") || null
			);
		case "genres":
			return metadata.genres.length
				? [...metadata.genres]
						.map((genre) => genre.toLowerCase())
						.sort()
						.join(", ")
				: null;
		case "description":
			return metadata.description?.trim() || null;
	}
}

export type FactChange = "adds" | "changes" | "same" | "locked" | "keeps";

export type FactDiff = {
	key: FactKey;
	change: FactChange;
	before: string | null;
	after: string | null;
};

const COMPARED: FactKey[] = [
	"authors",
	"narrators",
	"series",
	"publisher",
	"published",
	"language",
	"length",
	"identifiers",
	"genres",
	"description",
];

const LOCK_KEYS: Record<FactKey, string[]> = {
	cover: ["cover"],
	authors: ["authors"],
	narrators: ["narrators"],
	series: ["series"],
	publisher: ["publisher"],
	published: ["publishedDate"],
	language: ["languageCode"],
	length: ["pageCount"],
	identifiers: ["isbn13", "isbn10", "isbn", "asin"],
	genres: ["genres"],
	description: ["description"],
};

/**
 * What applying a candidate would do to each field: a chosen record replaces
 * what it provides, a locked field keeps the user's value, and anything the
 * record lacks stays as it is.
 */
export function diffFacts(
	current: DetailMetadata,
	incoming: DetailMetadata,
	lockedFields: ReadonlySet<string>,
	mediaType: "ebook" | "audiobook",
): FactDiff[] {
	return COMPARED.filter(
		(key) => key !== "narrators" || mediaType === "audiobook",
	).map((key) => {
		const before = factText(key, current, mediaType);
		const after = factText(key, incoming, mediaType);
		const locked = LOCK_KEYS[key].some((field) => lockedFields.has(field));
		const change: FactChange =
			after == null
				? "keeps"
				: before === after
					? "same"
					: locked
						? "locked"
						: before == null
							? "adds"
							: "changes";
		return { key, change, before, after };
	});
}

// ─── Editing ──────────────────────────────────────────────

/** The edit dialog's input for each fact; cover has no text field. */
export function editFieldFor(
	key: FactKey,
	mediaType: "ebook" | "audiobook",
): string | null {
	switch (key) {
		case "cover":
			return null;
		case "series":
			return "seriesName";
		case "published":
			return "publishedDate";
		case "language":
			return "languageCode";
		case "length":
			return mediaType === "audiobook" ? null : "pageCount";
		case "identifiers":
			return mediaType === "audiobook" ? "isbn" : "isbn13";
		default:
			return key;
	}
}

/**
 * The source most present rows share, when it covers at least half of them.
 * Naming it once replaces a column of identical labels; rows that differ keep
 * theirs, so the exceptions are what stands out.
 */
export function dominantSource(
	facts: Fact[],
	fieldSources: Record<string, { p: string }>,
): string | null {
	const counts = new Map<string, number>();
	let present = 0;
	for (const fact of facts) {
		if (!fact.present) continue;
		present++;
		const provider = factSource(fact, fieldSources, new Set()).provider;
		if (provider) counts.set(provider, (counts.get(provider) ?? 0) + 1);
	}
	let best: [string, number] | null = null;
	for (const entry of counts) if (!best || entry[1] > best[1]) best = entry;
	return best && best[1] >= 2 && best[1] * 2 >= present ? best[0] : null;
}
