const GENERIC_EXACT_TERMS = new Set([
	"audiobook",
	"audiobooks",
	"audio book",
	"ebook",
	"ebooks",
	"book",
	"books",
	"light novel",
	"light novels",
	"ライトノベル",
	"読み物",
	"teen",
	"teens",
	"ティーン",
	"young adult",
	"anime tie-in",
	"manga tie-in",
	"media tie-in",
	"fiction",
	"フィクション",
	"文学・フィクション",
	"大衆小説",
	"現代文学",
	// NFKC folds fullwidth ／ to /
	"キッズ/ヤングアダルト",
	"ヤングアダルト",
]);

/** Categories that describe the media/store, not the content of a work. */
export function isGenericRecommendationTerm(name: string): boolean {
	const normalized = name.normalize("NFKC").trim().toLocaleLowerCase();
	return (
		GENERIC_EXACT_TERMS.has(normalized) ||
		normalized.includes("ライトノベル") ||
		normalized.includes("ラノベ") ||
		normalized.endsWith("文庫") ||
		normalized.includes("kindleストア") ||
		normalized.includes("kindle store")
	);
}
