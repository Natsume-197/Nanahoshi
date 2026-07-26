import { metadataEnrichQueue } from "../../infrastructure/queue/queues/metadata-enrich.queue";
import { logger } from "../../lib/logger";
import { enrichmentStateRepository } from "../../routers/enrichment/enrichment.repository";
import { metadataRetryJob } from "./metadata-retry.job";

const log = logger.child({ component: "metadata-retry-scheduler" });
const SCHEDULER_ID = "metadata-retry-dispatch";
const DISPATCH_INTERVAL_MS = 60_000;

export async function registerMetadataRetrySchedule(): Promise<void> {
	await metadataEnrichQueue.upsertJobScheduler(
		SCHEDULER_ID,
		{ every: DISPATCH_INTERVAL_MS },
		{
			name: "dispatch-due-retries",
			data: {},
			opts: { removeOnComplete: true, removeOnFail: true },
		},
	);
}

/**
 * PostgreSQL owns retry intent; BullMQ only executes leased due work. A short
 * DB lease makes a Redis admission failure self-healing on the next pass.
 */
export async function dispatchDueMetadataRetries(): Promise<number> {
	const targets = await enrichmentStateRepository.leaseDueRetries();
	if (targets.length === 0) return 0;

	await metadataEnrichQueue.addBulk(targets.map(metadataRetryJob));
	log.info({ count: targets.length }, "Dispatched due metadata retries");
	return targets.length;
}
