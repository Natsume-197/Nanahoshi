import { providerGate } from "../../infrastructure/providerGate";
import {
	type ProviderQuotaContext,
	providerQuotaScope,
} from "../../infrastructure/providerQuotaScope";
import { CatalogProviderError } from "./catalogEnrichment";
import type { CatalogProviderAdapter } from "./types";

/**
 * Applies the shared circuit breaker to every phase of an adapter.
 *
 * The gate belongs on the seam, not inside each adapter: a provider cooling
 * down after a rate limit must fail fast in discovery AND hydration, for books
 * and audiobooks alike. Wrapping keeps the adapters pure translation and makes
 * per-phase drift impossible.
 *
 * `quotaContext` is read per call because the Provider Quota Scope follows the
 * effective credentials and configuration (Amazon domain, Audible region),
 * which come from the record being enriched.
 */
export function withProviderGate<
	TProvider extends string,
	TMetadata extends object,
>(
	adapter: CatalogProviderAdapter<TProvider, TMetadata>,
	quotaContext: (metadata: TMetadata) => ProviderQuotaContext,
): CatalogProviderAdapter<TProvider, TMetadata> {
	const guard = async <T>(
		scope: string,
		call: () => Promise<T>,
	): Promise<T> => {
		const cooldownMs = await providerGate.cooldownRemainingMs(
			adapter.id,
			scope,
		);
		if (cooldownMs != null) {
			throw new CatalogProviderError("transient", "provider_cooldown", {
				retryAfterMs: cooldownMs,
			});
		}
		try {
			return await call();
		} catch (error) {
			if (!(error instanceof CatalogProviderError)) throw error;
			// Only a transient failure means the provider itself is in trouble.
			if (error.kind === "transient") {
				await providerGate.trip(adapter.id, error.retryAfterMs, scope);
			}
			throw error;
		}
	};

	return {
		id: adapter.id,
		async discover(query, metadata) {
			const scope = providerQuotaScope(adapter.id, quotaContext(metadata));
			return guard(scope, () => adapter.discover(query, metadata));
		},
		async hydrate(candidate, metadata) {
			const scope = providerQuotaScope(adapter.id, quotaContext(metadata));
			return guard(scope, () => adapter.hydrate(candidate, metadata));
		},
	};
}
