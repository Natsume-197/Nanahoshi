// Serving-time impression memory (Tier 3 of the online re-rank): how many
// distinct sessions each recommended work was shown to a user without being
// engaged. Lives in Redis — ephemeral serving state, not taste, so it never
// touches Postgres and losing it only resets rotation.

/** Impressions closer together than this count as the same session/viewing. */
const IMPRESSION_WINDOW_MS = 6 * 3_600_000;
/** Idle users start fresh instead of facing a fully-penalized feed. */
const IMPRESSION_TTL_S = 30 * 24 * 3_600;

export interface ImpressionEntry {
	count: number;
	lastMs: number;
}

// The subset of ioredis this store touches — injectable so tests pass a fake
// instead of mock.module'ing the shared client (which leaks across files).
export interface ImpressionRedis {
	hgetall(key: string): Promise<Record<string, string>>;
	hset(key: string, fields: Record<string, string>): Promise<unknown>;
	expire(key: string, seconds: number): Promise<unknown>;
}

export class ImpressionStore {
	// The shared ioredis client connects (and validates env) at module import,
	// so it is resolved lazily on first use — importing this store stays free of
	// side effects for every consumer of the recommendations service.
	constructor(private client?: ImpressionRedis) {}

	private async getClient(): Promise<ImpressionRedis> {
		if (!this.client) {
			this.client = (await import("../../infrastructure/queue/redis")).redis;
		}
		return this.client;
	}

	private key(serverId: string, userId: string): string {
		return `recs:imp:${serverId}:${userId}`;
	}

	/** Never throws: Redis being down degrades to "no impression history". */
	async load(
		serverId: string,
		userId: string,
	): Promise<Map<string, ImpressionEntry>> {
		const out = new Map<string, ImpressionEntry>();
		try {
			const client = await this.getClient();
			const raw = await client.hgetall(this.key(serverId, userId));
			for (const [workKey, value] of Object.entries(raw)) {
				const sep = value.indexOf(":");
				if (sep <= 0) continue;
				const count = Number(value.slice(0, sep));
				const lastMs = Number(value.slice(sep + 1));
				if (Number.isFinite(count) && Number.isFinite(lastMs)) {
					out.set(workKey, { count, lastMs });
				}
			}
		} catch {}
		return out;
	}

	/**
	 * Count one impression per shown work, but only when the previous one is
	 * older than the session window — reloading the dashboard five times in a
	 * row is one viewing, not five. Fire-and-forget by design.
	 */
	async record(
		serverId: string,
		userId: string,
		workKeys: string[],
		existing: Map<string, ImpressionEntry>,
		nowMs = Date.now(),
	): Promise<void> {
		const fields: Record<string, string> = {};
		for (const workKey of workKeys) {
			const prev = existing.get(workKey);
			if (prev && nowMs - prev.lastMs < IMPRESSION_WINDOW_MS) continue;
			fields[workKey] = `${(prev?.count ?? 0) + 1}:${nowMs}`;
		}
		if (Object.keys(fields).length === 0) return;
		try {
			const client = await this.getClient();
			const key = this.key(serverId, userId);
			await client.hset(key, fields);
			await client.expire(key, IMPRESSION_TTL_S);
		} catch {}
	}
}

export const impressionStore = new ImpressionStore();
