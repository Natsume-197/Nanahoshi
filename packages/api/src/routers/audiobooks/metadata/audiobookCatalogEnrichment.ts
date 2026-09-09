import type { UnresolvedEnrichmentDecision } from "@nanahoshi-v2/db/schema/general";
import {
	audiobookFilenameTitle,
	cleanAudiobookTitle,
	rankAudiobookCandidate,
} from "../../../modules/audiobookMatch";
import { inferSeriesFromTitle } from "../../../modules/audiobookSeriesInference";
import {
	type CatalogEnrichmentPolicy,
	type CatalogEnrichmentResult,
	type CatalogProviderAdapter,
	CatalogProviderError,
	runCatalogEnrichment,
	withProviderGate,
} from "../../../modules/catalogEnrichment";
import {
	assessCatalogIdentity,
	type CatalogIdentityEvidence,
} from "../../../modules/catalogIdentity";
import { asinFromFilename } from "../../../modules/identifiers";
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
	metadata: Partial<AudiobookMetadata> & { filename?: string | null },
): CatalogIdentityEvidence {
	return {
		kind: "audiobook",
		filename: metadata.filename,
		title: metadata.title,
		authors: metadata.authors?.map(({ name }) => ({ name })),
		asin: metadata.asin,
		languageCode: metadata.languageCode,
		duration: metadata.duration,
	};
}

export function discoveryQueries(
	metadata: AudiobookEnrichmentMetadata,
): CatalogIdentityEvidence[] {
	const evidence = identityEvidence(metadata);
	const queries: CatalogIdentityEvidence[] = [];
	const seen = new Set<string>();
	const add = (
		title: string | null | undefined,
		authors = evidence.authors,
	) => {
		if (!title?.trim()) return;
		const key = JSON.stringify([title.trim(), authors ?? []]);
		if (seen.has(key)) return;
		seen.add(key);
		queries.push({ ...evidence, title: title.trim(), authors, asin: null });
	};
	if (isValidAsin(metadata.asin)) queries.push(evidence);
	const filename = audiobookFilenameTitle(metadata.filename);
	const title = metadata.title?.trim() || filename;
	add(title);
	add(title ? cleanAudiobookTitle(title) : null);
	// Authors can contain publisher/role noise: omit them for discovery only.
	add(title, null);
	add(title ? cleanAudiobookTitle(title) : null, null);
	if (filename && filename !== title) add(filename, null);
	const inferred =
		inferSeriesFromTitle(title) ?? inferSeriesFromTitle(filename);
	const rawSeriesName = inferred?.seriesName ?? metadata.series?.name;
	const seriesName = rawSeriesName ? cleanAudiobookTitle(rawSeriesName) : null;
	if (seriesName) {
		// Search the numbered series first so long series do not hide later volumes.
		add(
			inferred?.position != null
				? `${seriesName} ${inferred.position}`
				: seriesName,
			null,
		);
		add(seriesName, null);
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
		if (key === "series" && routing.primary && provider !== routing.primary)
			continue;
		// Identity was confirmed before merging. A fallback may have corrected
		// an embedded ASIN that actually pointed to another volume.
		if (key === "asin" && primary && !isMissing(value)) {
			merged.asin = incoming.asin;
			continue;
		}
		if (key === "series" && primary && !isMissing(value)) {
			merged.series = incoming.series;
			continue;
		}
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
	context: {
		region: string;
		bookUuid?: string;
		diagnostics: UnresolvedEnrichmentDecision;
		candidates: Set<string>;
	},
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
				context.candidates.add(`${provider.id}:${asin}`);
				return [
					{
						providerId: asin,
						metadata: { asin },
						evidence: { ...identityEvidence(metadata), asin },
					},
				];
			}
			if (!query.title) return [];
			try {
				context.diagnostics.searches = (context.diagnostics.searches ?? 0) + 1;
				const candidates = await provider.search(
					{ title: query.title, authors: queryAuthors(query) },
					{ region: context.region },
				);
				return candidates.map((candidate) => {
					context.candidates.add(`${provider.id}:${candidate.providerId}`);
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
		async hydrate(candidate, local) {
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
				if (!combined.title?.trim()) {
					context.diagnostics.reasons.push("remote.title_missing");
					return null;
				}
				const remoteSeries = metadata.series;
				if (
					remoteSeries?.position != null &&
					combined.title.normalize("NFKC").trim() ===
						remoteSeries.name.normalize("NFKC").trim()
				) {
					// A bare series title is insufficient to conceal a conflicting volume.
					// Apply this only when the provider itself omitted the book title;
					// never compare a named arc with an umbrella's global sequence.
					const verdict = assessCatalogIdentity(identityEvidence(local), {
						...identityEvidence(combined),
						title: `[${remoteSeries.position}巻] ${remoteSeries.name}`,
					});
					if (verdict.status === "rejected") {
						context.diagnostics.reasons.push(...verdict.reasons);
						return null;
					}
				}
				return { metadata: combined, evidence: identityEvidence(combined) };
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
	downloadCovers = true,
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
	downloadCovers?: boolean;
}): Promise<
	CatalogEnrichmentResult<AudiobookProviderName, AudiobookEnrichmentMetadata>
> {
	if (!isValidAsin(metadata.asin) && !protectedFields.includes("asin")) {
		const asin = asinFromFilename(metadata.filename);
		if (asin) metadata = { ...metadata, asin };
	}
	const filenameTitle = audiobookFilenameTitle(metadata.filename);
	if (!metadata.title?.trim() && filenameTitle)
		metadata = { ...metadata, title: filenameTitle };
	const diagnostics: UnresolvedEnrichmentDecision = {
		kind: "unresolved",
		reason: "no_candidates",
		searches: 0,
		candidates: 0,
		reasons: [],
	};
	const candidates = new Set<string>();
	if (requiredPrimaryMatch)
		candidates.add(
			`${requiredPrimaryMatch.provider}:${requiredPrimaryMatch.providerId}`,
		);
	const effectiveRouting: AudiobookRoutingPolicy = {
		...(routing ?? { order: providers.map(({ id }) => id) }),
		...(requiredPrimaryMatch ? { primary: requiredPrimaryMatch.provider } : {}),
	};
	const ordered =
		!effectiveRouting.primary && isValidAsin(metadata.asin)
			? [
					...providers.filter(({ id }) => id === "audible"),
					...providers.filter(({ id }) => id !== "audible"),
				]
			: providers;
	const result = await runCatalogEnrichment({
		initialMetadata: metadata,
		initialEvidence: identityEvidence(metadata),
		providers: ordered.map((provider) =>
			audiobookAdapter(provider, {
				region,
				diagnostics,
				candidates,
				bookUuid:
					downloadCovers && isMissing(metadata.cover)
						? metadata.uuid
						: undefined,
			}),
		),
		policy: audiobookPolicy(effectiveRouting),
		requiredPrimaryProvider:
			requiredPrimaryMatch?.provider ?? effectiveRouting.primary,
		requiredPrimaryProviderId: requiredPrimaryMatch?.providerId,
		protectedFields,
		onAssessment: (verdict) => {
			if (verdict.status !== "confirmed")
				diagnostics.reasons.push(...verdict.reasons);
		},
	});
	diagnostics.candidates = candidates.size;
	diagnostics.reasons = [...new Set(diagnostics.reasons)].slice(0, 20);
	diagnostics.reason = !metadata.title?.trim()
		? "missing_title"
		: result.failures.some((f) => f.kind === "transient")
			? "provider_unavailable"
			: result.failures.some((f) => f.code === "candidate_budget_exhausted")
				? "candidate_budget_exhausted"
				: diagnostics.reasons.some(
							(r) => r.includes("conflict") || r === "group.member_rejected",
						)
					? "identity_conflict"
					: candidates.size
						? "insufficient_evidence"
						: "no_candidates";
	if (result.status === "no_match" && !result.decision)
		return { ...result, decision: diagnostics };
	return result;
}
