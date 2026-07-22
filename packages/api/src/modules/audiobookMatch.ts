const WEIGHTS = { title: 0.6, duration: 0.3, author: 0.1 } as const;

type MatchScores = {
	title: number;
	duration?: number;
	author?: number;
};

type AudiobookCandidate = {
	title?: string | null;
	duration?: number | null;
	authors?: readonly { name: string }[] | null;
};

/** Weighted mean over the evidence available on both audiobook records. */
export function audiobookMatchConfidence(scores: MatchScores): number {
	const parts = [
		{ score: scores.title, weight: WEIGHTS.title },
		...(scores.duration === undefined
			? []
			: [{ score: scores.duration, weight: WEIGHTS.duration }]),
		...(scores.author === undefined
			? []
			: [{ score: scores.author, weight: WEIGHTS.author }]),
	];
	const totalWeight = parts.reduce((sum, part) => sum + part.weight, 0);
	return (
		parts.reduce((sum, part) => sum + part.score * part.weight, 0) / totalWeight
	);
}

/** Removes volume and format noise used only to broaden audiobook title matching. */
export function cleanAudiobookTitle(title: string): string {
	return title
		.replace(/[([{][^)\]}]*[)\]}]/g, " ")
		.replace(/\b(?:vol(?:ume)?|book|part|disc|cd)\.?\s*\d+(?:\.\d+)?\b/gi, " ")
		.replace(/#\s*\d+(?:\.\d+)?\b/g, " ")
		.replace(/\bunabridged\b/gi, " ")
		.replace(/[-–—:,]\s*$/g, " ")
		.replace(/\s{2,}/g, " ")
		.trim();
}

/** Dice coefficient over case-folded Unicode letter/number bigrams. */
export function audiobookTextSimilarity(left: string, right: string): number {
	const bigrams = (text: string) => {
		const normalized = text.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
		const values = new Set<string>();
		for (let i = 0; i < normalized.length - 1; i++) {
			values.add(normalized.slice(i, i + 2));
		}
		return values;
	};
	const a = bigrams(left);
	const b = bigrams(right);
	if (a.size === 0 && b.size === 0) return 1;
	if (a.size === 0 || b.size === 0) return 0;
	let overlap = 0;
	for (const gram of a) if (b.has(gram)) overlap++;
	return (2 * overlap) / (a.size + b.size);
}

export function bestAudiobookTextSimilarity(
	left: readonly string[],
	right: readonly string[],
): number {
	return Math.max(
		0,
		...left.flatMap((a) => right.map((b) => audiobookTextSimilarity(a, b))),
	);
}

/** Audible rounds runtimes to minutes; similarity fades to zero at ten minutes. */
export function audiobookDurationSimilarity(
	leftSeconds: number,
	rightSeconds: number,
): number {
	const differenceMinutes = Math.abs(leftSeconds - rightSeconds) / 60;
	if (differenceMinutes <= 1) return 1;
	if (differenceMinutes >= 10) return 0;
	return 1 - (differenceMinutes - 1) / 9;
}

/** Candidate Ranking for Audiobook Quick Match. */
export function rankAudiobookCandidate(
	title: string,
	candidate: AudiobookCandidate,
	context?: {
		authors?: readonly { name: string }[] | null;
		duration?: number | null;
	},
): number {
	return audiobookMatchConfidence({
		title: audiobookTextSimilarity(title, candidate.title ?? ""),
		duration:
			context?.duration && candidate.duration
				? audiobookDurationSimilarity(context.duration, candidate.duration)
				: undefined,
		author:
			context?.authors?.length && candidate.authors?.length
				? bestAudiobookTextSimilarity(
						context.authors.map(({ name }) => name),
						candidate.authors.map(({ name }) => name),
					)
				: undefined,
	});
}
