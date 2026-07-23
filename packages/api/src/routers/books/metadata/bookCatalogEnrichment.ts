import { providerGate } from "../../../infrastructure/providerGate";
import { logger } from "../../../lib/logger";
import {
	type CatalogEnrichmentPolicy,
	type CatalogProviderAdapter,
	CatalogProviderError,
	runCatalogEnrichment,
} from "../../../modules/catalogEnrichment";
import {
	type ProviderFieldPolicy,
	providerFieldRank,
} from "../../../modules/providerPolicy";
import type { BookMetadata } from "./book.metadata.model";
import { normalizeSeriesAliases } from "./metadata.utils";
import {
	bookMetadataIdentityEvidence,
	type IMetadataProvider,
} from "./providers/IMetadata.provider";
import {
	BOOK_PROVIDER_MANIFEST,
	type MetadataProviderName,
} from "./providers/provider.manifest";
import {
	deriveIsbnPair,
	ProviderTransientError,
} from "./providers/provider.utils";

const log = logger.child({ component: "book-catalog-enrichment" });

export type { MetadataProviderName } from "./providers/provider.manifest";

export type BookRoutingPolicy = ProviderFieldPolicy<MetadataProviderName>;

export type BookEnrichmentMetadata = Partial<BookMetadata> & {
	bookId: number;
	uuid: string;
	serverId?: string | null;
	amazonDomain?: string;
};

const REFRESH_FIELDS = [
	"titleRomaji",
	"description",
	"publishedDate",
	"pageCount",
	"authors",
	"publisher",
	"series",
	"genres",
	"tags",
	"rating",
	"ratingCount",
] as const satisfies readonly (keyof BookMetadata)[];

function isMissing(value: unknown): boolean {
	if (value === undefined || value === null || value === "") return true;
	return Array.isArray(value) && value.length === 0;
}

// Rank of the value currently occupying a field: -1 (unbeatable) for values
// that already existed before the run, Infinity for empty fields. Provider
// authors always outrank the EPUB-extracted ones — better identification.
function seedFieldRanks(
	metadata: Partial<BookMetadata>,
): Record<string, number> {
	const ranks: Record<string, number> = {};
	for (const [key, value] of Object.entries(metadata)) {
		if (key === "authors") continue;
		if (!isMissing(value)) ranks[key] = -1;
	}
	return ranks;
}

function providerHasGap(
	provider: MetadataProviderName,
	metadata: Partial<BookMetadata>,
	routing: BookRoutingPolicy,
): boolean {
	return BOOK_PROVIDER_MANIFEST[provider].fields.some(
		(field) =>
			providerFieldRank(routing, field, provider) !==
				Number.POSITIVE_INFINITY && isMissing(metadata[field]),
	);
}

export function needsBookCatalogEnrichment(
	metadata: Partial<BookMetadata>,
	routing: BookRoutingPolicy,
): boolean {
	return routing.order.some((provider) =>
		providerHasGap(provider, metadata, routing),
	);
}

function automaticProviderId(
	identity: ReturnType<typeof bookMetadataIdentityEvidence>,
) {
	return (
		identity.asin ??
		identity.isbn13 ??
		identity.isbn10 ??
		identity.embeddedUid ??
		"automatic"
	);
}

function bookAdapter(
	name: MetadataProviderName,
	provider: IMetadataProvider,
): CatalogProviderAdapter<MetadataProviderName, BookEnrichmentMetadata> {
	// The legacy book provider port returns one already-hydrated automatic
	// candidate. The adapter exposes that candidate to the shared orchestration;
	// providers can split discovery/hydration later without changing this seam.
	return {
		id: name,
		async discover(_query, metadata) {
			// Shared breaker: while a provider cools down after a rate limit, every
			// job fails fast for it instead of burning more requests.
			const cooldownMs = await providerGate.cooldownRemainingMs(name);
			if (cooldownMs != null) {
				throw new CatalogProviderError("transient", "provider_cooldown", {
					retryAfterMs: cooldownMs,
				});
			}
			let response: Awaited<ReturnType<IMetadataProvider["getMetadata"]>>;
			try {
				response = await provider.getMetadata(metadata);
			} catch (error) {
				if (error instanceof ProviderTransientError) {
					await providerGate.trip(name);
					throw new CatalogProviderError("transient", "provider_unavailable", {
						cause: error,
					});
				}
				throw error;
			}
			if (!response?.metadata || Object.keys(response.metadata).length === 0) {
				return [];
			}
			if (!response.identity) {
				log.debug(
					{ provider: name, verdict: "indeterminate" },
					"Provider result is missing catalog identity evidence",
				);
				return [];
			}
			return [
				{
					providerId: automaticProviderId(response.identity),
					metadata: response.metadata,
					evidence: response.identity,
				},
			];
		},
		hydrate: async (candidate) => ({
			metadata: candidate.metadata,
			evidence: candidate.evidence,
		}),
	};
}

// Per-run policy: fields accept a provider's value when the provider outranks
// whatever currently occupies the field (empty = Infinity, pre-run DB value =
// -1). Field rules therefore both restrict who may serve a field and let a
// later provider in the chain override an earlier, lower-priority value.
function bookPolicy(
	refresh: boolean,
	routing: BookRoutingPolicy,
	initialMetadata: BookEnrichmentMetadata,
): CatalogEnrichmentPolicy<BookEnrichmentMetadata, MetadataProviderName> {
	const currentRank = seedFieldRanks(initialMetadata);

	const accepts = (
		provider: MetadataProviderName,
		field: string,
		incomingValue: unknown,
	): boolean => {
		if (isMissing(incomingValue)) return false;
		const rank = providerFieldRank(routing, field, provider);
		if (rank === Number.POSITIVE_INFINITY) return false;
		return rank < (currentRank[field] ?? Number.POSITIVE_INFINITY);
	};

	const merge = (
		current: BookEnrichmentMetadata,
		incoming: Partial<BookEnrichmentMetadata>,
		provider: MetadataProviderName,
	): BookEnrichmentMetadata => {
		const merged = { ...current };
		for (const key of Object.keys(incoming) as (keyof BookMetadata)[]) {
			if (key === "series") {
				if (!incoming.series) continue;
				if (accepts(provider, key, incoming.series)) {
					// Replacement keeps every alias seen so far — aliases are
					// cumulative knowledge, not one provider's opinion. undefined
					// aliases stay undefined ("don't touch"), unlike an explicit [].
					const inherited = [
						...(merged.series?.aliases ?? []),
						merged.series?.name ?? "",
					].filter(Boolean);
					const hasAliasInfo =
						incoming.series.aliases !== undefined || inherited.length > 0;
					merged.series = hasAliasInfo
						? {
								...incoming.series,
								aliases: normalizeSeriesAliases(
									[...inherited, ...(incoming.series.aliases ?? [])],
									incoming.series.name,
								),
							}
						: { ...incoming.series };
					currentRank[key] = providerFieldRank(routing, key, provider);
				} else if (merged.series && incoming.series.aliases?.length) {
					merged.series = {
						...merged.series,
						aliases: normalizeSeriesAliases(
							[
								...(merged.series.aliases ?? []),
								incoming.series.name,
								...incoming.series.aliases,
							],
							merged.series.name,
						),
					};
				}
				continue;
			}
			if (accepts(provider, key, incoming[key])) {
				(merged as Record<string, unknown>)[key] = incoming[key];
				currentRank[key] = providerFieldRank(routing, key, provider);
			}
		}
		return deriveIsbnPair(merged);
	};

	return {
		discoveryQueries: (metadata) => [bookMetadataIdentityEvidence(metadata)],
		rank: () => 1,
		shouldRun: (provider) =>
			refresh ||
			BOOK_PROVIDER_MANIFEST[provider].fields.some(
				(field) =>
					providerFieldRank(routing, field, provider) <
					(currentRank[field] ?? Number.POSITIVE_INFINITY),
			),
		merge: (metadata, incoming, { provider }) =>
			merge(metadata, incoming, provider),
	};
}

export async function runBookCatalogEnrichment({
	metadata,
	providers,
	protectedFields = [],
	refresh = false,
	routing,
}: {
	metadata: BookEnrichmentMetadata;
	providers: readonly {
		name: MetadataProviderName;
		provider: IMetadataProvider;
	}[];
	protectedFields?: readonly (keyof BookMetadata)[];
	refresh?: boolean;
	routing?: BookRoutingPolicy;
}) {
	const effectiveRouting: BookRoutingPolicy = routing ?? {
		order: providers.map(({ name }) => name),
	};
	const initialMetadata: BookEnrichmentMetadata = deriveIsbnPair({
		...metadata,
	});
	const initialEvidence = bookMetadataIdentityEvidence(initialMetadata);
	if (refresh) {
		const protectedSet = new Set<keyof BookMetadata>(protectedFields);
		for (const field of REFRESH_FIELDS) {
			if (!protectedSet.has(field)) delete initialMetadata[field];
		}
	}
	const result = await runCatalogEnrichment({
		initialMetadata,
		initialEvidence,
		providers: providers.map(({ name, provider }) =>
			bookAdapter(name, provider),
		),
		policy: bookPolicy(refresh, effectiveRouting, initialMetadata),
		protectedFields,
	});
	if (result.status !== "matched") return result;
	return {
		...result,
		authorsProvider: (result.fieldSources.authors ??
			null) as MetadataProviderName | null,
	};
}
