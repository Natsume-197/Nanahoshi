import { redis } from "@nanahoshi-v2/api/infrastructure/queue/redis";
import { logger } from "@nanahoshi-v2/api/lib/logger";
import type { RuntimeInitializer } from "./types";

// Shutdown-only: the API process shares one Redis connection across queues,
// pub/sub and the task manager; close it after everything else shut down.
// (The worker process closes its own connection in workersInitializer.)
export const redisInitializer: RuntimeInitializer = {
	name: "redis",
	initialize: () => {},
	shutdown: async () => {
		await redis.quit().catch(() => {});
		logger.info("Redis connection closed");
	},
};
