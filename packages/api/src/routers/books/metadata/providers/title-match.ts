// Shared title normalization/matching helpers for metadata providers.
// Tuned for Japanese light novel titles (CJK bigrams, full-width digits).

const NON_ALPHANUMERIC_PATTERN = /[^\p{L}\p{M}0-9]/gu;

// Detects volume/part indicators in titles:
// Arabic digits, Roman numerals (II+), kanji part/volume markers (第四部, 第三巻, etc.)
export const HAS_VOLUME_PATTERN =
	/[\d０-９]+|(?<![a-zA-Z])[IVXLCivxlc]{2,}(?![a-zA-Z])|第[一二三四五六七八九十百千]+[部巻章編話]/;

export function cleanSearchTerm(text: string): string {
	return (
		text
			// Drop angle-bracketed cross-references — a different title cited as a
			// series anchor, which pollutes the search. Short markers like 〈上〉 fall
			// through to the bracket strip below.
			.replace(/[<〈][^>〉]{4,}[>〉]/g, " ")
			// Remove brackets, quotes, and decorative punctuation
			.replace(/[「」『』【】（）()[\]{}〈〉<>～~・]/g, " ")
			// Remove decorative hyphens/dashes (common in JP titles like "-kuu-")
			.replace(/[-−–—]+/g, " ")
			// Remove Japanese legal entity prefixes (too specific for search)
			.replace(/株式会社|有限会社/g, "")
			.replace(/\s+/g, " ")
			.trim()
	);
}

// Publisher-imprint labels in parens (電撃文庫, GA文庫, Kindle…): packaging Amazon
// lists inconsistently. Dropped for comparison only (never from the query) so a
// fanbook still matches an input carrying the series tagline instead.
const IMPRINT_PAREN =
	/[(（][^)）]*(?:文庫|ブックス|ラノベ|新書|コミックス|comics?|novels?|kindle)[^)）]*[)）]/giu;

export function stripImprintParens(text: string): string {
	return text.replace(IMPRINT_PAREN, " ");
}

// A wavy-dash series tagline (〜司書になるためには…〜) that recurs across volumes and
// Amazon often omits — keeping it buries spin-offs. Strips paired 4+ char
// segments (short ones like 〜上〜 are part markers). Used only for fallback queries.
const SERIES_TAGLINE = /[〜～~][^〜～~]{4,}[〜～~]/g;

export function stripSeriesTagline(text: string): string {
	return text.replace(SERIES_TAGLINE, " ").replace(/\s+/g, " ").trim();
}

export function normalizeForComparison(text: string): string {
	return text
		.replace(/[０-９]/g, (ch) =>
			String.fromCharCode(ch.charCodeAt(0) - 0xff10 + 0x30),
		)
		.replace(NON_ALPHANUMERIC_PATTERN, "")
		.toLowerCase();
}

// Part markers (前/後/上/中/下) only where structurally a marker: 前編/上巻, （前）,
// or delimited standalone "… 上". Never a stray kanji inside a word. Conflicting
// markers mean different editions (movie 上 vs novel 前編).
const PART_MARKER_KANJI = /([前後上中下])(?:編|巻)/;
const PART_MARKER_PAREN = /[（(〈]([前後上中下])[）)〉]/;
const PART_MARKER_STANDALONE = /[\s　:：]([前後上中下])(?=[\s　(（]|$)/;

export function extractPartMarker(title: string): string | null {
	const t = title.normalize("NFKC");
	return (
		t.match(PART_MARKER_KANJI)?.[1] ??
		t.match(PART_MARKER_PAREN)?.[1] ??
		t.match(PART_MARKER_STANDALONE)?.[1] ??
		null
	);
}

/** True when both titles carry a part marker and they differ. */
export function partMarkersConflict(a: string, b: string): boolean {
	const pa = extractPartMarker(a);
	const pb = extractPartMarker(b);
	return pa !== null && pb !== null && pa !== pb;
}

// Directional content-similarity in [0,1]: fraction of the input's char bigrams
// present in the result (containment = 1). Separates same-length series siblings
// that share a skeleton but differ in subtitle, unlike a raw length comparison.
export function titleSimilarityScore(input: string, result: string): number {
	if (!input || !result) return 0;
	if (result.includes(input) || input.includes(result)) return 1;
	if (input.length < 2) return result.includes(input) ? 1 : 0;

	let matched = 0;
	const total = input.length - 1;
	for (let i = 0; i < total; i++) {
		if (result.includes(input.slice(i, i + 2))) matched++;
	}
	return matched / total;
}

export function isTitleSimilar(input: string, result: string): boolean {
	if (result.includes(input) || input.includes(result)) return true;

	// Volume numbers must match: if the input has one, the result must too.
	const inputNumbers: string[] = input.match(/\d+/g) ?? [];
	const resultNumbers: string[] = result.match(/\d+/g) ?? [];

	if (inputNumbers.length > 0) {
		const hasMatchingNumber = inputNumbers.some((n) =>
			resultNumbers.includes(n),
		);
		if (!hasMatchingNumber) return false;
	}

	// Character bigrams (single-char overlap is too loose for CJK — particles
	// like に/の/は and endings like された create false matches).
	const shorter = input.length <= result.length ? input : result;
	const longer = input.length > result.length ? input : result;

	if (shorter.length < 2) return longer.includes(shorter);

	let matchedBigrams = 0;
	const totalBigrams = shorter.length - 1;
	for (let i = 0; i < totalBigrams; i++) {
		if (longer.includes(shorter.slice(i, i + 2))) matchedBigrams++;
	}
	return matchedBigrams / totalBigrams >= 0.6;
}

// Fuzzy author comparison for filtering search results: tokenizes both names
// and accepts when any token pair is contained or bigram-similar. Handles
// "J. R. R. Tolkien" vs "Tolkien" and spaced vs unspaced CJK names
// (川原 礫 vs 川原礫).
const AUTHOR_MATCH_THRESHOLD = 0.5;

function authorTokens(name: string): string[] {
	return name
		.split(/[\s,、･・]+/)
		.map((token) => normalizeForComparison(token))
		.filter((token) => token.length > 1);
}

export function isAuthorSimilar(
	candidateAuthors: string[],
	searchAuthor: string,
): boolean {
	const queryTokens = authorTokens(searchAuthor);
	if (queryTokens.length === 0) return true;

	for (const author of candidateAuthors) {
		for (const token of authorTokens(author)) {
			for (const query of queryTokens) {
				if (token.includes(query) || query.includes(token)) return true;
				const shorter = query.length <= token.length ? query : token;
				const longer = query.length > token.length ? query : token;
				if (titleSimilarityScore(shorter, longer) >= AUTHOR_MATCH_THRESHOLD) {
					return true;
				}
			}
		}
	}
	return false;
}

// Extracts a trailing volume number from a title (Arabic/full-width digits or
// kanji 第N巻 markers); null when none is found.
export function extractVolumeNumber(title: string): number | null {
	const kanjiMatch = title.match(/第([一二三四五六七八九十百千]+)[部巻]/);
	if (kanjiMatch?.[1]) {
		const value = parseKanjiNumber(kanjiMatch[1]);
		if (value != null) return value;
	}

	const normalized = title.replace(/[０-９]/g, (ch) =>
		String.fromCharCode(ch.charCodeAt(0) - 0xff10 + 0x30),
	);
	// Last standalone number in the title is the volume in nearly all LN formats
	const matches = normalized.match(/\d+(?:\.\d+)?/g);
	if (!matches || matches.length === 0) return null;
	const last = matches[matches.length - 1];
	if (last === undefined) return null;
	const num = Number.parseFloat(last);
	return Number.isNaN(num) ? null : num;
}

// Volume number only when the title ends with it ("…ラブコメ。14.5" → 14.5).
// Stricter than extractVolumeNumber: ignores numbers mid-title (e.g. "86-…").
export function extractTrailingVolume(title: string): number | null {
	const normalized = title
		.replace(/[０-９]/g, (ch) =>
			String.fromCharCode(ch.charCodeAt(0) - 0xff10 + 0x30),
		)
		.trim();
	const match = normalized.match(/(\d+(?:[.．]\d+)?)\s*$/);
	if (!match?.[1]) return null;
	const num = Number.parseFloat(match[1].replace("．", "."));
	return Number.isNaN(num) ? null : num;
}

function parseKanjiNumber(text: string): number | null {
	const digits: Record<string, number> = {
		一: 1,
		二: 2,
		三: 3,
		四: 4,
		五: 5,
		六: 6,
		七: 7,
		八: 8,
		九: 9,
	};
	const units: Record<string, number> = { 十: 10, 百: 100, 千: 1000 };

	let total = 0;
	let current = 0;
	for (const ch of text) {
		if (ch in digits) {
			current = digits[ch] ?? 0;
		} else if (ch in units) {
			total += (current || 1) * (units[ch] ?? 1);
			current = 0;
		} else {
			return null;
		}
	}
	return total + current || null;
}
