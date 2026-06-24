import { logger } from "@nanahoshi-v2/api/lib/logger";
import { syncRanobedbAutoUpdate } from "@nanahoshi-v2/api/modules/ranobedb/ranobedb.import";
import { getRanobedbConfig } from "@nanahoshi-v2/api/routers/settings/settings.service";
import type { RuntimeInitializer } from "./types";

export const ranobedbInitializer: RuntimeInitializer = {
	name: "ranobedb",
	initialize: async () => {
		await getRanobedbConfig()
			.then((config) => syncRanobedbAutoUpdate(config.autoUpdate))
			.catch((err) =>
				logger.warn(
					{ err },
					"[Server] Failed to sync RanobeDB auto-update schedule",
				),
			);
	},
};
