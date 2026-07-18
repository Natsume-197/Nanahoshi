import {
	addToBucket,
	lazySubscriber,
	removeFromBucket,
} from "../../infrastructure/queue/pubsub";
import { redis } from "../../infrastructure/queue/redis";

// Per-user "your feed was recomputed" push over Redis, same shape as
// notification.events: one shared subscriber, an in-process interest index
// keyed by userId. Closes the silent path — the debounced refresh-user job
// creates no task, so without this the client only learns about its fresh feed
// when staleTime expires.

const RECOMMENDATION_CHANNEL = "recommendations:updates";

export type RecommendationPushEvent = { kind: "refreshed" };

interface ChannelMessage {
	userId: string;
	event: RecommendationPushEvent;
}

type RecommendationCallback = (event: RecommendationPushEvent) => void;
const interest = new Map<string, Set<RecommendationCallback>>();

const ensureSubscriber = lazySubscriber(
	[RECOMMENDATION_CHANNEL],
	(_channel, message) => {
		try {
			const parsed = JSON.parse(message) as ChannelMessage;
			const cbs = interest.get(parsed.userId);
			if (cbs) for (const cb of cbs) cb(parsed.event);
		} catch {}
	},
);

export function publishRecommendationsRefreshed(userId: string): void {
	const message: ChannelMessage = { userId, event: { kind: "refreshed" } };
	redis
		.publish(RECOMMENDATION_CHANNEL, JSON.stringify(message))
		.catch(() => {});
}

/** Subscribe a connection to one user's recommendation events. Returns unsubscribe. */
export function subscribeToRecommendationEvents(
	userId: string,
	cb: RecommendationCallback,
): () => void {
	ensureSubscriber();
	addToBucket(interest, userId, cb);
	return () => removeFromBucket(interest, userId, cb);
}
