import { getUserPermissionContext } from "@nanahoshi-v2/api/auth/access.repository";
import {
	subscribeToTasks,
	type TaskScope,
} from "@nanahoshi-v2/api/modules/taskManager";
import type { GatewayConnection, GatewayModule } from "./types";

// Live task/scan progress over the gateway. subscribeToTasks applies
// taskVisibleTo per event: server owners/administrators receive every task of
// their server, a regular member only their own (e.g. send-to-kindle), app
// owners also the global ones. Permissions are resolved once per connection —
// a role change applies on the next reconnect.
export const tasksModule: GatewayModule = {
	ns: "tasks",

	async connect(conn: GatewayConnection) {
		const isAppOwner = conn.role === "admin";
		const serverId = conn.serverId || null;
		let isServerAdmin = false;
		if (serverId) {
			const pc = await getUserPermissionContext(conn.userId, serverId, {
				isAppOwner,
			});
			isServerAdmin = pc.isOrgOwner || pc.hasAdministrator;
		}
		const scope: TaskScope = {
			serverId,
			isAppOwner,
			isServerAdmin,
			userId: conn.userId,
		};
		const unsubscribe = subscribeToTasks(scope, (task) =>
			conn.send("tasks", task),
		);
		return { onClose: unsubscribe };
	},
};
