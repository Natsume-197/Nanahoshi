import type { BookMetadata } from "./book.metadata.model";

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
