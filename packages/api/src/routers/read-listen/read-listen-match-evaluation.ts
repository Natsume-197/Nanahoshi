import {
	type MatchPublication,
	normalizeMatchText,
	READ_LISTEN_PROPOSAL_THRESHOLD,
	scoreReadListenMatch,
} from "./read-listen-matcher";

export type EvaluationPublication = MatchPublication & {
	id: number;
	serverId: string;
	mediaType: "ebook" | "audiobook";
};

export type EvaluationPair = {
	serverId: string;
	audiobookId: number;
	ebookId: number;
};

export type MatchEvaluationFailure = {
	audiobookId: number;
	expectedEbookIds: number[];
	topEbookId: number | null;
	topScore: number | null;
	expectedScore: number | null;
	expectedEligible: boolean;
	warnings: string[];
};

export type MatchEvaluationReport = {
	matcherThreshold: number;
	audiobookCount: number;
	pairCount: number;
	evaluatedCount: number;
	missingPublicationCount: number;
	top1: number;
	semanticTop1: number;
	top3: number;
	top5: number;
	meanReciprocalRank: number;
	positiveEligibility: number;
	proposalCount: number;
	proposalPrecision: number;
	semanticProposalPrecision: number;
	thresholdSweep: {
		threshold: number;
		positiveCoverage: number;
		proposalCount: number;
		strictPrecision: number;
		semanticPrecision: number;
	}[];
	failures: MatchEvaluationFailure[];
};

function addToIndex(
	index: Map<string, Set<number>>,
	key: string,
	publicationId: number,
): void {
	if (!key) return;
	const ids = index.get(key) ?? new Set<number>();
	ids.add(publicationId);
	index.set(key, ids);
}

function textBigrams(value: string): Set<string> {
	const normalized = normalizeMatchText(value);
	if (normalized.length < 2) return new Set(normalized ? [normalized] : []);
	return new Set(
		Array.from({ length: normalized.length - 1 }, (_, index) =>
			normalized.slice(index, index + 2),
		),
	);
}

function ratio(value: number, total: number): number {
	return total === 0 ? 0 : value / total;
}

/**
 * Builds a deterministic hard-negative benchmark. Every audiobook is compared
 * with its confirmed ebook plus same-series, same-author, lexically close, and
 * deterministic background candidates from the same organization.
 */
export function evaluateReadListenMatches(
	publications: EvaluationPublication[],
	pairs: EvaluationPair[],
	options: {
		threshold?: number;
		lexicalCandidates?: number;
		randomCandidates?: number;
	} = {},
): MatchEvaluationReport {
	const threshold = options.threshold ?? READ_LISTEN_PROPOSAL_THRESHOLD;
	const lexicalCandidateLimit = options.lexicalCandidates ?? 40;
	const backgroundCandidateLimit = options.randomCandidates ?? 40;
	const byId = new Map(
		publications.map((publication) => [publication.id, publication]),
	);
	const ebooksByServer = new Map<string, EvaluationPublication[]>();
	const authorIndex = new Map<string, Set<number>>();
	const seriesIndex = new Map<string, Set<number>>();
	const bigramIndex = new Map<string, Set<number>>();

	for (const publication of publications) {
		if (publication.mediaType !== "ebook") continue;
		const serverEbooks = ebooksByServer.get(publication.serverId) ?? [];
		serverEbooks.push(publication);
		ebooksByServer.set(publication.serverId, serverEbooks);
		for (const author of publication.authors) {
			addToIndex(
				authorIndex,
				`${publication.serverId}:${normalizeMatchText(author.name)}`,
				publication.id,
			);
		}
		for (const item of publication.series ?? []) {
			addToIndex(
				seriesIndex,
				`${publication.serverId}:${normalizeMatchText(item.name)}`,
				publication.id,
			);
		}
		for (const bigram of new Set([
			...textBigrams(publication.title),
			...textBigrams(publication.filename),
		])) {
			addToIndex(
				bigramIndex,
				`${publication.serverId}:${bigram}`,
				publication.id,
			);
		}
	}

	const truthsByAudiobook = new Map<
		number,
		{ serverId: string; ebookIds: Set<number> }
	>();
	for (const pair of pairs) {
		const truth = truthsByAudiobook.get(pair.audiobookId) ?? {
			serverId: pair.serverId,
			ebookIds: new Set<number>(),
		};
		truth.ebookIds.add(pair.ebookId);
		truthsByAudiobook.set(pair.audiobookId, truth);
	}

	let missingPublicationCount = 0;
	let top1 = 0;
	let semanticTop1 = 0;
	let top3 = 0;
	let top5 = 0;
	let reciprocalRankTotal = 0;
	let positiveEligible = 0;
	let proposalCount = 0;
	let correctProposalCount = 0;
	let semanticCorrectProposalCount = 0;
	let evaluatedCount = 0;
	const failures: MatchEvaluationFailure[] = [];
	const evaluationPoints: {
		topScore: number | null;
		strictTopCorrect: boolean;
		semanticTopCorrect: boolean;
		positiveScore: number | null;
		positiveEligible: boolean;
	}[] = [];

	for (const [audiobookId, truth] of truthsByAudiobook) {
		const audiobook = byId.get(audiobookId);
		const expected = [...truth.ebookIds]
			.map((id) => byId.get(id))
			.filter(
				(publication): publication is EvaluationPublication =>
					publication?.mediaType === "ebook",
			);
		if (audiobook?.mediaType !== "audiobook" || expected.length === 0) {
			missingPublicationCount += 1;
			continue;
		}
		evaluatedCount += 1;

		const candidateIds = new Set(expected.map((publication) => publication.id));
		for (const author of audiobook.authors) {
			for (const id of authorIndex.get(
				`${truth.serverId}:${normalizeMatchText(author.name)}`,
			) ?? []) {
				candidateIds.add(id);
			}
		}
		for (const item of audiobook.series ?? []) {
			for (const id of seriesIndex.get(
				`${truth.serverId}:${normalizeMatchText(item.name)}`,
			) ?? []) {
				candidateIds.add(id);
			}
		}

		const lexicalOverlap = new Map<number, number>();
		for (const bigram of new Set([
			...textBigrams(audiobook.title),
			...textBigrams(audiobook.filename),
		])) {
			for (const id of bigramIndex.get(`${truth.serverId}:${bigram}`) ?? []) {
				lexicalOverlap.set(id, (lexicalOverlap.get(id) ?? 0) + 1);
			}
		}
		for (const [id] of [...lexicalOverlap.entries()]
			.sort((left, right) => right[1] - left[1] || left[0] - right[0])
			.slice(0, lexicalCandidateLimit)) {
			candidateIds.add(id);
		}

		for (const ebook of (ebooksByServer.get(truth.serverId) ?? []).slice(
			0,
			backgroundCandidateLimit,
		)) {
			candidateIds.add(ebook.id);
		}

		const ranked = [...candidateIds]
			.flatMap((id) => {
				const ebook = byId.get(id);
				if (ebook?.mediaType !== "ebook") return [];
				return [{ ebook, match: scoreReadListenMatch(audiobook, ebook) }];
			})
			.filter(({ match }) => match.eligible)
			.sort(
				(left, right) =>
					right.match.score - left.match.score ||
					left.ebook.id - right.ebook.id,
			);
		const topCandidate = ranked[0];
		const rank = ranked.findIndex(({ ebook }) => truth.ebookIds.has(ebook.id));
		const isSemanticMatch = (candidate: EvaluationPublication | undefined) =>
			candidate !== undefined &&
			(truth.ebookIds.has(candidate.id) ||
				expected.some((confirmed) => {
					const equivalence = scoreReadListenMatch(confirmed, candidate);
					return equivalence.eligible && equivalence.score >= 75;
				}));
		if (rank === 0) top1 += 1;
		if (isSemanticMatch(topCandidate?.ebook)) semanticTop1 += 1;
		if (rank >= 0 && rank < 3) top3 += 1;
		if (rank >= 0 && rank < 5) top5 += 1;
		if (rank >= 0) reciprocalRankTotal += 1 / (rank + 1);

		const expectedMatches = expected.map((ebook) => ({
			ebook,
			match: scoreReadListenMatch(audiobook, ebook),
		}));
		const bestExpected = expectedMatches.sort(
			(left, right) => right.match.score - left.match.score,
		)[0];
		if (bestExpected?.match.eligible && bestExpected.match.score >= threshold) {
			positiveEligible += 1;
		}

		const proposal =
			topCandidate && topCandidate.match.score >= threshold
				? topCandidate
				: undefined;
		if (proposal) {
			proposalCount += 1;
			if (truth.ebookIds.has(proposal.ebook.id)) correctProposalCount += 1;
			if (isSemanticMatch(proposal.ebook)) semanticCorrectProposalCount += 1;
		}
		evaluationPoints.push({
			topScore: topCandidate?.match.score ?? null,
			strictTopCorrect: truth.ebookIds.has(topCandidate?.ebook.id ?? -1),
			semanticTopCorrect: isSemanticMatch(topCandidate?.ebook),
			positiveScore: bestExpected?.match.score ?? null,
			positiveEligible: bestExpected?.match.eligible ?? false,
		});
		if (rank !== 0 || !bestExpected?.match.eligible) {
			failures.push({
				audiobookId,
				expectedEbookIds: [...truth.ebookIds],
				topEbookId: topCandidate?.ebook.id ?? null,
				topScore: topCandidate?.match.score ?? null,
				expectedScore: bestExpected?.match.score ?? null,
				expectedEligible: bestExpected?.match.eligible ?? false,
				warnings: bestExpected?.match.warnings ?? [],
			});
		}
	}

	return {
		matcherThreshold: threshold,
		audiobookCount: truthsByAudiobook.size,
		pairCount: pairs.length,
		evaluatedCount,
		missingPublicationCount,
		top1: ratio(top1, evaluatedCount),
		semanticTop1: ratio(semanticTop1, evaluatedCount),
		top3: ratio(top3, evaluatedCount),
		top5: ratio(top5, evaluatedCount),
		meanReciprocalRank: ratio(reciprocalRankTotal, evaluatedCount),
		positiveEligibility: ratio(positiveEligible, evaluatedCount),
		proposalCount,
		proposalPrecision: ratio(correctProposalCount, proposalCount),
		semanticProposalPrecision: ratio(
			semanticCorrectProposalCount,
			proposalCount,
		),
		thresholdSweep: [40, 45, 50, 55, 60, 65, 70, 75, 80, 85].map(
			(sweepThreshold) => {
				const proposals = evaluationPoints.filter(
					(point) =>
						point.topScore !== null && point.topScore >= sweepThreshold,
				);
				return {
					threshold: sweepThreshold,
					positiveCoverage: ratio(
						evaluationPoints.filter(
							(point) =>
								point.positiveEligible &&
								point.positiveScore !== null &&
								point.positiveScore >= sweepThreshold,
						).length,
						evaluationPoints.length,
					),
					proposalCount: proposals.length,
					strictPrecision: ratio(
						proposals.filter((point) => point.strictTopCorrect).length,
						proposals.length,
					),
					semanticPrecision: ratio(
						proposals.filter((point) => point.semanticTopCorrect).length,
						proposals.length,
					),
				};
			},
		),
		failures: failures.sort(
			(left, right) =>
				(right.topScore ?? -1) - (left.topScore ?? -1) ||
				left.audiobookId - right.audiobookId,
		),
	};
}
