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
			// Remove brackets, quotes, and decorative punctuation
			.replace(/[「」『』【】（）()[\]{}～~・]/g, " ")
			// Remove decorative hyphens/dashes (common in JP titles like "-kuu-")
			.replace(/[-−–—]+/g, " ")
			// Remove Japanese legal entity prefixes (too specific for search)
			.replace(/株式会社|有限会社/g, "")
			.replace(/\s+/g, " ")
			.trim()
	);
}

export function normalizeForComparison(text: string): string {
	return text
		.replace(/[０-９]/g, (ch) =>
			String.fromCharCode(ch.charCodeAt(0) - 0xff10 + 0x30),
		)
		.replace(NON_ALPHANUMERIC_PATTERN, "")
		.toLowerCase();
}

export function isTitleSimilar(input: string, result: string): boolean {
	// If one contains the other, it's a match
	if (result.includes(input) || input.includes(result)) return true;

	// Extract numbers from both — volume numbers must match
	const inputNumbers: string[] = input.match(/\d+/g) ?? [];
	const resultNumbers: string[] = result.match(/\d+/g) ?? [];

	// If input has a volume number, the result must contain it
	if (inputNumbers.length > 0) {
		const hasMatchingNumber = inputNumbers.some((n) =>
			resultNumbers.includes(n),
		);
		if (!hasMatchingNumber) return false;
	}

	// Use character bigrams (2-char sequences) for similarity.
	// Single-char overlap is too loose for CJK — common particles
	// (に, の, は, が) and verb endings (された, ました) create false matches.
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

/**
 * Extracts a trailing volume number from a title (Arabic or full-width
 * digits, or kanji 第N巻 markers). Returns null when none is found.
 */
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

/**
 * Volume number only when the title ends with it ("...ラブコメ。14.5" → 14.5).
 * Stricter than extractVolumeNumber: avoids false positives from numbers
 * embedded mid-title (e.g. "86-エイティシックス-").
 */
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
