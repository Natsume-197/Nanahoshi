import type { MatchDecision, MatchDecisionCandidate } from "./types";

// Matches the pipeline's MAX_AMBIGUOUS_CANDIDATES.
const MAX_CANDIDATES = 5;

export function resolveAmbiguousCandidates(
	listDecision: MatchDecision | null | undefined,
	detailDecision: MatchDecision | null | undefined,
): MatchDecisionCandidate[] {
	const decision = detailDecision ?? listDecision;
	if (decision?.kind !== "ambiguous") return [];

	const seen = new Set<string>();
	const candidates: MatchDecisionCandidate[] = [];
	for (const candidate of decision.candidates) {
		if (!candidate.providerId) continue;
		const key = `${candidate.provider}:${candidate.providerId}`;
		if (seen.has(key)) continue;
		seen.add(key);
		candidates.push({ ...candidate, providerId: candidate.providerId });
		if (candidates.length === MAX_CANDIDATES) break;
	}
	return candidates;
}
