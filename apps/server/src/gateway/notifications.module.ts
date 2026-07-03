import { subscribeToNotifications } from "@nanahoshi-v2/api/routers/notifications/notification.events";
import type { GatewayConnection, GatewayModule } from "./types";

// Live notification pushes (new/read/read_all/delete/refresh). Routing is per
// recipient userId (interest index in notification.events), so this module
// just forwards the user's own events — every tab stays in sync.
export const notificationsModule: GatewayModule = {
	ns: "notifications",

	connect(conn: GatewayConnection) {
		const unsubscribe = subscribeToNotifications(conn.userId, (event) =>
			conn.send("notifications", event),
		);
		return { onClose: unsubscribe };
	},
};
