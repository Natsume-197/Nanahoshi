import { subscribeToRecommendationEvents } from "@nanahoshi-v2/api/modules/recommendations/recommendation.events";
import type { GatewayConnection, GatewayModule } from "./types";

// Live "your feed was recomputed" pushes. Routing is per userId (interest
// index in recommendation.events); the client invalidates its recommendation
// queries on receipt, so the debounced refresh-user job — which creates no
// task — still reaches the dashboard without a reload.
export const recommendationsModule: GatewayModule = {
	ns: "recs",

	connect(conn: GatewayConnection) {
		const unsubscribe = subscribeToRecommendationEvents(conn.userId, (event) =>
			conn.send("recs", event),
		);
		return { onClose: unsubscribe };
	},
};
