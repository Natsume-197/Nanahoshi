import { logger } from "@nanahoshi-v2/api/lib/logger";
import { capabilitiesInitializer } from "./capabilities";
import { databaseInitializer } from "./database";
import { ranobedbInitializer } from "./ranobedb";
import { searchInitializer } from "./search";
import type { RuntimeContext, RuntimeInitializer } from "./types";
import { workersInitializer } from "./workers";

// Ordered: data before search/workers; workers last (they depend on the rest).
const initializers: RuntimeInitializer[] = [
	databaseInitializer,
	searchInitializer,
	capabilitiesInitializer,
	ranobedbInitializer,
	workersInitializer,
];

export async function runInitializers(context: RuntimeContext): Promise<void> {
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
