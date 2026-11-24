import { redis } from "../../infrastructure/queue/redis";
import type { IdleReason } from "../../routers/updates/update.model";
import { backupQueue } from "../database-backup/backups";
import { listActivePlayback } from "../instance-activity/playback.manager";
import { getActiveTasks } from "../taskManager";

/** How long nothing may be busy before "Update when idle" restarts. */
export const IDLE_QUIET_MS = 5 * 60_000;
const BUSY_AT_KEY = "updates:busy-at";

/**
 * What a restart would interrupt right now. Reading is not on the list: the
 * reader keeps its book loaded and retries its progress sync, so a short
 * restart costs nothing. Listening streams from the server, and tasks and
 * backups would be cut off part way.
 */
export async function readBusyReasons(): Promise<IdleReason[]> {
	const [tasks, playback, backups] = await Promise.all([
		getActiveTasks(),
		listActivePlayback(),
		backupQueue.getJobCounts("active"),
	]);
	const reasons: IdleReason[] = [];
	if (tasks.some((task) => task.status === "running")) reasons.push("tasks");
	if (playback.some((entry) => entry.kind === "listening")) {
		reasons.push("listening");
	}
	if ((backups.active ?? 0) > 0) reasons.push("backup");
	return reasons;
}

/**
 * Record whether the instance is busy now, and say whether it has been quiet
 * for `IDLE_QUIET_MS` since both the last busy moment and `since`.
 */
export async function quietSince(since: number, now = Date.now()) {
	const busy = await readBusyReasons();
	if (busy.length > 0) {
		await redis.set(BUSY_AT_KEY, String(now));
		return { quiet: false, busy };
	}
	const busyAt = Number((await redis.get(BUSY_AT_KEY)) ?? 0);
	const quietFrom = Math.max(busyAt, since);
	return { quiet: now - quietFrom >= IDLE_QUIET_MS, busy };
}
