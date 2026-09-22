import { withProviderSignal } from "../../infrastructure/providerAbort";
import { providerGate } from "../../infrastructure/providerGate";
import {
	type ProviderQuotaContext,
	providerQuotaScope,
} from "../../infrastructure/providerQuotaScope";
import { CatalogProviderError } from "./catalogEnrichment";
import type { CatalogProviderAdapter } from "./types";

const DEFAULT_PROVIDER_PHASE_TIMEOUT_MS = 20_000;

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
	quotaContext: (
		metadata: TMetadata,
	) => ProviderQuotaContext | Promise<ProviderQuotaContext>,
	timeoutMs = DEFAULT_PROVIDER_PHASE_TIMEOUT_MS,
): CatalogProviderAdapter<TProvider, TMetadata> {
	const lookup = adapter.lookup;
	const withDeadline = <T>(
		call: (signal: AbortSignal) => Promise<T>,
	): Promise<T> => {
		const controller = new AbortController();
		let timer: ReturnType<typeof setTimeout> | undefined;
		const timeout = new Promise<never>((_resolve, reject) => {
			timer = setTimeout(() => {
				const error = new CatalogProviderError(
					"transient",
					"provider_timeout",
					{ retryAfterMs: 30_000 },
				);
				controller.abort(error);
				reject(error);
			}, timeoutMs);
		});
		return Promise.race([
			withProviderSignal(controller.signal, () => call(controller.signal)),
			timeout,
		]).finally(() => {
			if (timer) clearTimeout(timer);
		});
	};
	const guard = async <T>(
		context: ProviderQuotaContext,
		call: (signal: AbortSignal) => Promise<T>,
	): Promise<T> => {
		const scope = providerQuotaScope(adapter.id, context);
		const guardedCall = async () => {
			// Re-check after waiting for an exclusive lease: the preceding owner
			// may have opened the breaker while this operation was queued.
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
				return await withDeadline(call);
			} catch (error) {
				if (!(error instanceof CatalogProviderError)) throw error;
				// Retryable is not synonymous with provider-wide throttling. Network
				// and isolated 5xx failures stay retryable without blocking queued work.
				if (error.kind === "transient" && error.opensCircuitBreaker) {
					await providerGate.trip(adapter.id, error.retryAfterMs, scope);
				}
				throw error;
			}
		};

		// Amazon rate-limits the host/IP, not an individual BullMQ job. Its
		// operation lease is domain-scoped so API fix-match and background
		// enrichment cannot overlap even when they run in separate processes.
		if (adapter.id === "amazon") {
			return providerGate.runExclusive(
				adapter.id,
				`domain:${context.amazonDomain ?? "default"}`,
				guardedCall,
			);
		}
		return guardedCall();
	};

	return {
		id: adapter.id,
		async discover(query, metadata) {
			return guard(await quotaContext(metadata), (signal) =>
				adapter.discover(query, metadata, signal),
			);
		},
		async hydrate(candidate, metadata) {
			return guard(await quotaContext(metadata), (signal) =>
				adapter.hydrate(candidate, metadata, signal),
			);
		},
		...(lookup && {
			async lookup(providerId: string, metadata: TMetadata) {
				return guard(await quotaContext(metadata), (signal) =>
					lookup(providerId, metadata, signal),
				);
			},
		}),
	};
}
