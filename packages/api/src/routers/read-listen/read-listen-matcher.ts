export const READ_LISTEN_MATCHER_VERSION = "rules-v4";
export const READ_LISTEN_PROPOSAL_THRESHOLD = 55;

export type MatchSeries = {
	name: string;
	position: number | null;
};

export type MatchPublication = {
	title: string;
	filename: string;
	authors: { name: string }[];
	series?: MatchSeries[];
};

export type MatchConfidence = "high" | "medium" | "low";

export type MatchExplanation = {
	score: number;
	confidence: MatchConfidence;
	reasons: string[];
	warnings: string[];
	eligible: boolean;
};

const EDITION_NOISE =
	/\b(?:audiobook|audio\s*book|unabridged|abridged|digital|retail|kindle|epub)\b/giu;
const BRACKET_NOISE =
	/[[(【（](?:オーディオブック|朗読|完全版|通常版|新装版|文庫版|audiobook|unabridged|abridged)[\])】）]/giu;
const TRAILING_PUBLISHER_NOISE =
	/(?:(?:\s*[:：]\s*)?\s*[(（][^)）]*(?:文庫|出版社?|書店|書房|小学館|books?|press)[^)）]*[)）])+\s*$/giu;
const PART_MARKERS: [RegExp, string][] = [
	[/(?:上巻|前編|(?:^|\s)上(?:\s|$))/u, "upper"],
	[/(?:下巻|後編|(?:^|\s)下(?:\s|$))/u, "lower"],
	[/(?:中巻|中編|(?:^|\s)中(?:\s|$))/u, "middle"],
];

const KANJI_DIGITS: Record<string, number> = {
	〇: 0,
	零: 0,
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

function parseKanjiNumber(value: string): number | null {
	if (value === "十") return 10;
	if (value.includes("十")) {
		const [tens, ones] = value.split("十");
		const tensValue = tens ? KANJI_DIGITS[tens] : 1;
		const onesValue = ones ? KANJI_DIGITS[ones] : 0;
		if (tensValue === undefined || onesValue === undefined) return null;
		return tensValue * 10 + onesValue;
	}
	let result = 0;
	for (const character of value) {
		const digit = KANJI_DIGITS[character];
		if (digit === undefined) return null;
		result = result * 10 + digit;
	}
	return result;
}

function parseRomanNumber(value: string): number | null {
	if (!/^[ivxlcdm]+$/iu.test(value)) return null;
	const values: Record<string, number> = {
		i: 1,
		v: 5,
		x: 10,
		l: 50,
		c: 100,
		d: 500,
		m: 1000,
	};
	let result = 0;
	let previous = 0;
	for (const character of [...value.toLowerCase()].reverse()) {
		const current = values[character] ?? 0;
		result += current < previous ? -current : current;
		previous = current;
	}
	return result || null;
}

function parseVolumeNumber(value: string): number | null {
	const normalized = value.normalize("NFKC").trim();
	if (/^\d+(?:\.\d+)?$/.test(normalized)) return Number(normalized);
	return parseRomanNumber(normalized) ?? parseKanjiNumber(normalized);
}

function extractExplicitVolume(title: string): number | null {
	const normalized = title.normalize("NFKC");
	const suffixed = normalized.match(
		/(?:第\s*)?([0-9]+(?:\.[0-9]+)?|[〇零一二三四五六七八九十]+|[ivxlcdm]+)\s*(?:巻|(?:vol(?:ume)?\.?))/iu,
	);
	if (suffixed?.[1]) return parseVolumeNumber(suffixed[1]);
	const prefixed = normalized.match(
		/(?:vol(?:ume)?|lv)\.?\s*([0-9]+(?:\.[0-9]+)?|[〇零一二三四五六七八九十]+|[ivxlcdm]+)/iu,
	);
	if (prefixed?.[1]) return parseVolumeNumber(prefixed[1]);
	const extra = normalized.match(
		/\bex\s*([0-9]+(?:\.[0-9]+)?|[〇零一二三四五六七八九十]+|[ivxlcdm]+)\b/iu,
	);
	if (extra?.[1]) return parseVolumeNumber(extra[1]);
	const parenthetical = normalized.match(
		/[(（]\s*([0-9]+(?:\.[0-9]+)?|[〇零一二三四五六七八九十]+|[ivxlcdm]+)\s*[)）]\s*$/iu,
	);
	if (parenthetical?.[1]) return parseVolumeNumber(parenthetical[1]);
	const attached = normalized.match(
		/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]([0-9]+(?:\.[0-9]+)?|[ivxlcdm]+)(?:\s*[」』])?(?:\s*[(（][^)）]*[)）])?\s*$/iu,
	);
	if (attached?.[1]) return parseVolumeNumber(attached[1]);
	return null;
}

function extractTrailingVolume(title: string): number | null {
	const normalized = title.normalize("NFKC");
	const trailing = normalized.match(
		/(?:^|[\s:_-])([0-9]+(?:\.[0-9]+)?|[ivxlcdm]+)\s*$/iu,
	);
	return trailing?.[1] ? parseVolumeNumber(trailing[1]) : null;
}

export function extractVolume(title: string): number | null {
	return extractExplicitVolume(title) ?? extractTrailingVolume(title);
}

function extractPartMarker(title: string): string | null {
	const spaced = title
		.normalize("NFKC")
		.replace(/[\p{P}\p{S}]+/gu, " ")
		.trim();
	for (const [pattern, marker] of PART_MARKERS) {
		if (pattern.test(spaced)) return marker;
	}
	return null;
}

function isSpecialVolume(title: string): boolean {
	const normalized = title.normalize("NFKC").toLocaleLowerCase();
	return /(?:短編集|短篇集|外伝|番外編|特別編|side\s*stor(?:y|ies)|\bextra\b|ex\s*\d)/iu.test(
		normalized,
	);
}

export function normalizeMatchText(value: string): string {
	return value
		.normalize("NFKC")
		.toLocaleLowerCase()
		.replace(BRACKET_NOISE, " ")
		.replace(EDITION_NOISE, " ")
		.replace(/\.[a-z0-9]{2,5}$/iu, "")
		.replace(/[\p{P}\p{S}\s]+/gu, "")
		.trim();
}

function stripTrailingPublisherNoise(value: string): string {
	return value.replace(TRAILING_PUBLISHER_NOISE, " ").trim();
}

/**
 * Produces bounded, human-readable discovery projections. Search engines should
 * see the work title even when an audiobook embeds storefront volume and
 * publisher decorations in its title.
 */
export function deriveMatchSearchQueries(value: string): string[] {
	const normalized = stripTrailingPublisherNoise(
		value
			.normalize("NFKC")
			.replace(/\.[a-z0-9]{2,5}$/iu, "")
			.trim(),
	);
	const searchable = normalized
		.replace(
			/([\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}])([0-9]+(?:\.[0-9]+)?)(?=\s*[」』]|\s*$)/gu,
			"$1 $2",
		)
		.replace(/[「」『』～〜]/gu, " ")
		.replace(/[\p{P}\p{S}]+/gu, " ")
		.replace(/\s+/gu, " ")
		.trim();
	const withoutVolumeDecoration = searchable
		.replace(
			/^(?:第\s*)?(?:[0-9]+(?:\.[0-9]+)?|[〇零一二三四五六七八九十]+|[ivxlcdm]+)\s*巻\s*/iu,
			"",
		)
		.replace(
			/\s+(?:[0-9]+(?:\.[0-9]+)?|[〇零一二三四五六七八九十]+|[ivxlcdm]+)\s*$/iu,
			"",
		)
		.trim();

	return [...new Set([normalized, searchable, withoutVolumeDecoration])].filter(
		Boolean,
	);
}

function baseTitle(value: string): string {
	return normalizeMatchText(
		stripTrailingPublisherNoise(value)
			.normalize("NFKC")
			.replace(
				/(?:第\s*)?(?:[0-9]+(?:\.[0-9]+)?|[〇零一二三四五六七八九十]+|[ivxlcdm]+)\s*(?:巻|vol(?:ume)?\.?)/giu,
				" ",
			)
			.replace(
				/(?:vol(?:ume)?|lv)\.?\s*(?:[0-9]+(?:\.[0-9]+)?|[〇零一二三四五六七八九十]+|[ivxlcdm]+)/giu,
				" ",
			)
			.replace(
				/[(（]\s*(?:[0-9]+(?:\.[0-9]+)?|[〇零一二三四五六七八九十]+|[ivxlcdm]+)\s*[)）]\s*$/iu,
				" ",
			)
			.replace(
				/([\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}])(?:[0-9]+(?:\.[0-9]+)?|[ivxlcdm]+)(?:\s*[」』])?(?:\s*[(（][^)）]*[)）])?\s*$/iu,
				"$1",
			)
			.replace(
				/(?:^|[\p{P}\p{S}\s])(?:[0-9]+(?:\.[0-9]+)?|[ivxlcdm]+)\s*$/iu,
				" ",
			),
	);
}

function bigrams(value: string): Set<string> {
	if (value.length < 2) return new Set(value ? [value] : []);
	return new Set(
		Array.from({ length: value.length - 1 }, (_, i) => value.slice(i, i + 2)),
	);
}

function diceSimilarity(left: string, right: string): number {
	if (!left || !right) return 0;
	if (left === right) return 1;
	const a = bigrams(left);
	const b = bigrams(right);
	let overlap = 0;
	for (const item of a) if (b.has(item)) overlap += 1;
	return (2 * overlap) / (a.size + b.size);
}

function names(publication: MatchPublication): Set<string> {
	return new Set(
		publication.authors
			.map((author) => normalizeMatchText(author.name))
			.filter(Boolean),
	);
}

function hasOverlap(left: Set<string>, right: Set<string>): boolean {
	for (const value of left) if (right.has(value)) return true;
	return false;
}

function unambiguousSeriesPosition(
	publication: MatchPublication,
): number | null {
	const positions = new Set(
		(publication.series ?? [])
			.map((item) => item.position)
			.filter(
				(position): position is number =>
					position !== null && Number.isFinite(position) && position > 0,
			),
	);
	if (positions.size !== 1) return null;
	return positions.values().next().value ?? null;
}

function matchConfidence(score: number, warnings: string[]): MatchConfidence {
	if (score >= 85 && warnings.length === 0) return "high";
	if (score >= 65) return "medium";
	return "low";
}

export function scoreReadListenMatch(
	audiobook: MatchPublication,
	ebook: MatchPublication,
): MatchExplanation {
	const reasons: string[] = [];
	const warnings: string[] = [];
	let score = 0;
	let eligible = true;

	const comparisons = [
		{
			left: baseTitle(audiobook.title),
			right: baseTitle(ebook.title),
			reason: "title",
		},
		{
			left: baseTitle(audiobook.filename),
			right: baseTitle(ebook.filename),
			reason: "filename",
		},
		{
			left: baseTitle(audiobook.filename),
			right: baseTitle(ebook.title),
			reason: "filename_to_title",
		},
		{
			left: baseTitle(audiobook.title),
			right: baseTitle(ebook.filename),
			reason: "title_to_filename",
		},
	]
		.map((comparison) => ({
			...comparison,
			similarity: diceSimilarity(comparison.left, comparison.right),
		}))
		.sort((left, right) => right.similarity - left.similarity);
	const bestTitle = comparisons[0];
	const titleSimilarity = bestTitle?.similarity ?? 0;
	if (bestTitle?.left && bestTitle.left === bestTitle.right) {
		score += 85;
		reasons.push(`${bestTitle.reason}.exact`);
	} else {
		score += Math.round(titleSimilarity * 45);
		if (titleSimilarity >= 0.7) reasons.push("title.similar");
		else warnings.push("title.weak");
	}

	const audiobookAuthors = names(audiobook);
	const ebookAuthors = names(ebook);
	if (hasOverlap(audiobookAuthors, ebookAuthors)) {
		score += 20;
		reasons.push("author.match");
	} else if (audiobookAuthors.size && ebookAuthors.size) {
		warnings.push("author.mismatch");
	}

	const audiobookSeries = audiobook.series ?? [];
	const ebookSeries = ebook.series ?? [];
	const matchingSeries = audiobookSeries.find((audioSeries) =>
		ebookSeries.some(
			(bookSeries) =>
				normalizeMatchText(bookSeries.name) ===
				normalizeMatchText(audioSeries.name),
		),
	);
	if (matchingSeries) {
		score += 15;
		reasons.push("series.match");
		const ebookMatch = ebookSeries.find(
			(item) =>
				normalizeMatchText(item.name) ===
				normalizeMatchText(matchingSeries.name),
		);
		if (
			matchingSeries.position !== null &&
			ebookMatch?.position !== null &&
			ebookMatch?.position !== undefined
		) {
			if (matchingSeries.position === ebookMatch.position) {
				score += 10;
				reasons.push("series.position.match");
			} else {
				score -= 15;
				warnings.push("series.position.conflict");
			}
		}
	}

	const audiobookExplicitVolume =
		extractExplicitVolume(audiobook.title) ??
		extractExplicitVolume(audiobook.filename) ??
		extractTrailingVolume(audiobook.title) ??
		extractTrailingVolume(audiobook.filename);
	const ebookExplicitVolume =
		extractExplicitVolume(ebook.title) ??
		extractExplicitVolume(ebook.filename) ??
		extractTrailingVolume(ebook.title) ??
		extractTrailingVolume(ebook.filename);
	const audiobookVolume =
		audiobookExplicitVolume ?? unambiguousSeriesPosition(audiobook);
	const ebookVolume = ebookExplicitVolume ?? unambiguousSeriesPosition(ebook);
	if (audiobookVolume !== null && ebookVolume !== null) {
		if (audiobookVolume === ebookVolume) {
			score += 10;
			reasons.push("volume.match");
		} else {
			warnings.push("volume.conflict");
			eligible = false;
		}
	}

	const audiobookPart =
		extractPartMarker(audiobook.title) ?? extractPartMarker(audiobook.filename);
	const ebookPart =
		extractPartMarker(ebook.title) ?? extractPartMarker(ebook.filename);
	if (audiobookPart && ebookPart && audiobookPart !== ebookPart) {
		warnings.push("part.conflict");
		eligible = false;
	}

	const audiobookSpecial =
		isSpecialVolume(audiobook.title) || isSpecialVolume(audiobook.filename);
	const ebookSpecial =
		isSpecialVolume(ebook.title) || isSpecialVolume(ebook.filename);
	if (audiobookSpecial && ebookSpecial) {
		score += 5;
		reasons.push("edition.special.match");
	} else if (audiobookSpecial !== ebookSpecial) {
		warnings.push("edition.special.conflict");
		eligible = false;
	}

	score = Math.min(100, Math.max(0, score));
	const confidence = matchConfidence(score, warnings);
	return { score, confidence, reasons, warnings, eligible };
}
