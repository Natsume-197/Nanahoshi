import {
	addToBucket,
	lazySubscriber,
	removeFromBucket,
} from "../../infrastructure/queue/pubsub";
import { redis } from "../../infrastructure/queue/redis";

const SESSION_CHANNEL = "session:revocations";

export type SessionsRevokedEvent = {
	kind: "sessions_revoked";
	initiatorSessionId: string;
};

interface ChannelMessage {
	userId: string;
	event: SessionsRevokedEvent;
}

type SessionCallback = (event: SessionsRevokedEvent) => void;
const interest = new Map<string, Set<SessionCallback>>();

const ensureSubscriber = lazySubscriber(
	[SESSION_CHANNEL],
	(_channel, message) => {
		try {
			const parsed = JSON.parse(message) as ChannelMessage;
			const callbacks = interest.get(parsed.userId);
			if (callbacks) for (const callback of callbacks) callback(parsed.event);
		} catch {}
	},
);

export function publishSessionsRevoked(
	userId: string,
	event: SessionsRevokedEvent,
): void {
	const message: ChannelMessage = { userId, event };
	redis.publish(SESSION_CHANNEL, JSON.stringify(message)).catch(() => {});
}

export function subscribeToSessionRevocations(
	userId: string,
	callback: SessionCallback,
): () => void {
	ensureSubscriber();
	addToBucket(interest, userId, callback);
	return () => removeFromBucket(interest, userId, callback);
}
