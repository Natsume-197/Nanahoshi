import { subscribeToTrayEvents } from "@nanahoshi/api/modules/metadataEnrichment/tray.events";
import type { GatewayConnection, GatewayModule } from "./types";

// Live metadata-tray updates. Routed per serverId; the client refetches its own
// permission-scoped tray queries on receipt, so rows and counts follow the
// worker without polling.
export const trayModule: GatewayModule = {
	ns: "tray",

	connect(conn: GatewayConnection) {
		if (!conn.serverId) return {};
		const unsubscribe = subscribeToTrayEvents(conn.serverId, (event) =>
			conn.send("tray", event),
		);
		return { onClose: unsubscribe };
	},
};
