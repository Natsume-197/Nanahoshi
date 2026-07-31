import { logger } from "@nanahoshi-v2/api/lib/logger";
import { capabilitiesInitializer } from "./capabilities";
import { databaseInitializer } from "./database";
import { imagesInitializer } from "./images";
import { ranobedbInitializer } from "./ranobedb";
import { redisInitializer } from "./redis";
import { searchInitializer } from "./search";
import type { RuntimeContext, RuntimeInitializer } from "./types";
import { workersInitializer } from "./workers";

// The app runs as two processes sharing Postgres/Redis: the API process
// (HTTP + websockets) and the worker process (BullMQ jobs). Keeping the
// workers out of the API process keeps its event loop free during heavy
// scans, so the UI never lags behind background work.

// Ordered: redis first so its shutdown runs last (shutdown is reversed).
export const serverInitializers: RuntimeInitializer[] = [
	redisInitializer,
	imagesInitializer,
	databaseInitializer,
	searchInitializer,
	capabilitiesInitializer,
];

// Workers last (they depend on the rest); ranobedb schedules background
// imports, so it belongs to this process.
export const workerInitializers: RuntimeInitializer[] = [
	imagesInitializer,
	databaseInitializer,
	searchInitializer,
	capabilitiesInitializer,
	ranobedbInitializer,
	workersInitializer,
];

export async function runInitializers(
	context: RuntimeContext,
	initializers: RuntimeInitializer[],
): Promise<void> {
	for (const initializer of initializers) {
		logger.info(
			{ initializer: initializer.name },
			"Initializing runtime component",
		);
		await initializer.initialize(context);
	}
}

export async function runShutdownInitializers(
	context: RuntimeContext,
	initializers: RuntimeInitializer[],
): Promise<void> {
	for (const initializer of [...initializers].reverse()) {
		if (!initializer.shutdown) continue;
		logger.info(
			{ initializer: initializer.name },
			"Shutting down runtime component",
		);
		await initializer.shutdown(context);
	}
}
