import type { BookMetadata } from "./book.metadata.model";

const normalizeAliasValue = (value: string) =>
	value.normalize("NFKC").trim().replace(/\s+/gu, " ");

/**
 * Normalize a candidate alias list against a canonical series title: NFKC,
 * collapse whitespace, dedupe case-insensitively (first spelling wins), and
 * drop blanks plus the canonical title itself. Shared by the RanobeDB provider
 * (single-source parse) and the metadata merge (cross-provider union).
 */
export function normalizeSeriesAliases(
	candidates: Iterable<string>,
	canonical: string,
): string[] {
	const canonicalKey = normalizeAliasValue(canonical).toLowerCase();
	const seen = new Set<string>();
	const aliases: string[] = [];
	for (const value of candidates) {
		const alias = normalizeAliasValue(value);
		const key = alias.toLowerCase();
		if (!alias || key === canonicalKey || seen.has(key)) continue;
		seen.add(key);
		aliases.push(alias);
	}
	return aliases;
}

/**
 * Build the input shape for enrichFromAmazon from a raw book data row.
 * Shared between the book router (single enrich) and the bulk worker.
 */
export function buildEnrichInput(
	bookId: number,
	uuid: string,
	row: Record<string, unknown>,
): Partial<BookMetadata> & { bookId: number; uuid: string } {
	const publisherObj = row.publisher as Record<string, unknown> | null;
	const authorsArr = (row.authors ?? []) as Array<{
		name: string;
		role: string | null;
	}>;

	return {
		bookId,
		uuid,
		title: (row.title as string | null) ?? undefined,
		subtitle: (row.subtitle as string | null) ?? undefined,
		description: (row.description as string | null) ?? undefined,
		isbn10: (row.isbn10 as string | null) ?? undefined,
		isbn13: (row.isbn13 as string | null) ?? undefined,
		asin: (row.asin as string | null) ?? undefined,
		languageCode: (row.languageCode as string | null) ?? undefined,
		cover: (row.cover as string | null) ?? undefined,
		authors: authorsArr.filter((a) => a.name != null),
		publisher:
			publisherObj?.name != null
				? (publisherObj as { name: string })
				: undefined,
	};
}
