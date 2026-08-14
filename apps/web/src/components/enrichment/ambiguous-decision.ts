import type { MatchDecision, MatchDecisionCandidate } from "./types";

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
		if (candidates.length === 2) break;
	}
	return candidates;
}
