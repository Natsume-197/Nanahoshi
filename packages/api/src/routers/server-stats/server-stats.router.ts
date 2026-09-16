import { requirePermission } from "../../index";
import { getCachedStats } from "./server-stats.service";

export const serverStatsRouter = {
	get: requirePermission("settings", "read").handler(async ({ context }) => {
		return getCachedStats(context.serverId);
	}),
};
