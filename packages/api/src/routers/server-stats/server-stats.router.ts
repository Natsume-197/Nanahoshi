import { requirePermission } from "../../index";
import { serverStatsRepository } from "./server-stats.repository";

export const serverStatsRouter = {
	get: requirePermission("settings", "read").handler(async ({ context }) => {
		return serverStatsRepository.getStats(context.serverId);
	}),
};
