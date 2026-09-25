import { logger } from "@nanahoshi/api/lib/logger";
import { readListenService } from "@nanahoshi/api/routers/read-listen/read-listen.service";
import type { RuntimeInitializer } from "./types";

// Background: reading every older alignment must not delay worker startup.
export const readListenGapsInitializer: RuntimeInitializer = {
	name: "read-listen-gaps",
	initialize: () => {
		void readListenService
			.measureAlignmentGaps()
			.then((measured) => {
				if (measured > 0) {
					logger.info({ measured }, "[Server] Measured Read & Listen gaps");
				}
			})
			.catch((err) =>
				logger.warn({ err }, "[Server] Failed to measure Read & Listen gaps"),
			);
	},
};
