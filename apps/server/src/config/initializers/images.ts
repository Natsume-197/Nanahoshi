import { configureImageConcurrency } from "@nanahoshi-v2/api/lib/image-concurrency";
import { logger } from "@nanahoshi-v2/api/lib/logger";
import { env } from "@nanahoshi-v2/env/server";
import type { RuntimeInitializer } from "./types";

/**
 * libvips defaults to a single thread here, which caps every resize and encode
 * in the app at one core. Both processes decode images — the worker to ingest
 * and warm covers, the API to answer a narrow rendition inline — so both set
 * their own share.
 */
export const imagesInitializer: RuntimeInitializer = {
	name: "images",
	initialize: () => {
		const role = env.PROCESS_ROLE;
		const threads = configureImageConcurrency(role);
		logger.info({ role, threads }, "libvips thread pool configured");
	},
};
