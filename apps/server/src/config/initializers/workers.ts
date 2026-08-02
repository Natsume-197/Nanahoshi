import { startTaskProgressListeners } from "@nanahoshi-v2/api/infrastructure/queue/task-progress.listener";
import { logger } from "@nanahoshi-v2/api/lib/logger";
import { startMemoryPressureController } from "@nanahoshi-v2/api/lib/memory-pressure-controller";
import type { RuntimeInitializer } from "./types";

// Only close() is needed; avoids a direct bullmq dependency in this package.
type Closable = { close: () => Promise<void> };

let workers: Closable[] = [];

export const workersInitializer: RuntimeInitializer = {
	name: "workers",
	initialize: async () => {
		const [
			fileEvent,
			coverIngest,
			metadataEnrich,
			ranobedbImport,
			sendToKindle,
			scheduledScan,
			recommendations,
			bookmeterSync,
		] = await Promise.all([
			import("@nanahoshi-v2/api/infrastructure/workers/file.event.worker"),
			import("@nanahoshi-v2/api/infrastructure/workers/cover-ingest.worker"),
			import("@nanahoshi-v2/api/infrastructure/workers/metadata-enrich.worker"),
			import("@nanahoshi-v2/api/infrastructure/workers/ranobedb-import.worker"),
			import("@nanahoshi-v2/api/infrastructure/workers/send-to-kindle.worker"),
			import("@nanahoshi-v2/api/infrastructure/workers/scheduled-scan.worker"),
			import("@nanahoshi-v2/api/infrastructure/workers/recommendations.worker"),
			import("@nanahoshi-v2/api/infrastructure/workers/bookmeter-sync.worker"),
		]);

		workers = [
			fileEvent.fileEventWorker,
			coverIngest.coverIngestWorker,
			metadataEnrich.metadataEnrichWorker,
			ranobedbImport.ranobedbImportWorker,
			sendToKindle.sendToKindleWorker,
			scheduledScan.scheduledScanWorker,
			recommendations.recommendationsWorker,
			bookmeterSync.bookmeterSyncWorker,
		];

		workers.push(
			startMemoryPressureController([
				{ name: "file-event", worker: fileEvent.fileEventWorker },
				{ name: "cover-ingest", worker: coverIngest.coverIngestWorker },
			]),
		);

		// Seed/repair repeatable library scans from the DB.
		const { reconcileSchedules } = await import(
			"@nanahoshi-v2/api/modules/scanning/scheduled-scan.scheduler"
		);
		await reconcileSchedules().catch((err) =>
			logger.error({ err }, "[Workers] Failed to reconcile scan schedules"),
		);

		const { startLibraryWatchers } = await import(
			"@nanahoshi-v2/api/modules/scanning/library-watcher"
		);
		workers.push(
			await startLibraryWatchers().catch((err) => {
				logger.error({ err }, "[Workers] Failed to start library watchers");
				return { close: async () => {} };
			}),
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

		workers.push(await startTaskProgressListeners());
	},
	shutdown: async () => {
		// The shared Redis initializer closes the connection after every worker
		// and log-history initializer has flushed and stopped.
		await Promise.all(workers.map((w) => w.close()));
		workers = [];
		logger.info("Workers stopped");
	},
};
