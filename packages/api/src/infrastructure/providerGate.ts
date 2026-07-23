// Shared circuit breaker per metadata provider. State lives in Redis so the
// API process (fix-match search) and every worker job see the same cooldown:
// one 429 opens the breaker for everyone, and further calls fail fast without
// touching the provider until it expires. Request pacing (min interval)
// remains inside each provider — this gate only handles cooldowns.

export const DEFAULT_PROVIDER_COOLDOWN_MS = 5 * 60_000;
const DEFAULT_COOLDOWN_MS = DEFAULT_PROVIDER_COOLDOWN_MS;

const keyOf = (provider: string) => `provider-gate:${provider}`;

// bun test has no Redis: per-process memory keeps the same semantics.
const memoryUntil = new Map<string, number>();
const isTest = process.env.NODE_ENV === "test";

async function redisClient() {
	const { redis } = await import("./queue/redis");
	return redis;
}

export class ProviderGate {
	/** ms until the provider may be called again, or null when closed. */
	async cooldownRemainingMs(provider: string): Promise<number | null> {
		if (isTest) {
			const until = memoryUntil.get(provider);
			if (!until) return null;
			const remaining = until - Date.now();
			if (remaining <= 0) {
				memoryUntil.delete(provider);
				return null;
			}
			return remaining;
		}
		const redis = await redisClient();
		const ttl = await redis.pttl(keyOf(provider));
		return ttl > 0 ? ttl : null;
	}

	/** Open (or refresh) the breaker after a rate-limit/transient failure. */
	async trip(
		provider: string,
		cooldownMs: number = DEFAULT_COOLDOWN_MS,
	): Promise<void> {
		if (isTest) {
			memoryUntil.set(provider, Date.now() + cooldownMs);
			return;
		}
		const redis = await redisClient();
		await redis.set(keyOf(provider), "1", "PX", cooldownMs);
	}

	/** Close the breaker (manual reset from the admin UI). */
	async clear(provider: string): Promise<void> {
		if (isTest) {
			memoryUntil.delete(provider);
			return;
		}
		const redis = await redisClient();
		await redis.del(keyOf(provider));
	}

	/** Cooldowns for a set of providers in one round trip (match-manager UI). */
	async cooldowns(
		providers: readonly string[],
	): Promise<Record<string, number>> {
		const result: Record<string, number> = {};
		for (const provider of providers) {
			const remaining = await this.cooldownRemainingMs(provider);
			if (remaining != null) result[provider] = remaining;
		}
		return result;
	}

	/** Test helper: forget every breaker. */
	clearAllInMemory(): void {
		memoryUntil.clear();
	}
}

export const providerGate = new ProviderGate();
