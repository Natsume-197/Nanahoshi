import type { CatalogIdentityEvidence } from "../catalogIdentity";

export type CatalogEnrichmentCandidate<TMetadata extends object> = {
	providerId: string;
	metadata: Partial<TMetadata>;
	evidence: CatalogIdentityEvidence;
};

export type HydratedCatalogCandidate<TMetadata extends object> = {
	metadata: Partial<TMetadata>;
	evidence: CatalogIdentityEvidence;
};

export type CatalogProviderAdapter<
	TProvider extends string,
	TMetadata extends object,
> = {
	id: TProvider;
	discover(
		query: CatalogIdentityEvidence,
		metadata: TMetadata,
	): Promise<readonly CatalogEnrichmentCandidate<TMetadata>[]>;
	hydrate(
		candidate: CatalogEnrichmentCandidate<TMetadata>,
	): Promise<HydratedCatalogCandidate<TMetadata> | null>;
};

export type CatalogEnrichmentPolicy<
	TMetadata extends object,
	TProvider extends string = string,
> = {
	discoveryQueries(metadata: TMetadata): readonly CatalogIdentityEvidence[];
	rank(
		metadata: TMetadata,
		candidate: CatalogEnrichmentCandidate<TMetadata>,
		query: CatalogIdentityEvidence,
	): number;
	shouldRun?(
		provider: TProvider,
		metadata: TMetadata,
		context: { hasMatch: boolean },
	): boolean;
	merge(
		metadata: TMetadata,
		incoming: Partial<TMetadata>,
		context: {
			provider: TProvider;
			providerId: string;
			primary: boolean;
		},
	): TMetadata;
};

export type CatalogEnrichmentFailure<TProvider extends string> = {
	provider: TProvider;
	phase: "discovery" | "hydration";
	kind: "transient" | "permanent";
	code: string;
	/** Provider cooldown hint — when a retry is expected to succeed. */
	retryAfterMs?: number;
};

export type CatalogEnrichmentMatch<TProvider extends string> = {
	provider: TProvider;
	providerId: string;
};

export type CatalogEnrichmentResult<
	TProvider extends string,
	TMetadata extends object,
> =
	| {
			status: "matched";
			metadata: TMetadata;
			primaryProvider: TProvider;
			primaryProviderId: string;
			contributingProviders: TProvider[];
			/** One entry per accepted candidate, in chain order. */
			matches: CatalogEnrichmentMatch<TProvider>[];
			/** Identity reasons that confirmed the primary match (weak-match detection). */
			primaryReasons: string[];
			/** Which provider supplied each field's final value (merge diff). */
			fieldSources: Record<string, TProvider>;
			failures: CatalogEnrichmentFailure<TProvider>[];
			retryable: boolean;
	  }
	| {
			status: "no_match";
			failures: CatalogEnrichmentFailure<TProvider>[];
	  }
	| {
			status: "retryable_failure";
			failures: CatalogEnrichmentFailure<TProvider>[];
	  };

export type CatalogEnrichmentInput<
	TProvider extends string,
	TMetadata extends object,
> = {
	initialMetadata: TMetadata;
	initialEvidence: CatalogIdentityEvidence;
	providers: readonly CatalogProviderAdapter<TProvider, TMetadata>[];
	policy: CatalogEnrichmentPolicy<TMetadata, TProvider>;
	protectedFields?: readonly (keyof TMetadata)[];
	maxHydrationsPerProvider?: number;
};
