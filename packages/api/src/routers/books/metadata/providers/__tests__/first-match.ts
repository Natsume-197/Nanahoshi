import type { BookMetadata } from "../../book.metadata.model";
import {
	emptyMetadataProviderResult,
	type IMetadataProvider,
	type MetadataProviderResult,
} from "../IMetadata.provider";
import { ProviderTransientError } from "../provider.utils";

/**
 * Discovers and hydrates a provider's top candidate — what the enrichment
 * pipeline does when the identity gate confirms the first pick.
 *
 * Note what this deliberately does NOT do: apply the identity gate. Providers
 * no longer veto their own candidates, so a test asserting that an unrelated
 * result gets rejected belongs at the pipeline level
 * (bookCatalogEnrichment.test.ts), not here.
 */
export async function firstMatch(
	provider: IMetadataProvider,
	input: Partial<BookMetadata> & {
		bookId?: number;
		uuid?: string;
		serverId?: string | null;
		amazonDomain?: string;
	},
): Promise<MetadataProviderResult> {
	// Walks candidates the way the pipeline does: a null hydration (series
	// landing page, dead id) is "try the next one", not "no match". Non-transient
	// failures are swallowed here for the same reason the adapter swallows them —
	// one broken provider must not sink the run.
	try {
		for (const candidate of await provider.discoverCandidates(input)) {
			const hydrated = await provider.hydrateCandidate(candidate, input);
			if (hydrated) return hydrated;
		}
	} catch (error) {
		if (error instanceof ProviderTransientError) throw error;
	}
	return emptyMetadataProviderResult();
}
