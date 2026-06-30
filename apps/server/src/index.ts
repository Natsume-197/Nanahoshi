import { logger } from "@nanahoshi-v2/api/lib/logger";
import { buildApp } from "./app";
import {
	runInitializers,
	runShutdownInitializers,
} from "./config/initializers";
import type { RuntimeContext } from "./config/initializers/types";
import { websocket } from "./gateway/gateway";

export { apiHandler, rpcHandler } from "./routes/orpc";

const app = buildApp();
const context: RuntimeContext = { app };

await runInitializers(context);

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
			await runShutdownInitializers(context);
			logger.info("Shutdown complete");
			process.exit(0);
		} catch (err) {
			logger.error({ err }, "Error during shutdown");
			process.exit(1);
		}
	});
}

export default { fetch: app.fetch, websocket };
