import {
	addToBucket,
	lazySubscriber,
	removeFromBucket,
} from "../../infrastructure/queue/pubsub";
import { redis } from "../../infrastructure/queue/redis";
import type {
	ManualPresenceStatus,
	PresenceBook,
	PresenceEvent,
} from "./presence.types";

export type {
	ManualPresenceStatus,
	PresenceBook,
	PresenceEvent,
	PresenceState,
} from "./presence.types";

// Live presence over Redis. Same shape as taskManager (TTL keys + pub/sub),
// but tuned for "every user is connected": a single shared subscriber routes each
// event in-process to only the connections observing that user (see the interest
// index below),
// instead of one Redis connection per SSE stream or a broadcast to every one.

const PRESENCE_CHANNEL = "presence:updates";
const CONNS_KEY = (userId: string) => `presence:conns:${userId}`;
const ACTIVITY_KEY = (userId: string) => `presence:activity:${userId}`;
const ACTIVITY_SESSION_KEY = (userId: string, sessionId: string) =>
	`presence:activity:${userId}:${sessionId}`;
const ACTIVITY_SESSIONS_KEY = (userId: string) =>
	`presence:activity-sessions:${userId}`;
const SESSION_CONNS_KEY = (userId: string, sessionId: string) =>
	`presence:session-conns:${userId}:${sessionId}`;
const IDLE_KEY = (userId: string) => `presence:idle:${userId}`;
// Persistent user-chosen status, mirrored from the DB on SSE connect. Absent ⇒
// "online" (the default), so we only write the key for away/invisible.
const STATUS_KEY = (userId: string) => `presence:status:${userId}`;

// online TTL ≈ SSE ping (30s) + margin; activity TTL ≈ client sync (45s) + margin.
const ONLINE_TTL = 70;
const ACTIVITY_TTL = 60;
// Closing the page → offline (like Discord). "Away" is reserved for an idle but
// still-connected user (client-driven). The grace just absorbs a transient drop
// (route nav, bfcache freeze, brief network blip) so a quick reconnect doesn't
// flap offline — you stay online through the window, then offline if still gone.
const OFFLINE_GRACE_MS = 30_000;

interface ActivityValue {
	sessionId: string;
	kind: "reading" | "listening" | "read_listen";
	book: PresenceBook;
}

// ── Pub/sub (one shared subscriber, directed in-process routing) ────────────

// Inverted interest index: observed userId → callbacks interested in that user.
// An incoming event for X wakes only those callbacks (interest.get(X)), not every
// connection. Each connection registers its active-server roster here and keeps
// it current via PresenceSubscription.update on the ping-loop refresh.
type PresenceCallback = (event: PresenceEvent) => void;
const interest = new Map<string, Set<PresenceCallback>>();

const ensureSubscriber = lazySubscriber(
	[PRESENCE_CHANNEL],
	(_channel, message) => {
		try {
			const event = JSON.parse(message) as PresenceEvent;
			const observers = interest.get(event.userId);
			if (observers) for (const cb of observers) cb(event);
		} catch {}
	},
);

// A live subscription owns the set of userIds it observes so it can diff against
// a refreshed roster (update) and tear itself out of the index (close). Holding
// only the callback + id set keeps the SSE handler's larger scope out of the
// long-lived registry.
export class PresenceSubscription {
	private ids: Set<string>;

	constructor(
		private readonly onEvent: PresenceCallback,
		userIds: Iterable<string>,
	) {
		ensureSubscriber();
		this.ids = new Set(userIds);
		for (const id of this.ids) addToBucket(interest, id, this.onEvent);
	}

	// Re-point this subscription at a new observed-user set, touching only the diff.
	update(userIds: Iterable<string>): void {
		const next = new Set(userIds);
		for (const id of this.ids) {
			if (!next.has(id)) removeFromBucket(interest, id, this.onEvent);
		}
		for (const id of next) {
			if (!this.ids.has(id)) addToBucket(interest, id, this.onEvent);
		}
		this.ids = next;
	}

	close(): void {
		for (const id of this.ids) removeFromBucket(interest, id, this.onEvent);
		this.ids.clear();
	}
}

export function subscribeToPresence(
	userIds: Iterable<string>,
	onEvent: PresenceCallback,
): PresenceSubscription {
	return new PresenceSubscription(onEvent, userIds);
}

// Publish only on a real state change so a 60s heartbeat that doesn't move the
// needle never hits the channel.
const lastPublished = new Map<string, string>();

function publish(event: PresenceEvent): void {
	const serialized = JSON.stringify(event);
	if (lastPublished.get(event.userId) === serialized) return;
	if (event.state === "offline") {
		lastPublished.delete(event.userId);
	} else {
		lastPublished.set(event.userId, serialized);
	}
	redis.publish(PRESENCE_CHANNEL, serialized).catch(() => {});
}

// ── State helpers ───────────────────────────────────────────────────────────

function parseActivity(raw: string | null): ActivityValue | null {
	if (!raw) return null;
	try {
		return JSON.parse(raw) as ActivityValue;
	} catch {
		return null;
	}
}

export function keepsReadListenActivity(
	current: ActivityValue | null,
	nextKind: ActivityValue["kind"],
): boolean {
	return current?.kind === "read_listen" && nextKind !== "read_listen";
}

function toEvent(
	userId: string,
	online: boolean,
	activity: ActivityValue | null,
	idle: boolean,
	status: ManualPresenceStatus,
): PresenceEvent {
	// Priority: invisible/offline > reading/listening/read & listen > away > online. Invisible
	// and disconnected both read as offline — authoritative, and it hides a
	// lingering activity key whose TTL hasn't expired yet. Activity stays visible
	// even under a manual "away" (Discord-like): the amber dot only wins when
	// there's nothing to show. "away" is either the auto-idle flag or the manual
	// status.
	if (status === "invisible" || !online) {
		return { userId, state: "offline", book: null };
	}
	if (activity) {
		return { userId, state: activity.kind, book: activity.book };
	}
	if (idle || status === "away") {
		return { userId, state: "away", book: null };
	}
	return { userId, state: "online", book: null };
}

function parseStatus(raw: string | null): ManualPresenceStatus {
	return raw === "away" || raw === "invisible" ? raw : "online";
}

// Callers that just wrote/read the status (connect, setIdle, setManualStatus)
// pass it in to skip the extra STATUS_KEY round-trip.
async function currentEvent(
	userId: string,
	knownStatus?: ManualPresenceStatus,
): Promise<PresenceEvent> {
	const [exists, activityRaw, idle, statusRaw] = await Promise.all([
		redis.exists(CONNS_KEY(userId)),
		redis.get(ACTIVITY_KEY(userId)),
		redis.exists(IDLE_KEY(userId)),
		knownStatus === undefined ? redis.get(STATUS_KEY(userId)) : null,
	]);
	return toEvent(
		userId,
		exists === 1,
		parseActivity(activityRaw),
		idle === 1,
		knownStatus ?? parseStatus(statusRaw),
	);
}

// Manual status lives in Redis (mirrored from the DB on SSE connect) so the
// ping loop and heartbeats can honor it without re-querying Postgres.
async function getStatus(userId: string): Promise<ManualPresenceStatus> {
	return parseStatus(await redis.get(STATUS_KEY(userId)));
}

async function isInvisible(userId: string): Promise<boolean> {
	return (await getStatus(userId)) === "invisible";
}

// ── Connection lifecycle (drives online/offline) ────────────────────────────

// Pending "go offline" timers, keyed by user. A reconnect within the grace
// window cancels the timer, so a tab switch never produces an offline blip.
const pendingOffline = new Map<string, ReturnType<typeof setTimeout>>();

function cancelPendingOffline(userId: string): void {
	const timer = pendingOffline.get(userId);
	if (timer) {
		clearTimeout(timer);
		pendingOffline.delete(userId);
	}
}

// Used both on gateway connect and on the 30s ping loop. SADD + EXPIRE is
// idempotent (re-adds the conn if the set expired during a hiccup). The same
// pipeline also reads activity + idle so an expired lease produces its fallback
// event on the next heartbeat; publish() suppresses unchanged states.
export async function heartbeatOnline(
	userId: string,
	connId: string,
	sessionId: string,
	knownStatus?: ManualPresenceStatus,
): Promise<void> {
	const status = knownStatus ?? (await getStatus(userId));
	if (status === "invisible") return;
	cancelPendingOffline(userId);
	// One round-trip for the whole heartbeat: add the conn, refresh the conn +
	// idle TTLs (IDLE expire is a no-op when unset), and read the new set size.
	const res = await redis
		.pipeline()
		.sadd(CONNS_KEY(userId), connId)
		.expire(CONNS_KEY(userId), ONLINE_TTL)
		.sadd(SESSION_CONNS_KEY(userId, sessionId), connId)
		.expire(SESSION_CONNS_KEY(userId, sessionId), ONLINE_TTL)
		.expire(IDLE_KEY(userId), ONLINE_TTL)
		.scard(CONNS_KEY(userId))
		.get(ACTIVITY_KEY(userId))
		.exists(IDLE_KEY(userId))
		.exec();
	if (!res) return;
	const size = res[5]?.[1] as number;
	const activityRaw = res[6]?.[1];
	const idle = res[7]?.[1] === 1;
	publish(
		toEvent(
			userId,
			size > 0,
			parseActivity(typeof activityRaw === "string" ? activityRaw : null),
			idle,
			status,
		),
	);
}

export async function clearConnection(
	userId: string,
	connId: string,
	sessionId: string,
): Promise<void> {
	const res = await redis
		.pipeline()
		.srem(CONNS_KEY(userId), connId)
		.scard(CONNS_KEY(userId))
		.srem(SESSION_CONNS_KEY(userId, sessionId), connId)
		.scard(SESSION_CONNS_KEY(userId, sessionId))
		.exec();
	const size = (res?.[1]?.[1] as number) ?? 0;
	const sessionSize = (res?.[3]?.[1] as number) ?? 0;
	if (sessionSize === 0) await clearActivity(userId, sessionId);
	if (size > 0) return;
	// Last connection dropped — but don't flap offline on a transient reconnect
	// (route nav, bfcache freeze, brief blip). Wait out the grace, then re-check.
	if (pendingOffline.has(userId)) return;
	const timer = setTimeout(() => {
		pendingOffline.delete(userId);
		finalizeOffline(userId).catch(() => {});
	}, OFFLINE_GRACE_MS);
	pendingOffline.set(userId, timer);
}

async function finalizeOffline(userId: string): Promise<void> {
	// A connection came back during the grace window — stay online.
	if ((await redis.scard(CONNS_KEY(userId))) > 0) return;
	await redis.del(
		ACTIVITY_KEY(userId),
		ACTIVITY_SESSIONS_KEY(userId),
		IDLE_KEY(userId),
	);
	publish({ userId, state: "offline", book: null });
}

// ── Away / idle ──────────────────────────────────────────────────────────────

// Client-driven: the browser detects no interaction for a while and flips this.
// Honored only while online; activity still takes priority.
export async function setIdle(userId: string, idle: boolean): Promise<void> {
	const status = await getStatus(userId);
	if (status === "invisible") return;
	if (idle) {
		await redis.set(IDLE_KEY(userId), "1", "EX", ONLINE_TTL);
	} else {
		await redis.del(IDLE_KEY(userId));
	}
	// currentEvent already reads the connection state, so it doubles as the
	// "are they online?" guard — offline users simply don't get an event.
	const event = await currentEvent(userId, status);
	if (event.state !== "offline") publish(event);
}

// ── Activity (reading / listening / read & listen), driven by heartbeats ─────

export async function markActivity(
	userId: string,
	sessionId: string,
	kind: "reading" | "listening" | "read_listen",
	book: PresenceBook,
): Promise<void> {
	if (await isInvisible(userId)) return;
	if (
		keepsReadListenActivity(
			parseActivity(await redis.get(ACTIVITY_KEY(userId))),
			kind,
		)
	)
		return;
	const value: ActivityValue = { sessionId, kind, book };
	const serialized = JSON.stringify(value);
	await redis
		.pipeline()
		.set(
			ACTIVITY_SESSION_KEY(userId, sessionId),
			serialized,
			"EX",
			ACTIVITY_TTL,
		)
		.sadd(ACTIVITY_SESSIONS_KEY(userId), sessionId)
		.expire(ACTIVITY_SESSIONS_KEY(userId), ACTIVITY_TTL)
		.set(ACTIVITY_KEY(userId), serialized, "EX", ACTIVITY_TTL)
		.exec();
	publish({ userId, state: kind, book });
}

export async function clearActivity(
	userId: string,
	sessionId?: string,
): Promise<void> {
	if (!sessionId) {
		await redis.del(ACTIVITY_KEY(userId), ACTIVITY_SESSIONS_KEY(userId));
		const event = await currentEvent(userId);
		if (event.state !== "offline") publish(event);
		return;
	}
	const current = parseActivity(await redis.get(ACTIVITY_KEY(userId)));
	await redis
		.pipeline()
		.del(ACTIVITY_SESSION_KEY(userId, sessionId))
		.srem(ACTIVITY_SESSIONS_KEY(userId), sessionId)
		.exec();
	if (current?.sessionId !== sessionId) return;
	const sessions = await redis.smembers(ACTIVITY_SESSIONS_KEY(userId));
	const activities = sessions.length
		? await redis.mget(sessions.map((id) => ACTIVITY_SESSION_KEY(userId, id)))
		: [];
	const fallback = activities
		.map((activity) => parseActivity(activity))
		.find((activity): activity is ActivityValue => activity !== null);
	if (fallback) {
		await redis.set(
			ACTIVITY_KEY(userId),
			JSON.stringify(fallback),
			"EX",
			ACTIVITY_TTL,
		);
		publish({ userId, state: fallback.kind, book: fallback.book });
		return;
	}
	await redis.del(ACTIVITY_KEY(userId));
	// Fall back to away/online depending on the idle flag, not a hardcoded
	// "online" — a user who stopped reading while idle should read as away. An
	// offline user produces an offline event here, which we skip (clearConnection
	// owns the offline transition).
	const event = await currentEvent(userId);
	if (event.state !== "offline") publish(event);
}

// ── Manual status (online / away / invisible) ────────────────────────────────

// Mirror the DB status into Redis (called on SSE connect so a Redis flush
// self-heals from Postgres). Does not publish. "online" is the implicit default,
// so we delete the key rather than store it.
export async function syncStatus(
	userId: string,
	status: ManualPresenceStatus,
): Promise<void> {
	if (status === "online") {
		await redis.del(STATUS_KEY(userId));
	} else {
		await redis.set(STATUS_KEY(userId), status);
	}
}

// Change the manual status and publish the resulting event. Invisible forces the
// user offline immediately (and clears their live keys); switching away from
// invisible lets the next ping-loop heartbeat (≤30s) re-publish them online.
// away/online transitions publish immediately since the connection keys survive.
export async function setManualStatus(
	userId: string,
	status: ManualPresenceStatus,
): Promise<void> {
	if (status === "invisible") {
		cancelPendingOffline(userId);
		await redis.set(STATUS_KEY(userId), "invisible");
		await redis.del(
			CONNS_KEY(userId),
			ACTIVITY_KEY(userId),
			ACTIVITY_SESSIONS_KEY(userId),
			IDLE_KEY(userId),
		);
		publish({ userId, state: "offline", book: null });
		return;
	}
	await syncStatus(userId, status);
	const event = await currentEvent(userId, status);
	if (event.state !== "offline") publish(event);
}

// ── Snapshot read (panel load) ──────────────────────────────────────────────

export async function getPresenceFor(
	userIds: string[],
): Promise<Map<string, PresenceEvent>> {
	const result = new Map<string, PresenceEvent>();
	if (userIds.length === 0) return result;

	const pipeline = redis.pipeline();
	for (const id of userIds) {
		pipeline.exists(CONNS_KEY(id));
		pipeline.get(ACTIVITY_KEY(id));
		pipeline.exists(IDLE_KEY(id));
		pipeline.get(STATUS_KEY(id));
	}
	const responses = await pipeline.exec();
	if (!responses) {
		for (const id of userIds) {
			result.set(id, { userId: id, state: "offline", book: null });
		}
		return result;
	}

	const OPS = 4;
	userIds.forEach((id, index) => {
		const existsRes = responses[index * OPS]?.[1];
		const activityRes = responses[index * OPS + 1]?.[1];
		const idleRes = responses[index * OPS + 2]?.[1];
		const statusRes = responses[index * OPS + 3]?.[1];
		const online = existsRes === 1;
		const activity = parseActivity(
			typeof activityRes === "string" ? activityRes : null,
		);
		result.set(
			id,
			toEvent(
				id,
				online,
				activity,
				idleRes === 1,
				parseStatus(typeof statusRes === "string" ? statusRes : null),
			),
		);
	});
	return result;
}
