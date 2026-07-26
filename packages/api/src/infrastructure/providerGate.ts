// Shared circuit breaker per metadata provider. State lives in Redis so the
// API process (fix-match search) and every worker job see the same cooldown:
// one 429 opens the breaker for everyone, and further calls fail fast without
// touching the provider until it expires. Request pacing (min interval)
// remains inside each provider — this gate only handles cooldowns.

export const DEFAULT_PROVIDER_COOLDOWN_MS = 5 * 60_000;
const DEFAULT_COOLDOWN_MS = DEFAULT_PROVIDER_COOLDOWN_MS;

const keyOf = (provider: string, scope: string) =>
	`provider-gate:${provider}:${scope}`;

// bun test has no Redis: per-process memory keeps the same semantics.
const memoryUntil = new Map<string, number>();
const isTest = process.env.NODE_ENV === "test";

async function redisClient() {
	const { redis } = await import("./queue/redis");
	return redis;
}

export class ProviderGate {
	/** ms until the provider may be called again, or null when closed. */
	async cooldownRemainingMs(
		provider: string,
		scope = "shared",
	): Promise<number | null> {
		const key = keyOf(provider, scope);
		if (isTest) {
			const until = memoryUntil.get(key);
			if (!until) return null;
			const remaining = until - Date.now();
			if (remaining <= 0) {
				memoryUntil.delete(key);
				return null;
			}
			return remaining;
		}
		const redis = await redisClient();
		const ttl = await redis.pttl(key);
		return ttl > 0 ? ttl : null;
	}

	/** Open (or refresh) the breaker after a rate-limit/transient failure. */
	async trip(
		provider: string,
		cooldownMs: number = DEFAULT_COOLDOWN_MS,
		scope = "shared",
	): Promise<void> {
		const key = keyOf(provider, scope);
		if (isTest) {
			memoryUntil.set(key, Date.now() + cooldownMs);
			return;
		}
		const redis = await redisClient();
		await redis.set(key, "1", "PX", cooldownMs);
	}

	/** Close the breaker (manual reset from the admin UI). */
	async clear(provider: string, scope = "shared"): Promise<void> {
		const key = keyOf(provider, scope);
		if (isTest) {
			memoryUntil.delete(key);
			return;
		}
		const redis = await redisClient();
		await redis.del(key);
	}

	/**
	 * Cooldowns projected through the exact quota scope used by each provider,
	 * in one round trip — this backs a UI poll, so a per-provider PTTL would be
	 * one await per configured provider every refresh.
	 */
	async scopedCooldowns(
		providerScopes: Readonly<Record<string, string>>,
	): Promise<Record<string, number>> {
		const entries = Object.entries(providerScopes);
		const result: Record<string, number> = {};
		if (entries.length === 0) return result;

		if (isTest) {
			for (const [provider, scope] of entries) {
				const remaining = await this.cooldownRemainingMs(provider, scope);
				if (remaining != null) result[provider] = remaining;
			}
			return result;
		}

		const redis = await redisClient();
		const pipeline = redis.pipeline();
		for (const [provider, scope] of entries) {
			pipeline.pttl(keyOf(provider, scope));
		}
		const replies = await pipeline.exec();
		entries.forEach(([provider], i) => {
			const ttl = replies?.[i]?.[1];
			if (typeof ttl === "number" && ttl > 0) result[provider] = ttl;
		});
		return result;
	}

	/** Test helper: forget every breaker. */
	clearAllInMemory(): void {
		memoryUntil.clear();
	}
}

export const providerGate = new ProviderGate();
