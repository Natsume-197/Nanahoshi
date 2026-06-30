import {
	subscribeToTasks,
	type TaskScope,
} from "@nanahoshi-v2/api/modules/taskManager";
import type { GatewayConnection, GatewayModule } from "./types";

// Live task/scan progress over the gateway (was a dedicated SSE route). The
// interest index in taskManager routes each task event only to the connections
// that can see it (same server, or app owners for global tasks), so this module
// just forwards whatever it's handed.
export const tasksModule: GatewayModule = {
	ns: "tasks",

	connect(conn: GatewayConnection) {
		const scope: TaskScope = {
			serverId: conn.serverId || null,
			isAppOwner: conn.role === "admin",
		};
		const unsubscribe = subscribeToTasks(scope, (task) =>
			conn.send("tasks", task),
		);
		return { onClose: unsubscribe };
	},
};
