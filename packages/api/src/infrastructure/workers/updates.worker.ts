import { type Job, Worker } from "bullmq";
import { logger } from "../../lib/logger";
import {
	checkForUpdates,
	runUpdateTick,
} from "../../routers/updates/update.service";
import { redis } from "../queue/redis";

const log = logger.child({ component: "updates-worker" });

export const updatesWorker = new Worker(
	"updates",
	async (job: Job) => {
		if (job.name === "check") {
			await checkForUpdates();
			return;
		}
		if (job.name === "tick") await runUpdateTick();
	},
	{ connection: redis, concurrency: 1 },
);
updatesWorker.on("failed", (job, err) =>
	log.error({ err, job: job?.name }, "Update job failed"),
);
