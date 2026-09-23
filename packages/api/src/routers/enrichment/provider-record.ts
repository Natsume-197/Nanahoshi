// A provider record in the same shape the tray reads the book's own metadata
// in (enrichmentStateRepository.detail → metadata), so the pane can compare
// the two field by field without knowing either media type's model.

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

type Named = { name?: string | null } | string | null | undefined;

function names(list: unknown, onlyAuthors = false): string[] {
	if (!Array.isArray(list)) return [];
	return list
		.filter((entry: { role?: string | null } | string) =>
			!onlyAuthors || typeof entry === "string"
				? true
				: entry.role == null || entry.role === "Author",
		)
		.map((entry: Named) =>
			typeof entry === "string" ? entry : (entry?.name ?? ""),
		)
		.map((name) => name.trim())
		.filter(Boolean);
}

function text(value: unknown): string | null {
	return typeof value === "string" && value.trim() ? value.trim() : null;
}

function positiveNumber(value: unknown): number | null {
	return typeof value === "number" && Number.isFinite(value) && value > 0
		? value
		: null;
}

/** Only a URL can be shown; local store keys never leave the server. */
export function remoteCoverUrl(value: unknown): string | null {
	return typeof value === "string" && /^https?:\/\//.test(value) ? value : null;
}

export function toDetailMetadata(record: object): DetailMetadata {
	const r = record as Record<string, unknown>;
	const publisher = r.publisher as Named;
	const series = r.series as
		| { name?: string | null; position?: number | null }
		| null
		| undefined;
	return {
		subtitle: text(r.subtitle),
		description: text(r.description),
		publishedDate: text(r.publishedDate),
		languageCode: text(r.languageCode),
		isbn: text(r.isbn13) ?? text(r.isbn10) ?? text(r.isbn),
		asin: text(r.asin),
		pageCount: positiveNumber(r.pageCount),
		duration: positiveNumber(r.duration),
		publisher:
			typeof publisher === "string" ? text(publisher) : text(publisher?.name),
		authors: names(r.authors, true),
		narrators: names(r.narrators),
		series: text(series?.name)
			? {
					name: text(series?.name) as string,
					position: series?.position != null ? String(series.position) : null,
				}
			: null,
		genres: [...new Set(names(r.genres).map((genre) => genre.toLowerCase()))],
	};
}
