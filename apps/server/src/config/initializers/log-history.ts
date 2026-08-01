import {
	startSharedLogHistory,
	stopSharedLogHistory,
} from "@nanahoshi-v2/api/lib/shared-log-history";
import type { RuntimeInitializer } from "./types";

export const logHistoryInitializer: RuntimeInitializer = {
	name: "log-history",
	initialize: startSharedLogHistory,
	shutdown: stopSharedLogHistory,
};
