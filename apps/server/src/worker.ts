import os from "node:os";
import { logger } from "@nanahoshi-v2/api/lib/logger";
import {
	runtimeCpuCapacity,
	runtimeWorkerCpuBudget,
} from "@nanahoshi-v2/env/resources";
import {
	runInitializers,
	runShutdownInitializers,
	workerInitializers,
} from "./config/initializers";
import type { RuntimeContext } from "./config/initializers/types";

// Lower our own CPU priority (nice): under contention the OS gives the API,
// Postgres and the user's desktop CPU first. Concurrency is separately sized
// from the runtime CPU capacity, leaving roughly one quarter in reserve.
const WORKER_NICE = 10;
try {
	// Only ever lower priority; raising it needs privileges (EACCES).
	if (os.getPriority() < WORKER_NICE) os.setPriority(WORKER_NICE);
} catch (err) {
	logger.warn({ err }, "Could not lower worker process priority");
}

const cpuCapacity = runtimeCpuCapacity();
const workerCpuBudget = runtimeWorkerCpuBudget();
logger.info(
	{
		cpuCapacity,
		workerCpuBudget,
		reservedCpuCapacity: cpuCapacity - workerCpuBudget,
	},
	"Worker resource budget detected",
);

const context: RuntimeContext = {};

await runInitializers(context, workerInitializers);
logger.info("Worker process ready");

let shuttingDown = false;
for (const signal of ["SIGTERM", "SIGINT"] as const) {
	process.on(signal, async () => {
		if (shuttingDown) return;
		shuttingDown = true;
		logger.info(
			{ signal },
			"Received shutdown signal, shutting down gracefully",
		);
		try {
			await runShutdownInitializers(context, workerInitializers);
			logger.info("Shutdown complete");
			process.exit(0);
		} catch (err) {
			logger.error({ err }, "Error during shutdown");
			process.exit(1);
		}
	});
}
