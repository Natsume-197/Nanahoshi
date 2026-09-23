import {
	addToBucket,
	lazySubscriber,
	removeFromBucket,
} from "../../infrastructure/queue/pubsub";
import { redis } from "../../infrastructure/queue/redis";

// "Something in this server's metadata tray changed" push, so the page refreshes
// its rows and counts live instead of polling. Routed per serverId; the payload
// carries no data — clients refetch their own permission-scoped queries.

const TRAY_CHANNEL = "tray:updates";

export type TrayChangeKind = "metadata" | "pairings";
export type TrayPushEvent = { kind: TrayChangeKind };

interface ChannelMessage {
	serverId: string;
	event: TrayPushEvent;
}

type TrayCallback = (event: TrayPushEvent) => void;
const interest = new Map<string, Set<TrayCallback>>();

const ensureSubscriber = lazySubscriber([TRAY_CHANNEL], (_channel, message) => {
	try {
		const parsed = JSON.parse(message) as ChannelMessage;
		const cbs = interest.get(parsed.serverId);
		if (cbs) for (const cb of cbs) cb(parsed.event);
	} catch {}
});

// An enrichment run finishes a book every few hundred ms; one push per window
// per server keeps every open tray to a single refetch per second.
export const TRAY_COALESCE_MS = 1_000;
const scheduled = new Map<string, ReturnType<typeof setTimeout>>();

export function publishTrayChanged(
	serverId: string | null | undefined,
	kind: TrayChangeKind,
): void {
	if (!serverId) return;
	const key = `${serverId}:${kind}`;
	if (scheduled.has(key)) return;
	scheduled.set(
		key,
		setTimeout(() => {
			scheduled.delete(key);
			const message: ChannelMessage = { serverId, event: { kind } };
			redis.publish(TRAY_CHANNEL, JSON.stringify(message)).catch(() => {});
		}, TRAY_COALESCE_MS),
	);
}

/** Subscribe a connection to one server's tray events. Returns unsubscribe. */
export function subscribeToTrayEvents(
	serverId: string,
	cb: TrayCallback,
): () => void {
	ensureSubscriber();
	addToBucket(interest, serverId, cb);
	return () => removeFromBucket(interest, serverId, cb);
}
