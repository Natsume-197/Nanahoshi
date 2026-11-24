import { subscribeToUpdates } from "@nanahoshi/api/modules/updates/update.events";
import type { GatewayConnection, GatewayModule } from "./types";

// "Update state changed": a planned restart, a finished check, the updater's
// progress. Every signed-in client refetches its own view (members see only
// the restart notice), so the event itself carries nothing.
export const updatesModule: GatewayModule = {
	ns: "updates",

	connect(conn: GatewayConnection) {
		const unsubscribe = subscribeToUpdates((event) =>
			conn.send("updates", event),
		);
		return { onClose: unsubscribe };
	},
};
