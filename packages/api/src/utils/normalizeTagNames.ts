/**
 * Normalizes provider tag names for storage: lowercased so vocabularies
 * dedupe across providers ("Isekai" vs "isekai"), trimmed, deduplicated and
 * sorted so concurrent jobs upserting shared tags lock rows in the same order.
 */
export function normalizeTagNames(tags: string[]): string[] {
	return [
		...new Set(tags.map((t) => t.trim().toLowerCase()).filter(Boolean)),
	].sort((a, b) => a.localeCompare(b));
}
