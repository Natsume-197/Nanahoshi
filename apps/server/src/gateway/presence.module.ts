import * as presence from "@nanahoshi-v2/api/modules/presence/presenceManager";
import { followRepository } from "@nanahoshi-v2/api/routers/follow/follow.repository";
import type { GatewayConnection, GatewayModule } from "./types";

export const presenceModule: GatewayModule = {
	ns: "presence",

	async connect(conn: GatewayConnection) {
		// Mirror the DB status into Redis, then register. getStatus must resolve
		// first (heartbeatOnline honors invisible); the rest is independent, so
		// run it concurrently to keep connect latency to two round-trips.
		const status = await followRepository.getStatus(conn.userId);
		const [, , friendIds] = await Promise.all([
			presence.syncStatus(conn.userId, status),
			presence.heartbeatOnline(conn.userId, conn.connId, status),
			conn.serverId
				? followRepository.getFriendIds(conn.userId, conn.serverId)
				: Promise.resolve<string[]>([]),
		]);

		// The interest index routes each event only to this user's followers, so
		// the stream just forwards whatever it's handed.
		const subscription = presence.subscribeToPresence(friendIds, (event) =>
			conn.send("presence", event),
		);

		// React instantly when this user's friend set changes (someone followed
		// them back / unfollowed): re-point the live routing and nudge the client
		// to refetch its panel.
		const unsubscribeFriends = presence.subscribeToFriendsChanged(
			conn.userId,
			async () => {
				if (!conn.serverId) return;
				subscription.update(
					await followRepository.getFriendIds(conn.userId, conn.serverId),
				);
				conn.send("friends", null);
			},
		);

		return {
			// Keep the online key warm; getStatus is re-read inside so a mid-session
			// invisible toggle is honored.
			onTick: () => presence.heartbeatOnline(conn.userId, conn.connId),
			onClose: () => {
				subscription.close();
				unsubscribeFriends();
				presence.clearConnection(conn.userId, conn.connId).catch(() => {});
			},
		};
	},
};
