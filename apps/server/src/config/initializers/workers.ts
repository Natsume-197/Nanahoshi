import { redis } from "@nanahoshi-v2/api/infrastructure/queue/redis";
import { startTaskProgressListeners } from "@nanahoshi-v2/api/infrastructure/queue/task-progress.listener";
import { getSearchProvider } from "@nanahoshi-v2/api/infrastructure/search/search.factory";
import { logger } from "@nanahoshi-v2/api/lib/logger";
import type { RuntimeInitializer } from "./types";

// Only close() is needed; avoids a direct bullmq dependency in this package.
type Closable = { close: () => Promise<void> };

let workers: Closable[] = [];

export const workersInitializer: RuntimeInitializer = {
	name: "workers",
	initialize: async () => {
		const [
			fileEvent,
			coverColor,
			metadataEnrich,
			ranobedbImport,
			sendToKindle,
			scheduledScan,
			recommendations,
			bookmeterSync,
			coverWarm,
		] = await Promise.all([
			import("@nanahoshi-v2/api/infrastructure/workers/file.event.worker"),
			import("@nanahoshi-v2/api/infrastructure/workers/cover-color.worker"),
			import("@nanahoshi-v2/api/infrastructure/workers/metadata-enrich.worker"),
			import("@nanahoshi-v2/api/infrastructure/workers/ranobedb-import.worker"),
			import("@nanahoshi-v2/api/infrastructure/workers/send-to-kindle.worker"),
			import("@nanahoshi-v2/api/infrastructure/workers/scheduled-scan.worker"),
			import("@nanahoshi-v2/api/infrastructure/workers/recommendations.worker"),
			import("@nanahoshi-v2/api/infrastructure/workers/bookmeter-sync.worker"),
			import("@nanahoshi-v2/api/infrastructure/workers/cover-warm.worker"),
		]);

		workers = [
			fileEvent.fileEventWorker,
			coverColor.coverColorWorker,
			metadataEnrich.metadataEnrichWorker,
			ranobedbImport.ranobedbImportWorker,
			sendToKindle.sendToKindleWorker,
			scheduledScan.scheduledScanWorker,
			recommendations.recommendationsWorker,
			bookmeterSync.bookmeterSyncWorker,
			coverWarm.coverWarmWorker,
		];

		// Seed/repair repeatable library scans from the DB.
		const { reconcileSchedules } = await import(
			"@nanahoshi-v2/api/modules/scanning/scheduled-scan.scheduler"
		);
		await reconcileSchedules().catch((err) =>
			logger.error({ err }, "[Workers] Failed to reconcile scan schedules"),
		);

		const { registerBookmeterSchedule } = await import(
			"@nanahoshi-v2/api/modules/bookmeter/bookmeter.scheduler"
		);
		await registerBookmeterSchedule().catch((err) =>
			logger.error({ err }, "[Workers] Failed to register bookmeter schedule"),
		);

		const { reconcileRecommendationSchedules } = await import(
			"@nanahoshi-v2/api/modules/recommendations/recommendation.scheduler"
		);
		await reconcileRecommendationSchedules().catch((err) =>
			logger.error(
				{ err },
				"[Workers] Failed to reconcile recommendation schedules",
			),
		);

		const { registerMetadataRetrySchedule } = await import(
			"@nanahoshi-v2/api/modules/metadataRetry/metadata-retry.scheduler"
		);
		await registerMetadataRetrySchedule().catch((err) =>
			logger.error(
				{ err },
				"[Workers] Failed to register metadata retry schedule",
			),
		);

		// Only when the provider requires sync (Elasticsearch).
		if (getSearchProvider().requiresSync()) {
			const [syncMod, indexMod] = await Promise.all([
				import("@nanahoshi-v2/api/infrastructure/workers/search-sync.worker"),
				import("@nanahoshi-v2/api/infrastructure/workers/book.index.worker"),
			]);
			workers.push(syncMod.searchSyncWorker, indexMod.bookIndexWorker);
		}

		workers.push(await startTaskProgressListeners());
	},
	shutdown: async () => {
		// Stop workers before closing the Redis connection they share.
		await Promise.all(workers.map((w) => w.close()));
		workers = [];
		await redis.quit().catch(() => {});
		logger.info("Workers stopped, Redis connection closed");
	},
};
