import { subscribeToSessionRevocations } from "@nanahoshi-v2/api/routers/sessions/session.events";
import type { GatewayConnection, GatewayModule } from "./types";

export const sessionsModule: GatewayModule = {
	ns: "sessions",

	connect(conn: GatewayConnection) {
		const unsubscribe = subscribeToSessionRevocations(conn.userId, (event) => {
			if (event.initiatorSessionId !== conn.sessionId) {
				conn.send("sessions", event);
			}
		});
		return { onClose: unsubscribe };
	},
};
