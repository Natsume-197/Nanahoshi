export type LibraryFormat = "all" | "ebook" | "audiobook";

export function parseLibraryFormat(value: unknown): LibraryFormat {
	return value === "ebook" || value === "audiobook" ? value : "all";
}

export function collectionMatchesFormat(
	facets: { ebookCount: number; audiobookCount: number },
	format: LibraryFormat,
): boolean {
	if (format === "all") return true;
	if (format === "audiobook") return facets.audiobookCount > 0;
	return facets.ebookCount > 0 || facets.audiobookCount === 0;
}
