import { scheduledScanQueue } from "../../infrastructure/queue/queues/scheduled-scan.queue";
import { logger } from "../../lib/logger";
import { libraryRepository } from "../../routers/libraries/library.repository";

const log = logger.child({ component: "scheduled-scan-scheduler" });

export type ScheduledScanJobData = {
	libraryId: number;
	serverId: string;
};

/** Stable scheduler id per library, so upsert replaces the previous schedule. */
function schedulerId(libraryId: number): string {
	return `lib-scan-${libraryId}`;
}

/**
 * Registers (or replaces) the repeatable scan for a library. A non-positive
 * interval is treated as "disabled" and removes any existing schedule.
 */
export async function registerLibrarySchedule(
	libraryId: number,
	serverId: string,
	intervalMinutes: number | null | undefined,
): Promise<void> {
	if (!intervalMinutes || intervalMinutes <= 0) {
		await unregisterLibrarySchedule(libraryId);
		return;
	}
	await scheduledScanQueue.upsertJobScheduler(
		schedulerId(libraryId),
		{ every: intervalMinutes * 60_000 },
		{ name: "scheduled-scan", data: { libraryId, serverId } },
	);
	log.info({ libraryId, intervalMinutes }, "Scheduled scan registered");
}

export async function unregisterLibrarySchedule(
	libraryId: number,
): Promise<void> {
	await scheduledScanQueue.removeJobScheduler(schedulerId(libraryId));
}

/**
 * Reconciles every repeatable scan against the DB on startup: registers the
 * ones that should run and drops schedulers for libraries that no longer want
 * (or no longer have) a scheduled scan.
 */
export async function reconcileSchedules(): Promise<void> {
	const libraries = await libraryRepository.findSchedulable();
	const active = new Map<string, (typeof libraries)[number]>();
	for (const lib of libraries) {
		if (lib.scanIntervalMinutes && lib.scanIntervalMinutes > 0) {
			active.set(schedulerId(lib.id), lib);
		}
	}

	const existing = await scheduledScanQueue.getJobSchedulers();
	for (const sched of existing) {
		if (sched.key && !active.has(sched.key)) {
			await scheduledScanQueue.removeJobScheduler(sched.key).catch(() => {});
		}
	}

	for (const lib of active.values()) {
		await registerLibrarySchedule(
			lib.id,
			lib.serverId,
			lib.scanIntervalMinutes,
		).catch((err) =>
			log.error({ err, libraryId: lib.id }, "Failed to register schedule"),
		);
	}

	log.info({ count: active.size }, "Scheduled scans reconciled");
}
