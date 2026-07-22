import { assessGroupMembership } from "../catalogIdentity";
import type {
	CatalogEnrichmentCandidate,
	CatalogEnrichmentFailure,
	CatalogEnrichmentInput,
	CatalogEnrichmentResult,
	HydratedCatalogCandidate,
} from "./types";

const DEFAULT_MAX_HYDRATIONS_PER_PROVIDER = 3;

export class CatalogProviderError extends Error {
	constructor(
		readonly kind: "transient" | "permanent",
		readonly code: string,
		options?: ErrorOptions,
	) {
		super(code, options);
		this.name = "CatalogProviderError";
	}
}

function providerFailure<TProvider extends string>(
	provider: TProvider,
	phase: CatalogEnrichmentFailure<TProvider>["phase"],
	error: unknown,
): CatalogEnrichmentFailure<TProvider> {
	if (!(error instanceof CatalogProviderError)) throw error;
	return { provider, phase, kind: error.kind, code: error.code };
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
	protectedFields = [],
	maxHydrationsPerProvider = DEFAULT_MAX_HYDRATIONS_PER_PROVIDER,
}: CatalogEnrichmentInput<TProvider, TMetadata>): Promise<
	CatalogEnrichmentResult<TProvider, TMetadata>
> {
	let metadata = initialMetadata;
	const acceptedEvidence = [initialEvidence];
	const contributingProviders: TProvider[] = [];
	const failures: CatalogEnrichmentFailure<TProvider>[] = [];
	let primaryProviderId: string | undefined;

	providerLoop: for (const provider of providers) {
		if (
			policy.shouldRun?.(provider.id, metadata, {
				hasMatch: contributingProviders.length > 0,
			}) === false
		) {
			continue;
		}
		let accepted = false;
		let hydrationCount = 0;
		const seenCandidates = new Set<string>();
		for (const query of policy.discoveryQueries(metadata)) {
			let candidates: readonly CatalogEnrichmentCandidate<TMetadata>[];
			try {
				candidates = await provider.discover(query, metadata);
			} catch (error) {
				failures.push(providerFailure(provider.id, "discovery", error));
				continue providerLoop;
			}
			const viable = candidates
				.filter(
					(candidate) =>
						!seenCandidates.has(candidate.providerId) &&
						assessGroupMembership(candidate.evidence, acceptedEvidence)
							.status !== "rejected",
				)
				.sort(
					(left, right) =>
						policy.rank(metadata, right, query) -
						policy.rank(metadata, left, query),
				);

			for (const candidate of viable) {
				if (seenCandidates.has(candidate.providerId)) continue;
				if (hydrationCount >= maxHydrationsPerProvider) {
					failures.push({
						provider: provider.id,
						phase: "hydration",
						kind: "permanent",
						code: "candidate_budget_exhausted",
					});
					continue providerLoop;
				}
				seenCandidates.add(candidate.providerId);
				hydrationCount++;
				let hydrated: HydratedCatalogCandidate<TMetadata> | null;
				try {
					hydrated = await provider.hydrate(candidate);
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

				const primary = contributingProviders.length === 0;
				metadata = policy.merge(
					metadata,
					withoutProtectedFields(hydrated.metadata, protectedFields),
					{
						provider: provider.id,
						providerId: candidate.providerId,
						primary,
					},
				);
				acceptedEvidence.push(hydrated.evidence);
				contributingProviders.push(provider.id);
				if (primary) primaryProviderId = candidate.providerId;
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
		failures,
		retryable: failures.some(({ kind }) => kind === "transient"),
	};
}
