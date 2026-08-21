import { logger } from "@nanahoshi-v2/api/lib/logger";
import { env } from "@nanahoshi-v2/env/server";
import { buildApp } from "./app";
import { prepareClientIpRequest } from "./config/client-ip-request";
import { withHttpRequestLimits } from "./config/http-options";
import {
	runInitializers,
	runShutdownInitializers,
	serverInitializers,
} from "./config/initializers";
import type { RuntimeContext } from "./config/initializers/types";
import { websocket } from "./gateway/gateway";

const app = buildApp();
const context: RuntimeContext = { app };
const trustedProxyIps = new Set(
	env.TRUSTED_PROXY_IPS.split(",")
		.map((ip) => ip.trim())
		.filter(Boolean),
);

await runInitializers(context, serverInitializers);

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
			await runShutdownInitializers(context, serverInitializers);
			logger.info("Shutdown complete");
			process.exit(0);
		} catch (err) {
			logger.error({ err }, "Error during shutdown");
			process.exit(1);
		}
	});
}

export default withHttpRequestLimits({
	fetch(request: Request, server: Bun.Server<unknown>) {
		const peer = server.requestIP(request);
		return app.fetch(
			prepareClientIpRequest(request, peer?.address, trustedProxyIps),
			server,
		);
	},
	websocket,
});
