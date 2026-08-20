import { lazySubscriber } from "../../infrastructure/queue/pubsub";
import { redis } from "../../infrastructure/queue/redis";

export type PlaybackKind = "reading" | "listening";

export interface ActivePlayback {
	sessionId: string;
	userId: string;
	userName: string;
	userImage: string | null;
	device: string | null;
	ipAddress: string | null;
	serverId: string;
	bookUuid: string;
	bookTitle: string;
	kind: PlaybackKind;
	progress: number | null;
	updatedAt: string;
}

const PLAYBACK_TTL_SECONDS = 90;
const PLAYBACK_INDEX = "instance-activity:playback:index";
const PLAYBACK_KEY = (sessionId: string) =>
	`instance-activity:playback:session:${sessionId}`;
const INSTANCE_ACTIVITY_CHANNEL = "instance-activity:updates";

export type InstanceActivityEvent =
	| { kind: "playback_changed"; sessionId: string }
	| { kind: "audit_changed" }
	| { kind: "download_changed" };

type ActivityCallback = (event: InstanceActivityEvent) => void;
const subscribers = new Set<ActivityCallback>();

const ensureSubscriber = lazySubscriber(
	[INSTANCE_ACTIVITY_CHANNEL],
	(_channel, message) => {
		try {
			const event = JSON.parse(message) as InstanceActivityEvent;
			for (const callback of subscribers) callback(event);
		} catch {}
	},
);

export function subscribeToInstanceActivity(
	callback: ActivityCallback,
): () => void {
	ensureSubscriber();
	subscribers.add(callback);
	return () => subscribers.delete(callback);
}

export function publishInstanceActivity(event: InstanceActivityEvent): void {
	redis
		.publish(INSTANCE_ACTIVITY_CHANNEL, JSON.stringify(event))
		.catch(() => {});
}

export async function markActivePlayback(
	playback: Omit<ActivePlayback, "updatedAt">,
): Promise<void> {
	const value: ActivePlayback = {
		...playback,
		updatedAt: new Date().toISOString(),
	};
	const expiresAt = Date.now() + PLAYBACK_TTL_SECONDS * 1000;
	await redis
		.pipeline()
		.set(
			PLAYBACK_KEY(value.sessionId),
			JSON.stringify(value),
			"EX",
			PLAYBACK_TTL_SECONDS,
		)
		.zadd(PLAYBACK_INDEX, expiresAt, value.sessionId)
		.expire(PLAYBACK_INDEX, PLAYBACK_TTL_SECONDS * 2)
		.exec();
	publishInstanceActivity({
		kind: "playback_changed",
		sessionId: value.sessionId,
	});
}

export async function clearActivePlayback(sessionId: string): Promise<void> {
	await redis
		.pipeline()
		.del(PLAYBACK_KEY(sessionId))
		.zrem(PLAYBACK_INDEX, sessionId)
		.exec();
	publishInstanceActivity({ kind: "playback_changed", sessionId });
}

function parsePlayback(value: string | null): ActivePlayback | null {
	if (!value) return null;
	try {
		return JSON.parse(value) as ActivePlayback;
	} catch {
		return null;
	}
}

/** Active state only; the Redis TTL is the fallback when a client disappears. */
export async function listActivePlayback(): Promise<ActivePlayback[]> {
	const now = Date.now();
	await redis.zremrangebyscore(PLAYBACK_INDEX, "-inf", now).catch(() => {});
	const sessionIds = await redis.zrangebyscore(PLAYBACK_INDEX, now + 1, "+inf");
	if (sessionIds.length === 0) return [];
	const values = await redis.mget(sessionIds.map(PLAYBACK_KEY));
	return values
		.map(parsePlayback)
		.filter((value): value is ActivePlayback => value !== null)
		.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
