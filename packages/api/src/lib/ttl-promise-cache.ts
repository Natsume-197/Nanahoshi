/**
 * TTL cache that stores the in-flight promise, not just the resolved value:
 * concurrent callers of the same key share a single resolution (a dashboard
 * load fans out ~10 parallel RPCs that would otherwise each re-resolve).
 * Failed resolutions are evicted immediately so an error is never served for
 * the rest of its TTL. `now` is injectable for tests.
 */
export class TtlPromiseCache<T> {
	private readonly entries = new Map<
		string,
		{ promise: Promise<T>; expiresAt: number }
	>();

	constructor(
		private readonly ttlMs: number,
		private readonly maxSize: number,
		private readonly now: () => number = Date.now,
	) {}

	get(key: string, resolve: () => Promise<T>): Promise<T> {
		const now = this.now();
		const hit = this.entries.get(key);
		if (hit && hit.expiresAt > now) return hit.promise;

		const promise = resolve();
		if (this.entries.size >= this.maxSize) {
			for (const [k, v] of this.entries) {
				if (v.expiresAt <= now) this.entries.delete(k);
			}
			if (this.entries.size >= this.maxSize) this.entries.clear();
		}
		this.entries.set(key, { promise, expiresAt: now + this.ttlMs });
		promise.catch(() => {
			if (this.entries.get(key)?.promise === promise) this.entries.delete(key);
		});
		return promise;
	}

	clear(): void {
		this.entries.clear();
	}

	get size(): number {
		return this.entries.size;
	}
}
