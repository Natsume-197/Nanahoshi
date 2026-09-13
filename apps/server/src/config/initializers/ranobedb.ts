import { logger } from "@nanahoshi/api/lib/logger";
import { syncRanobedbAutoUpdate } from "@nanahoshi/api/modules/ranobedb/ranobedb.import";
import { getRanobedbDumpConfig } from "@nanahoshi/api/routers/settings/settings.service";
import type { RuntimeInitializer } from "./types";

export const ranobedbInitializer: RuntimeInitializer = {
	name: "ranobedb",
	initialize: async () => {
		await getRanobedbDumpConfig()
			.then((config) => syncRanobedbAutoUpdate(config.autoUpdate))
			.catch((err) =>
				logger.warn(
					{ err },
					"[Server] Failed to sync RanobeDB auto-update schedule",
				),
			);
	},
};
