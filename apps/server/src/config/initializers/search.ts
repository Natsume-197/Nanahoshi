import { getSearchProvider } from "@nanahoshi-v2/api/infrastructure/search/search.factory";
import { logger } from "@nanahoshi-v2/api/lib/logger";
import type { RuntimeInitializer } from "./types";

export const searchInitializer: RuntimeInitializer = {
	name: "search",
	initialize: async () => {
		await getSearchProvider()
			.initialize()
			.catch((err: unknown) => {
				logger.warn(
					{ err },
					"[Search] Failed to initialize search provider on startup",
				);
			});
	},
};
