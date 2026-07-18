import { recommendationsQueue } from "../../infrastructure/queue/queues/recommendations.queue";
import { logger } from "../../lib/logger";
import { isRecommendationsEnabled } from "../../routers/settings/settings.service";
import { recommendationComputeRepository } from "./recommendation-compute.repository";

const log = logger.child({ component: "recommendation-scheduler" });

export type RebuildServerJobData = {
	serverId: string;
	full?: boolean;
	taskId?: string;
};
export type RefreshUserJobData = { serverId: string; userId: string };

// removeOnComplete keeps debounce jobIds reusable; keep some failures for Bull Board
export const RECOMMENDATION_JOB_OPTS = {
	removeOnComplete: true,
	removeOnFail: { count: 50 },
} as const;

// BullMQ picks unprioritized jobs before prioritized ones: quick refresh-user
// and refresh-feeds jobs stay unprioritized so a queued multi-hour rebuild
// (which carries this priority) never starves them. The queue's concurrency of
// 1 still serializes execution — this only reorders the waiting line.
export const REBUILD_JOB_PRIORITY = 10;

const REFRESH_USER_DEBOUNCE_MS = 5 * 60_000;
const POST_SCAN_REBUILD_DEBOUNCE_MS = 10 * 60_000;

const nightlyId = (serverId: string) => `recs-${serverId}`;
const weeklyId = (serverId: string) => `recs-full-${serverId}`;

export async function registerServerSchedules(serverId: string): Promise<void> {
	await recommendationsQueue.upsertJobScheduler(
		nightlyId(serverId),
		// Sunday is reserved for the full rebuild below.
		{ pattern: "30 3 * * 1-6" },
		{
			name: "rebuild-server",
			data: { serverId } satisfies RebuildServerJobData,
			opts: { ...RECOMMENDATION_JOB_OPTS, priority: REBUILD_JOB_PRIORITY },
		},
	);
	// weekly full rebuild ignores fingerprints — self-heals any stale skip
	await recommendationsQueue.upsertJobScheduler(
		weeklyId(serverId),
		{ pattern: "0 4 * * 0" },
		{
			name: "rebuild-server",
			data: { serverId, full: true } satisfies RebuildServerJobData,
			opts: { ...RECOMMENDATION_JOB_OPTS, priority: REBUILD_JOB_PRIORITY },
		},
	);
}

export async function unregisterServerSchedules(
	serverId: string,
): Promise<void> {
	await recommendationsQueue
		.removeJobScheduler(nightlyId(serverId))
		.catch(() => {});
	await recommendationsQueue
		.removeJobScheduler(weeklyId(serverId))
		.catch(() => {});
}

/** Immediate (coalesced) rebuild — org creation, toggle on, post-scan. */
export async function enqueueRebuild(
	serverId: string,
	delayMs = 0,
): Promise<void> {
	await recommendationsQueue.add(
		"rebuild-server",
		{ serverId } satisfies RebuildServerJobData,
		{
			...RECOMMENDATION_JOB_OPTS,
			jobId: `recs-rebuild-${serverId}`,
			delay: delayMs,
			priority: REBUILD_JOB_PRIORITY,
		},
	);
}

export async function enqueuePostScanRebuild(serverId: string): Promise<void> {
	await enqueueRebuild(serverId, POST_SCAN_REBUILD_DEBOUNCE_MS).catch((err) =>
		log.error({ err, serverId }, "Failed to enqueue post-scan rebuild"),
	);
}

/**
 * Coalescing debounce: the first signal schedules the job, later signals are
 * absorbed by the stable jobId, and the job reads fresh state when it runs.
 */
export async function enqueueUserRefresh(
	serverId: string,
	userId: string,
): Promise<void> {
	await recommendationsQueue
		.add("refresh-user", { serverId, userId } satisfies RefreshUserJobData, {
			...RECOMMENDATION_JOB_OPTS,
			jobId: `recs-user-${serverId}-${userId}`,
			delay: REFRESH_USER_DEBOUNCE_MS,
		})
		.catch((err) =>
			log.error({ err, serverId, userId }, "Failed to enqueue user refresh"),
		);
}

export async function reconcileRecommendationSchedules(): Promise<void> {
	const orgIds = await recommendationComputeRepository.listOrganizationIds();
	const active = new Set<string>();
	for (const orgId of orgIds) {
		if (await isRecommendationsEnabled(orgId)) {
			active.add(nightlyId(orgId));
			active.add(weeklyId(orgId));
			await registerServerSchedules(orgId).catch((err) =>
				log.error({ err, serverId: orgId }, "Failed to register rec schedules"),
			);
		}
	}

	const existing = await recommendationsQueue.getJobSchedulers();
	for (const sched of existing) {
		if (sched.key && !active.has(sched.key)) {
			await recommendationsQueue.removeJobScheduler(sched.key).catch(() => {});
		}
	}

	log.info({ count: active.size / 2 }, "Recommendation schedules reconciled");
}
