import type { Notification } from "@nanahoshi-v2/db/schema/general";
import {
	addToBucket,
	lazySubscriber,
	removeFromBucket,
} from "../../infrastructure/queue/pubsub";
import { redis } from "../../infrastructure/queue/redis";

// Per-user notification routing over Redis, same shape as presenceManager: one
// shared subscriber, an in-process interest index keyed by recipient userId, so
// a published event wakes only that user's gateway connections. Read/delete
// mutations publish too, keeping every tab of the same user in sync.

const NOTIFICATION_CHANNEL = "notification:updates";

export type NotificationPushEvent =
	| { kind: "new"; notification: Notification }
	| { kind: "read"; ids: number[] }
	| { kind: "read_all" }
	| { kind: "delete"; id: number };

interface ChannelMessage {
	userId: string;
	event: NotificationPushEvent;
}

type NotificationCallback = (event: NotificationPushEvent) => void;
const interest = new Map<string, Set<NotificationCallback>>();

const ensureSubscriber = lazySubscriber(
	[NOTIFICATION_CHANNEL],
	(_channel, message) => {
		try {
			const parsed = JSON.parse(message) as ChannelMessage;
			const cbs = interest.get(parsed.userId);
			if (cbs) for (const cb of cbs) cb(parsed.event);
		} catch {}
	},
);

export function publishNotificationEvent(
	userId: string,
	event: NotificationPushEvent,
): void {
	const message: ChannelMessage = { userId, event };
	redis.publish(NOTIFICATION_CHANNEL, JSON.stringify(message)).catch(() => {});
}

/** Subscribe a connection to one user's notification events. Returns unsubscribe. */
export function subscribeToNotifications(
	userId: string,
	cb: NotificationCallback,
): () => void {
	ensureSubscriber();
	addToBucket(interest, userId, cb);
	return () => removeFromBucket(interest, userId, cb);
}
