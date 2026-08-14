import {
	assessGroupMembership,
	type CatalogIdentityEvidence,
	CATALOG_IDENTITY_REASONS as R,
} from "../catalogIdentity";
import type {
	CatalogEnrichmentCandidate,
	CatalogEnrichmentFailure,
	CatalogEnrichmentInput,
	CatalogEnrichmentMatch,
	CatalogEnrichmentResult,
	HydratedCatalogCandidate,
} from "./types";

const DEFAULT_MAX_HYDRATIONS_PER_PROVIDER = 3;
const HARD_IDENTITY_REASONS = new Set<string>([
	R.IDENTIFIER_MATCH,
	R.EMBEDDED_UID_MATCH,
	R.AUDIO_ASIN_MATCH,
]);

function confirmedIdentityRank(reasons: readonly string[]): number {
	if (reasons.some((reason) => HARD_IDENTITY_REASONS.has(reason))) {
		return 3;
	}
	if (reasons.includes(R.TITLE_EQUIVALENT)) return 2;
	return 1;
}

export class CatalogProviderError extends Error {
	readonly retryAfterMs?: number;

	constructor(
		readonly kind: "transient" | "permanent",
		readonly code: string,
		options?: ErrorOptions & { retryAfterMs?: number },
	) {
		super(code, options);
		this.name = "CatalogProviderError";
		this.retryAfterMs = options?.retryAfterMs;
	}
}

function providerFailure<TProvider extends string>(
	provider: TProvider,
	phase: CatalogEnrichmentFailure<TProvider>["phase"],
	error: unknown,
): CatalogEnrichmentFailure<TProvider> {
	if (!(error instanceof CatalogProviderError)) throw error;
	return {
		provider,
		phase,
		kind: error.kind,
		code: error.code,
		...(error.retryAfterMs != null && { retryAfterMs: error.retryAfterMs }),
	};
}

function withoutProtectedFields<TMetadata extends object>(
	metadata: Partial<TMetadata>,
	protectedFields: readonly (keyof TMetadata)[],
): Partial<TMetadata> {
	const mergeable = { ...metadata };
	for (const field of protectedFields) delete mergeable[field];
	return mergeable;
}

export async function runCatalogEnrichment<
	TProvider extends string,
	TMetadata extends object,
>({
	initialMetadata,
	initialEvidence,
	providers,
	policy,
	requiredPrimaryProvider,
	requiredPrimaryProviderId,
	protectedFields = [],
	maxHydrationsPerProvider = DEFAULT_MAX_HYDRATIONS_PER_PROVIDER,
}: CatalogEnrichmentInput<TProvider, TMetadata>): Promise<
	CatalogEnrichmentResult<TProvider, TMetadata>
> {
	let metadata = initialMetadata;
	const acceptedEvidence = [initialEvidence];
	const contributingProviders: TProvider[] = [];
	const matches: CatalogEnrichmentMatch<TProvider>[] = [];
	const fieldSources: Record<string, TProvider> = {};
	const failures: CatalogEnrichmentFailure<TProvider>[] = [];
	let primaryProviderId: string | undefined;
	let primaryReasons: string[] = [];

	const acceptHydrated = (
		provider: (typeof providers)[number],
		candidate: CatalogEnrichmentCandidate<TMetadata>,
		hydrated: HydratedCatalogCandidate<TMetadata>,
		reasons: readonly string[],
	) => {
		const primary = contributingProviders.length === 0;
		const before = metadata;
		metadata = policy.merge(
			metadata,
			withoutProtectedFields(hydrated.metadata, protectedFields),
			{
				provider: provider.id,
				providerId: candidate.providerId,
				primary,
			},
		);
		for (const key of Object.keys(metadata) as (keyof TMetadata)[]) {
			if (metadata[key] !== before[key])
				fieldSources[key as string] = provider.id;
		}
		acceptedEvidence.push(hydrated.evidence);
		contributingProviders.push(provider.id);
		const describedAs = policy.describe?.(hydrated.metadata);
		matches.push({
			provider: provider.id,
			providerId: candidate.providerId,
			...(primary && requiredPrimaryProviderId ? { manual: true } : {}),
			...(describedAs && { title: describedAs }),
			...(primary && { reasons: [...reasons] }),
		});
		if (primary) {
			primaryProviderId = candidate.providerId;
			primaryReasons = [...reasons];
		}
	};

	providerLoop: for (const provider of providers) {
		if (
			requiredPrimaryProvider &&
			contributingProviders.length === 0 &&
			provider.id !== requiredPrimaryProvider
		) {
			continue;
		}
		if (
			policy.shouldRun?.(provider.id, metadata, {
				hasMatch: contributingProviders.length > 0,
			}) === false
		) {
			continue;
		}

		// Discover every projection before accepting a primary identity. A raw and
		// a cleaned query may each expose a different valid record; accepting the
		// first query would silently turn that collision into a guess.
		if (contributingProviders.length === 0) {
			const discovered: {
				candidate: CatalogEnrichmentCandidate<TMetadata>;
				query: CatalogIdentityEvidence;
			}[] = [];
			const seenPrimary = new Set<string>();
			let primaryHydrationCount = 0;
			const queries = requiredPrimaryProviderId
				? []
				: policy.discoveryQueries(metadata);
			if (requiredPrimaryProviderId) {
				discovered.push({
					candidate: {
						providerId: requiredPrimaryProviderId,
						metadata: {},
						evidence: initialEvidence,
					},
					query: initialEvidence,
				});
				seenPrimary.add(requiredPrimaryProviderId);
			}
			for (const query of queries) {
				let candidates: readonly CatalogEnrichmentCandidate<TMetadata>[];
				try {
					candidates = await provider.discover(query, metadata);
				} catch (error) {
					failures.push(providerFailure(provider.id, "discovery", error));
					continue providerLoop;
				}
				const queryViable: {
					candidate: CatalogEnrichmentCandidate<TMetadata>;
					reasons: readonly string[];
					status: "confirmed" | "indeterminate";
				}[] = [];
				for (const candidate of candidates) {
					if (seenPrimary.has(candidate.providerId)) continue;
					seenPrimary.add(candidate.providerId);
					const verdict = assessGroupMembership(
						candidate.evidence,
						acceptedEvidence,
					);
					if (verdict.status !== "rejected") {
						discovered.push({ candidate, query });
						queryViable.push({
							candidate,
							reasons: verdict.reasons,
							status: verdict.status,
						});
					}
				}
				const exact = queryViable[0];
				if (
					queryViable.length === 1 &&
					exact?.status === "confirmed" &&
					exact.reasons.some((reason) =>
						[
							"identifier.match",
							"embedded_uid.match",
							"audiobook.asin_match",
						].includes(reason),
					)
				) {
					if (primaryHydrationCount >= maxHydrationsPerProvider) break;
					primaryHydrationCount++;
					let hydrated: HydratedCatalogCandidate<TMetadata> | null;
					try {
						hydrated = await provider.hydrate(exact.candidate, metadata);
					} catch (error) {
						failures.push(providerFailure(provider.id, "hydration", error));
						continue providerLoop;
					}
					const verdict = hydrated
						? assessGroupMembership(hydrated.evidence, acceptedEvidence)
						: null;
					if (hydrated && verdict?.status === "confirmed") {
						acceptHydrated(
							provider,
							exact.candidate,
							hydrated,
							verdict.reasons,
						);
						continue providerLoop;
					}
					const index = discovered.findIndex(
						({ candidate }) =>
							candidate.providerId === exact.candidate.providerId,
					);
					if (index >= 0) discovered.splice(index, 1);
				}
			}
			discovered.sort(
				(left, right) =>
					policy.rank(metadata, right.candidate, right.query) -
					policy.rank(metadata, left.candidate, left.query),
			);

			const confirmed: {
				candidate: CatalogEnrichmentCandidate<TMetadata>;
				hydrated: HydratedCatalogCandidate<TMetadata>;
				reasons: string[];
				match: CatalogEnrichmentMatch<TProvider>;
			}[] = [];
			let hydratedCount = primaryHydrationCount;
			for (const { candidate } of discovered) {
				if (hydratedCount >= maxHydrationsPerProvider) break;
				hydratedCount++;
				let hydrated: HydratedCatalogCandidate<TMetadata> | null;
				try {
					hydrated = await provider.hydrate(candidate, metadata);
				} catch (error) {
					failures.push(providerFailure(provider.id, "hydration", error));
					continue providerLoop;
				}
				if (!hydrated) continue;
				const verdict = assessGroupMembership(
					hydrated.evidence,
					acceptedEvidence,
				);
				if (verdict.status !== "confirmed") continue;
				const reasons = verdict.reasons.filter(
					(reason) => reason !== "group.member_confirmed",
				);
				const describedAs = policy.describe?.(hydrated.metadata);
				confirmed.push({
					candidate,
					hydrated,
					reasons: [...verdict.reasons],
					match: {
						provider: provider.id,
						providerId: candidate.providerId,
						...(describedAs && { title: describedAs }),
						reasons,
					},
				});
			}
			const bestRank = confirmed.reduce(
				(best, candidate) =>
					Math.max(best, confirmedIdentityRank(candidate.reasons)),
				0,
			);
			const strongest = confirmed.filter(
				(candidate) => confirmedIdentityRank(candidate.reasons) === bestRank,
			);
			if (strongest.length > 1) {
				return {
					status: "no_match",
					decision: {
						kind: "ambiguous",
						candidates: strongest.slice(0, 2).map(({ match }) => match),
					},
					failures,
				};
			}
			const winner = strongest[0];
			if (winner) {
				acceptHydrated(
					provider,
					winner.candidate,
					winner.hydrated,
					winner.reasons,
				);
				continue;
			}
			if (discovered.length > hydratedCount) {
				failures.push({
					provider: provider.id,
					phase: "hydration",
					kind: "permanent",
					code: "candidate_budget_exhausted",
				});
			}
			continue;
		}

		let accepted = false;
		let hydrationCount = 0;
		const seenCandidates = new Set<string>();
		const hydratedCache = new Map<
			string,
			HydratedCatalogCandidate<TMetadata> | null
		>();
		for (const query of policy.discoveryQueries(metadata)) {
			let candidates: readonly CatalogEnrichmentCandidate<TMetadata>[];
			try {
				candidates = await provider.discover(query, metadata);
			} catch (error) {
				failures.push(providerFailure(provider.id, "discovery", error));
				continue providerLoop;
			}
			const queryCandidates = new Set<string>();
			const assessed = candidates
				.filter((candidate) => {
					if (
						seenCandidates.has(candidate.providerId) ||
						queryCandidates.has(candidate.providerId)
					) {
						return false;
					}
					queryCandidates.add(candidate.providerId);
					return true;
				})
				.map((candidate) => ({
					candidate,
					verdict: assessGroupMembership(candidate.evidence, acceptedEvidence),
				}))
				.filter(({ verdict }) => verdict.status !== "rejected");
			const viable = assessed
				.map(({ candidate }) => candidate)
				.sort(
					(left, right) =>
						policy.rank(metadata, right, query) -
						policy.rank(metadata, left, query),
				);

			for (const candidate of viable) {
				if (seenCandidates.has(candidate.providerId)) continue;
				seenCandidates.add(candidate.providerId);
				let hydrated: HydratedCatalogCandidate<TMetadata> | null;
				if (hydratedCache.has(candidate.providerId)) {
					hydrated = hydratedCache.get(candidate.providerId) ?? null;
				} else {
					if (hydrationCount >= maxHydrationsPerProvider) {
						failures.push({
							provider: provider.id,
							phase: "hydration",
							kind: "permanent",
							code: "candidate_budget_exhausted",
						});
						continue providerLoop;
					}
					hydrationCount++;
					try {
						hydrated = await provider.hydrate(candidate, metadata);
					} catch (error) {
						failures.push(providerFailure(provider.id, "hydration", error));
						continue providerLoop;
					}
				}
				if (!hydrated) continue;
				const verdict = assessGroupMembership(
					hydrated.evidence,
					acceptedEvidence,
				);
				if (verdict.status !== "confirmed") continue;

				acceptHydrated(provider, candidate, hydrated, verdict.reasons);
				accepted = true;
				break;
			}
			if (accepted) break;
		}
	}

	const primaryProvider = contributingProviders[0];
	if (!primaryProvider || !primaryProviderId) {
		return failures.some(({ kind }) => kind === "transient")
			? { status: "retryable_failure", failures }
			: { status: "no_match", failures };
	}
	return {
		status: "matched",
		metadata,
		primaryProvider,
		primaryProviderId,
		contributingProviders,
		matches,
		primaryReasons,
		primaryAmbiguous: false,
		fieldSources,
		failures,
		retryable: failures.some(({ kind }) => kind === "transient"),
	};
}
