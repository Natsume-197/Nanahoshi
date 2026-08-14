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
		metadata: TMetadata,
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
	/**
	 * How to name a hydrated candidate, recorded on the match so a reviewer can
	 * see what the pipeline picked without re-querying the provider.
	 */
	describe?(metadata: Partial<TMetadata>): string | undefined;
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
	manual?: boolean;
	/** The candidate as the provider described it, for human review. */
	title?: string;
	/** Identity reasons behind the primary match; only set on the first entry. */
	reasons?: string[];
};

export type CatalogEnrichmentDecision<TProvider extends string> = {
	kind: "ambiguous";
	candidates: CatalogEnrichmentMatch<TProvider>[];
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
			/** Identity reasons that confirmed the primary match. */
			primaryReasons: string[];
			/** Another candidate was equally confirmable — the pick was a guess. */
			primaryAmbiguous: boolean;
			/** Which provider supplied each field's final value (merge diff). */
			fieldSources: Record<string, TProvider>;
			failures: CatalogEnrichmentFailure<TProvider>[];
			retryable: boolean;
	  }
	| {
			status: "no_match";
			decision?: CatalogEnrichmentDecision<TProvider>;
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
	/**
	 * When set, only this provider may establish the catalog identity. Other
	 * providers are supplemental and run only after it confirms a match.
	 */
	requiredPrimaryProvider?: TProvider;
	/** Exact human-selected record that may establish the primary identity. */
	requiredPrimaryProviderId?: string;
	protectedFields?: readonly (keyof TMetadata)[];
	maxHydrationsPerProvider?: number;
};
