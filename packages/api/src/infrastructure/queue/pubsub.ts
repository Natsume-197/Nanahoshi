import { Redis } from "ioredis";
import { redis } from "./redis";

// Shared Redis pub/sub plumbing for the in-process interest indexes that route
// presence/task events to just the callbacks that care. Both managers open
// exactly one subscriber and fan messages out locally rather than one Redis
// connection per consumer.

/**
 * Lazily open ONE shared Redis subscriber for the given channels, routing every
 * message to `onMessage`. Returns an `ensure` fn; the subscriber is created on
 * the first call and reused process-wide.
 */
export function lazySubscriber(
	channels: string[],
	onMessage: (channel: string, message: string) => void,
): () => void {
	let sub: Redis | null = null;
	return () => {
		if (sub) return;
		sub = new Redis(redis.options);
		sub.subscribe(...channels).catch(() => {});
		sub.on("message", onMessage);
	};
}

/** Interest index add: get-or-create the bucket Set, then add the value. */
export function addToBucket<T>(
	map: Map<string, Set<T>>,
	key: string,
	value: T,
): void {
	let set = map.get(key);
	if (!set) {
		set = new Set();
		map.set(key, set);
	}
	set.add(value);
}

/** Interest index remove: drop the value, and the bucket when it empties. */
export function removeFromBucket<T>(
	map: Map<string, Set<T>>,
	key: string,
	value: T,
): void {
	const set = map.get(key);
	if (!set) return;
	set.delete(value);
	if (set.size === 0) map.delete(key);
}
