import { coverIngestQueue } from "@nanahoshi/api/infrastructure/queue/queues/cover-ingest.queue";
import { fileEventQueue } from "@nanahoshi/api/infrastructure/queue/queues/file-event.queue";
import { startTaskProgressListeners } from "@nanahoshi/api/infrastructure/queue/task-progress.listener";
import { startForegroundQueuePriorityController } from "@nanahoshi/api/lib/foreground-queue-priority";
import { logger } from "@nanahoshi/api/lib/logger";
import { startMemoryPressureController } from "@nanahoshi/api/lib/memory-pressure-controller";
import type { RuntimeInitializer } from "./types";

// Only close() is needed; avoids a direct bullmq dependency in this package.
type Closable = { close: () => Promise<void> };

let workers: Closable[] = [];

export const workersInitializer: RuntimeInitializer = {
	name: "workers",
	initialize: async () => {
		const [
			databaseBackup,
			fileEvent,
			coverIngest,
			metadataEnrich,
			ranobedbImport,
			sendToKindle,
			scheduledScan,
			recommendations,
			bookmeterSync,
			readListenMatchAnalysis,
			readListenGeneration,
		] = await Promise.all([
			import("@nanahoshi/api/infrastructure/workers/database-backup.worker"),
			import("@nanahoshi/api/infrastructure/workers/file.event.worker"),
			import("@nanahoshi/api/infrastructure/workers/cover-ingest.worker"),
			import("@nanahoshi/api/infrastructure/workers/metadata-enrich.worker"),
			import("@nanahoshi/api/infrastructure/workers/ranobedb-import.worker"),
			import("@nanahoshi/api/infrastructure/workers/send-to-kindle.worker"),
			import("@nanahoshi/api/infrastructure/workers/scheduled-scan.worker"),
			import("@nanahoshi/api/infrastructure/workers/recommendations.worker"),
			import("@nanahoshi/api/infrastructure/workers/bookmeter-sync.worker"),
			import(
				"@nanahoshi/api/infrastructure/workers/read-listen-match-analysis.worker"
			),
			import(
				"@nanahoshi/api/infrastructure/workers/read-listen-generation.worker"
			),
		]);

		workers = [
			databaseBackup.databaseBackupWorker,
			fileEvent.fileEventWorker,
			coverIngest.coverIngestWorker,
			metadataEnrich.metadataEnrichWorker,
			ranobedbImport.ranobedbImportWorker,
			sendToKindle.sendToKindleWorker,
			scheduledScan.scheduledScanWorker,
			recommendations.recommendationsWorker,
			bookmeterSync.bookmeterSyncWorker,
			readListenMatchAnalysis.readListenMatchAnalysisWorker,
			readListenGeneration.readListenGenerationWorker,
		];

		workers.push(
			startMemoryPressureController([
				{
					name: "file-event",
					worker: fileEvent.fileEventWorker,
					maximumConcurrency: fileEvent.fileEventMaximumConcurrency,
					readJobCounts: () =>
						fileEventQueue.getJobCounts("active", "waiting", "prioritized"),
				},
				{
					name: "cover-ingest",
					worker: coverIngest.coverIngestWorker,
					readJobCounts: () =>
						coverIngestQueue.getJobCounts("active", "waiting", "prioritized"),
				},
			]),
		);
		workers.push(
			startForegroundQueuePriorityController({
				backgroundWorker: coverIngest.coverIngestWorker,
				readForegroundCounts: () =>
					fileEventQueue.getJobCounts("active", "waiting", "prioritized"),
			}),
		);

		const { getBackupConfig, syncBackupSchedule } = await import(
			"@nanahoshi/api/modules/database-backup/backups"
		);
		await syncBackupSchedule(await getBackupConfig()).catch((err) =>
			logger.error({ err }, "Failed to reconcile backup schedule"),
		);

		// Seed/repair repeatable library scans from the DB.
		const { reconcileSchedules } = await import(
			"@nanahoshi/api/modules/scanning/scheduled-scan.scheduler"
		);
		await reconcileSchedules().catch((err) =>
			logger.error({ err }, "[Workers] Failed to reconcile scan schedules"),
		);

		const { startLibraryWatchers } = await import(
			"@nanahoshi/api/modules/scanning/library-watcher"
		);
		workers.push(
			await startLibraryWatchers().catch((err) => {
				logger.error({ err }, "[Workers] Failed to start library watchers");
				return { close: async () => {} };
			}),
		);

		const { registerBookmeterSchedule } = await import(
			"@nanahoshi/api/modules/bookmeter/bookmeter.scheduler"
		);
		await registerBookmeterSchedule().catch((err) =>
			logger.error({ err }, "[Workers] Failed to register bookmeter schedule"),
		);

		const { reconcileRecommendationSchedules } = await import(
			"@nanahoshi/api/modules/recommendations/recommendation.scheduler"
		);
		await reconcileRecommendationSchedules().catch((err) =>
			logger.error(
				{ err },
				"[Workers] Failed to reconcile recommendation schedules",
			),
		);

		const { registerMetadataRetrySchedule } = await import(
			"@nanahoshi/api/modules/metadataRetry/metadata-retry.scheduler"
		);
		await registerMetadataRetrySchedule().catch((err) =>
			logger.error(
				{ err },
				"[Workers] Failed to register metadata retry schedule",
			),
		);

		workers.push(await startTaskProgressListeners());
		const { startInstanceActivityRetention } = await import(
			"@nanahoshi/api/routers/instance-activity/instance-activity.service"
		);
		workers.push(startInstanceActivityRetention());
	},
	shutdown: async () => {
		// The shared Redis initializer closes the connection after every worker
		// and log-history initializer has flushed and stopped.
		await Promise.all(workers.map((w) => w.close()));
		workers = [];
		logger.info("Workers stopped");
	},
};
