import { lazySubscriber } from "../../infrastructure/queue/pubsub";
import { redis } from "../../infrastructure/queue/redis";

// "Something about updates changed": a schedule was made or cancelled, a check
// finished, the updater moved on. Clients refetch their own view on receipt,
// so the event carries no data a member may not see.
const UPDATES_CHANNEL = "updates:changed";

export type UpdatesEvent = { kind: "changed" };

type Callback = (event: UpdatesEvent) => void;
const subscribers = new Set<Callback>();

const ensureSubscriber = lazySubscriber([UPDATES_CHANNEL], () => {
	for (const callback of subscribers) callback({ kind: "changed" });
});

export function subscribeToUpdates(callback: Callback): () => void {
	ensureSubscriber();
	subscribers.add(callback);
	return () => subscribers.delete(callback);
}

export function publishUpdatesChanged(): void {
	redis.publish(UPDATES_CHANNEL, "changed").catch(() => {});
}
