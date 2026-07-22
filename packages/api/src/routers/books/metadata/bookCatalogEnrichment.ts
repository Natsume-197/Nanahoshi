import { logger } from "../../../lib/logger";
import {
	type CatalogEnrichmentPolicy,
	type CatalogProviderAdapter,
	CatalogProviderError,
	runCatalogEnrichment,
} from "../../../modules/catalogEnrichment";
import type { BookMetadata } from "./book.metadata.model";
import { normalizeSeriesAliases } from "./metadata.utils";
import {
	type BookSearchCandidate,
	bookMetadataIdentityEvidence,
	type IMetadataProvider,
} from "./providers/IMetadata.provider";
import {
	deriveIsbnPair,
	ProviderTransientError,
} from "./providers/provider.utils";

const log = logger.child({ component: "book-catalog-enrichment" });
const AUTHORS_PROVIDER = "__catalogAuthorsProvider" as const;

export type MetadataProviderName = BookSearchCandidate["provider"];

export type BookEnrichmentMetadata = Partial<BookMetadata> & {
	bookId: number;
	uuid: string;
	serverId?: string | null;
	amazonDomain?: string;
};

type BookPipelineMetadata = BookEnrichmentMetadata & {
	[AUTHORS_PROVIDER]?: MetadataProviderName;
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
	"amazonRating",
	"amazonReviewCount",
] as const satisfies readonly (keyof BookMetadata)[];

const PROVIDER_FIELDS: Record<
	MetadataProviderName,
	readonly (keyof BookMetadata)[]
> = {
	ranobedb: [
		"titleRomaji",
		"description",
		"publishedDate",
		"pageCount",
		"isbn13",
		"asin",
		"authors",
		"publisher",
		"series",
		"genres",
		"tags",
	],
	amazon: [
		"description",
		"publishedDate",
		"pageCount",
		"asin",
		"cover",
		"authors",
		"publisher",
		"series",
		"genres",
		"amazonRating",
		"amazonReviewCount",
	],
	googlebooks: [
		"subtitle",
		"description",
		"publishedDate",
		"languageCode",
		"pageCount",
		"isbn10",
		"isbn13",
		"cover",
		"authors",
		"publisher",
		"series",
		"genres",
	],
	openlibrary: [
		"description",
		"publishedDate",
		"languageCode",
		"pageCount",
		"isbn10",
		"isbn13",
		"cover",
		"authors",
		"publisher",
		"genres",
	],
	goodreads: [
		"description",
		"publishedDate",
		"languageCode",
		"pageCount",
		"isbn10",
		"isbn13",
		"cover",
		"authors",
		"publisher",
		"series",
		"genres",
	],
	comicvine: [
		"description",
		"publishedDate",
		"cover",
		"authors",
		"publisher",
		"series",
	],
	hardcover: [
		"subtitle",
		"description",
		"publishedDate",
		"languageCode",
		"pageCount",
		"isbn10",
		"isbn13",
		"cover",
		"authors",
		"publisher",
		"series",
		"genres",
		"tags",
	],
};

function isMissing(value: unknown): boolean {
	if (value === undefined || value === null || value === "") return true;
	return Array.isArray(value) && value.length === 0;
}

function providerHasGap(
	provider: MetadataProviderName,
	metadata: Partial<BookMetadata>,
): boolean {
	return PROVIDER_FIELDS[provider].some((field) => isMissing(metadata[field]));
}

export function needsBookCatalogEnrichment(
	metadata: Partial<BookMetadata>,
	providers: readonly MetadataProviderName[],
): boolean {
	return providers.some((provider) => providerHasGap(provider, metadata));
}

function mergeBookMetadata(
	current: BookPipelineMetadata,
	incoming: Partial<BookPipelineMetadata>,
	provider: MetadataProviderName,
): BookPipelineMetadata {
	const merged = { ...current };
	for (const key of Object.keys(incoming) as (keyof BookMetadata)[]) {
		if (key === "authors") {
			if (!incoming.authors?.length || merged[AUTHORS_PROVIDER]) continue;
			merged.authors = incoming.authors;
			merged[AUTHORS_PROVIDER] = provider;
			continue;
		}
		if (key === "series" && merged.series && incoming.series?.aliases) {
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
			continue;
		}
		if (isMissing(merged[key]) && !isMissing(incoming[key])) {
			(merged as Record<string, unknown>)[key] = incoming[key];
		}
	}
	return deriveIsbnPair(merged);
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
): CatalogProviderAdapter<MetadataProviderName, BookPipelineMetadata> {
	// The legacy book provider port returns one already-hydrated automatic
	// candidate. The adapter exposes that candidate to the shared orchestration;
	// providers can split discovery/hydration later without changing this seam.
	return {
		id: name,
		async discover(_query, state) {
			const { [AUTHORS_PROVIDER]: _authorsProvider, ...metadata } = state;
			let response: Awaited<ReturnType<IMetadataProvider["getMetadata"]>>;
			try {
				response = await provider.getMetadata(metadata);
			} catch (error) {
				if (error instanceof ProviderTransientError) {
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

function bookPolicy(
	refresh: boolean,
): CatalogEnrichmentPolicy<BookPipelineMetadata, MetadataProviderName> {
	return {
		discoveryQueries: (metadata) => [bookMetadataIdentityEvidence(metadata)],
		rank: () => 1,
		shouldRun: (provider, metadata) =>
			refresh || providerHasGap(provider, metadata),
		merge: (metadata, incoming, { provider }) =>
			mergeBookMetadata(metadata, incoming, provider),
	};
}

export async function runBookCatalogEnrichment({
	metadata,
	providers,
	protectedFields = [],
	refresh = false,
}: {
	metadata: BookEnrichmentMetadata;
	providers: readonly {
		name: MetadataProviderName;
		provider: IMetadataProvider;
	}[];
	protectedFields?: readonly (keyof BookMetadata)[];
	refresh?: boolean;
}) {
	const initialEvidence = bookMetadataIdentityEvidence(metadata);
	const initialMetadata: BookPipelineMetadata = deriveIsbnPair({ ...metadata });
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
		policy: bookPolicy(refresh),
		protectedFields,
	});
	if (result.status !== "matched") return result;
	const { [AUTHORS_PROVIDER]: authorsProvider, ...enrichedMetadata } =
		result.metadata;
	return {
		...result,
		metadata: enrichedMetadata,
		authorsProvider: authorsProvider ?? null,
	};
}
