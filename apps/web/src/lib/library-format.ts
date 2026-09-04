export type LibraryFormat = "all" | "ebook" | "audiobook";

export function parseLibraryFormat(value: unknown): LibraryFormat {
	return value === "ebook" || value === "audiobook" ? value : "all";
}

export function collectionMatchesFormat(
	facets: { ebookCount: number | null; audiobookCount: number | null },
	format: LibraryFormat,
): boolean {
	if (format === "all") return true;
	// Scoped and dynamic counts are resolved lazily. Keep the collection visible
	// in both media tabs until its viewer-specific preview arrives.
	if (facets.ebookCount === null || facets.audiobookCount === null) return true;
	if (format === "audiobook") return facets.audiobookCount > 0;
	return facets.ebookCount > 0 || facets.audiobookCount === 0;
}
