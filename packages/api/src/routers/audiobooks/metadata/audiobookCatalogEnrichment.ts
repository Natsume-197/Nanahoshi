import {
	cleanAudiobookTitle,
	rankAudiobookCandidate,
} from "../../../modules/audiobookMatch";
import {
	type CatalogEnrichmentPolicy,
	type CatalogEnrichmentResult,
	type CatalogProviderAdapter,
	CatalogProviderError,
	runCatalogEnrichment,
	withProviderGate,
} from "../../../modules/catalogEnrichment";
import type { CatalogIdentityEvidence } from "../../../modules/catalogIdentity";
import {
	type ProviderFieldPolicy,
	providerAllowedForField,
} from "../../../modules/providerPolicy";
import type { AudiobookMetadata } from "./audiobook-metadata.model";
import {
	type AudiobookProviderName,
	type IAudiobookMetadataProvider,
	isValidAsin,
} from "./providers/IMetadata.provider";
import { AUDIOBOOK_PROVIDER_MANIFEST } from "./providers/provider.manifest";

export type AudiobookEnrichmentMetadata = Partial<AudiobookMetadata> & {
	bookId: number;
	uuid: string;
	filename?: string | null;
};

export type AudiobookRoutingPolicy = ProviderFieldPolicy<AudiobookProviderName>;

function isMissing(value: unknown): boolean {
	if (value === undefined || value === null || value === "") return true;
	return Array.isArray(value) && value.length === 0;
}

function identityEvidence(
	metadata: Partial<AudiobookMetadata>,
): CatalogIdentityEvidence {
	return {
		kind: "audiobook",
		title: metadata.title,
		authors: metadata.authors?.map(({ name }) => ({ name })),
		asin: metadata.asin,
		languageCode: metadata.languageCode,
		duration: metadata.duration,
	};
}

function discoveryQueries(
	metadata: AudiobookEnrichmentMetadata,
): CatalogIdentityEvidence[] {
	const queries: CatalogIdentityEvidence[] = [];
	if (isValidAsin(metadata.asin)) {
		queries.push({ ...identityEvidence(metadata), asin: metadata.asin });
	}
	if (!metadata.title) return queries;
	queries.push({ ...identityEvidence(metadata), asin: null });
	const cleaned = cleanAudiobookTitle(metadata.title);
	if (cleaned && cleaned !== metadata.title) {
		queries.push({ ...identityEvidence(metadata), title: cleaned, asin: null });
	}
	return queries;
}

function mergeAudiobookMetadata(
	current: AudiobookEnrichmentMetadata,
	incoming: Partial<AudiobookEnrichmentMetadata>,
	provider: AudiobookProviderName,
	primary: boolean,
	routing: AudiobookRoutingPolicy,
): AudiobookEnrichmentMetadata {
	const merged = { ...current };
	for (const key of Object.keys(
		incoming,
	) as (keyof AudiobookEnrichmentMetadata)[]) {
		const value = incoming[key];
		if (!providerAllowedForField(routing, key, provider)) continue;
		if (key === "authors" || key === "narrators") {
			if (!Array.isArray(value) || value.length === 0) continue;
			if (primary || isMissing(merged[key])) {
				(merged as Record<string, unknown>)[key] = value;
			}
			continue;
		}
		if (isMissing(merged[key]) && !isMissing(value)) {
			(merged as Record<string, unknown>)[key] = value;
		}
	}
	return merged;
}

function audiobookPolicy(
	routing: AudiobookRoutingPolicy,
): CatalogEnrichmentPolicy<AudiobookEnrichmentMetadata, AudiobookProviderName> {
	return {
		discoveryQueries,
		describe: (metadata) => metadata.title ?? undefined,
		rank: (metadata, candidate, query) =>
			rankAudiobookCandidate(
				query.title ?? metadata.title ?? "",
				candidate.metadata,
				{
					authors: metadata.authors,
					duration: metadata.duration,
				},
			),
		shouldRun: (provider, metadata, { hasMatch }) =>
			!hasMatch ||
			AUDIOBOOK_PROVIDER_MANIFEST[provider].fields.some(
				(field) =>
					providerAllowedForField(routing, field, provider) &&
					isMissing(metadata[field]),
			),
		merge: (metadata, incoming, { provider, primary }) =>
			mergeAudiobookMetadata(metadata, incoming, provider, primary, routing),
	};
}

function queryAuthors(evidence: CatalogIdentityEvidence) {
	return evidence.authors?.map((author) => ({
		name: typeof author === "string" ? author : author.name,
	}));
}

function audiobookAdapter(
	provider: IAudiobookMetadataProvider,
	context: { region: string; bookUuid?: string },
): CatalogProviderAdapter<AudiobookProviderName, AudiobookEnrichmentMetadata> {
	// Any failure that isn't already typed is treated as the provider being
	// unavailable, so the gate opens its breaker.
	const asTransient = (error: unknown): never => {
		if (error instanceof CatalogProviderError) throw error;
		throw new CatalogProviderError("transient", "provider_unavailable", {
			cause: error,
		});
	};

	const adapter: CatalogProviderAdapter<
		AudiobookProviderName,
		AudiobookEnrichmentMetadata
	> = {
		id: provider.id,
		async discover(query, metadata) {
			// A valid ASIN resolves straight through Audible, no search needed.
			if (isValidAsin(query.asin)) {
				if (provider.id !== "audible") return [];
				const asin = query.asin.trim().toUpperCase();
				return [
					{
						providerId: asin,
						metadata: { title: metadata.title, asin },
						evidence: { ...identityEvidence(metadata), asin },
					},
				];
			}
			if (!query.title) return [];
			try {
				const candidates = await provider.search(
					{ title: query.title, authors: queryAuthors(query) },
					{ region: context.region },
				);
				return candidates.map((candidate) => {
					const {
						provider: _provider,
						providerId,
						previewCover: _previewCover,
						url: _url,
						...metadata
					} = candidate;
					return {
						providerId,
						metadata,
						evidence: identityEvidence(metadata),
					};
				});
			} catch (error) {
				return asTransient(error);
			}
		},
		async hydrate(candidate) {
			try {
				const metadata = await provider.getById(candidate.providerId, {
					region: context.region,
					bookUuid: context.bookUuid,
				});
				if (!metadata) return null;
				const combined = {
					...candidate.metadata,
					...metadata,
					title: metadata.title ?? candidate.metadata.title,
					duration: metadata.duration ?? candidate.metadata.duration,
				};
				return { metadata, evidence: identityEvidence(combined) };
			} catch (error) {
				return asTransient(error);
			}
		},
	};

	return withProviderGate(adapter, () => ({ region: context.region }));
}

export async function runAudiobookCatalogEnrichment({
	metadata,
	providers,
	region,
	protectedFields = [],
	routing,
	requiredPrimaryMatch,
}: {
	metadata: AudiobookEnrichmentMetadata;
	providers: readonly IAudiobookMetadataProvider[];
	region: string;
	protectedFields?: readonly (keyof AudiobookEnrichmentMetadata)[];
	routing?: AudiobookRoutingPolicy;
	requiredPrimaryMatch?: {
		provider: AudiobookProviderName;
		providerId: string;
	};
}): Promise<
	CatalogEnrichmentResult<AudiobookProviderName, AudiobookEnrichmentMetadata>
> {
	const effectiveRouting: AudiobookRoutingPolicy = routing ?? {
		order: providers.map(({ id }) => id),
	};
	const ordered = isValidAsin(metadata.asin)
		? [
				...providers.filter(({ id }) => id === "audible"),
				...providers.filter(({ id }) => id !== "audible"),
			]
		: providers;
	return runCatalogEnrichment({
		initialMetadata: metadata,
		initialEvidence: identityEvidence(metadata),
		providers: ordered.map((provider) =>
			audiobookAdapter(provider, {
				region,
				bookUuid: isMissing(metadata.cover) ? metadata.uuid : undefined,
			}),
		),
		policy: audiobookPolicy(effectiveRouting),
		requiredPrimaryProvider: requiredPrimaryMatch?.provider,
		requiredPrimaryProviderId: requiredPrimaryMatch?.providerId,
		protectedFields,
	});
}
