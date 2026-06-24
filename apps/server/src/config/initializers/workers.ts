import { redis } from "@nanahoshi-v2/api/infrastructure/queue/redis";
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
		] = await Promise.all([
			import("@nanahoshi-v2/api/infrastructure/workers/file.event.worker"),
			import("@nanahoshi-v2/api/infrastructure/workers/cover-color.worker"),
			import("@nanahoshi-v2/api/infrastructure/workers/metadata-enrich.worker"),
			import("@nanahoshi-v2/api/infrastructure/workers/ranobedb-import.worker"),
			import("@nanahoshi-v2/api/infrastructure/workers/send-to-kindle.worker"),
		]);

		workers = [
			fileEvent.fileEventWorker,
			coverColor.coverColorWorker,
			metadataEnrich.metadataEnrichWorker,
			ranobedbImport.ranobedbImportWorker,
			sendToKindle.sendToKindleWorker,
		];

		// Only when the provider requires sync (Elasticsearch).
		if (getSearchProvider().requiresSync()) {
			const [syncMod, indexMod] = await Promise.all([
				import("@nanahoshi-v2/api/infrastructure/workers/search-sync.worker"),
				import("@nanahoshi-v2/api/infrastructure/workers/book.index.worker"),
			]);
			workers.push(syncMod.searchSyncWorker, indexMod.bookIndexWorker);
		}
	},
	shutdown: async () => {
		// Stop workers before closing the Redis connection they share.
		await Promise.all(workers.map((w) => w.close()));
		workers = [];
		await redis.quit().catch(() => {});
		logger.info("Workers stopped, Redis connection closed");
	},
};
