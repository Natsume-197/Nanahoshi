/** Stable comparison key for recommendation-only duplicate suppression. */
export function recommendationTitleKey(title: string): string {
	return (
		title
			.normalize("NFKC")
			.toLocaleLowerCase()
			// Providers sometimes create a second series row with a wrapped tagline.
			.replace(/\s*[~～〜][^~～〜]+[~～〜]\s*$/u, "")
			.replace(/[\p{P}\p{S}\s]+/gu, "")
	);
}

export function recommendationTitlesEquivalent(a: string, b: string): boolean {
	if (!a || !b) return false;
	if (a === b) return true;
	const shorter = a.length <= b.length ? a : b;
	const longer = a.length <= b.length ? b : a;
	// Prefix matching is intentionally limited to explicit edition labels;
	// unrestricted prefix matching would hide real sequels and spin-offs.
	const edition = /^(新装版|新版|改訂版|完全版|愛蔵版|新訳版|newedition)/u;
	return (
		shorter.length >= 6 && edition.test(shorter) && longer.startsWith(shorter)
	);
}
