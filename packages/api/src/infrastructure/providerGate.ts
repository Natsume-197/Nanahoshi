// Shared circuit breaker per metadata provider. State lives in Redis so the
// API process (fix-match search) and every worker job see the same cooldown:
// one 429 opens the breaker for everyone, and further calls fail fast without
// touching the provider until it expires. Providers that cannot tolerate
// concurrent calls can also take a cross-process lease through this gate.

export const DEFAULT_PROVIDER_COOLDOWN_MS = 5 * 60_000;
const DEFAULT_COOLDOWN_MS = DEFAULT_PROVIDER_COOLDOWN_MS;
const EXCLUSIVE_LEASE_MS = 5 * 60_000;
const EXCLUSIVE_POLL_MS = 100;

const keyOf = (provider: string, scope: string) =>
	`provider-gate:${provider}:${scope}`;
const leaseKeyOf = (provider: string, scope: string) =>
	`provider-lease:${provider}:${scope}`;
const paceKeyOf = (provider: string, scope: string) =>
	`provider-pace:${provider}:${scope}`;

// bun test has no Redis: per-process memory keeps the same semantics.
const memoryUntil = new Map<string, number>();
const memoryLeaseTails = new Map<string, Promise<void>>();
const memoryNextSlot = new Map<string, number>();
const isTest = process.env.NODE_ENV === "test";

const RELEASE_LEASE_SCRIPT = `
	if redis.call("get", KEYS[1]) == ARGV[1] then
		return redis.call("del", KEYS[1])
	end
	return 0
`;

const RESERVE_SLOT_SCRIPT = `
	local clock = redis.call("TIME")
	local now = tonumber(clock[1]) * 1000 + math.floor(tonumber(clock[2]) / 1000)
	local next_at = tonumber(redis.call("get", KEYS[1])) or now
	local slot_at = math.max(now, next_at)
	local wait_ms = slot_at - now
	local interval_ms = tonumber(ARGV[1])
	redis.call("set", KEYS[1], slot_at + interval_ms, "PX", wait_ms + interval_ms + 60000)
	return wait_ms
`;

async function redisClient() {
	const { redis } = await import("./queue/redis");
	return redis;
}

export class ProviderGate {
	/** Reserve a cross-process request slot for one external quota bucket. */
	async waitForSlot(
		provider: string,
		scope: string,
		minIntervalMs: number,
	): Promise<void> {
		const key = paceKeyOf(provider, scope);
		let waitMs: number;
		if (isTest) {
			const now = Date.now();
			const slotAt = Math.max(now, memoryNextSlot.get(key) ?? now);
			memoryNextSlot.set(key, slotAt + minIntervalMs);
			waitMs = slotAt - now;
		} else {
			const redis = await redisClient();
			waitMs = Number(
				await redis.eval(RESERVE_SLOT_SCRIPT, 1, key, minIntervalMs),
			);
		}
		if (waitMs > 0) await Bun.sleep(waitMs);
	}

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
			const existing = memoryUntil.get(key);
			if (existing == null || existing <= Date.now()) {
				memoryUntil.set(key, Date.now() + cooldownMs);
			}
			return;
		}
		const redis = await redisClient();
		// The first failure defines the recovery window. Calls that were already
		// in flight may fail afterward; they must not keep pushing the deadline
		// out and turn one block into an effectively endless cooldown.
		await redis.set(key, "1", "PX", cooldownMs, "NX");
	}

	/**
	 * Run one provider operation at a time across API and worker processes.
	 * The Redis lease is deliberately recoverable: a crashed owner releases
	 * itself after the same bounded window as a provider cooldown.
	 */
	async runExclusive<T>(
		provider: string,
		scope: string,
		operation: () => Promise<T>,
	): Promise<T> {
		const key = leaseKeyOf(provider, scope);
		if (isTest) {
			const previous = memoryLeaseTails.get(key) ?? Promise.resolve();
			let release = () => {};
			const current = new Promise<void>((resolve) => {
				release = resolve;
			});
			const tail = previous.then(() => current);
			memoryLeaseTails.set(key, tail);
			await previous;
			try {
				return await operation();
			} finally {
				release();
				if (memoryLeaseTails.get(key) === tail) memoryLeaseTails.delete(key);
			}
		}

		const redis = await redisClient();
		const token = crypto.randomUUID();
		while (
			(await redis.set(key, token, "PX", EXCLUSIVE_LEASE_MS, "NX")) !== "OK"
		) {
			await Bun.sleep(EXCLUSIVE_POLL_MS);
		}
		try {
			return await operation();
		} finally {
			// Losing Redis while releasing must not replace the provider result;
			// the tokenized lease is safe to leave behind until its bounded TTL.
			await redis.eval(RELEASE_LEASE_SCRIPT, 1, key, token).catch(() => {});
		}
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
		memoryLeaseTails.clear();
		memoryNextSlot.clear();
	}
}

export const providerGate = new ProviderGate();
