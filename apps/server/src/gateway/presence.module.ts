import * as presence from "@nanahoshi-v2/api/modules/presence/presenceManager";
import { rosterHub } from "@nanahoshi-v2/api/modules/presence/rosterHub";
import { presenceRepository } from "@nanahoshi-v2/api/routers/presence/presence.repository";
import type { GatewayConnection, GatewayModule } from "./types";

export const presenceModule: GatewayModule = {
	ns: "presence",

	async connect(conn: GatewayConnection) {
		// Mirror the DB status into Redis, then register. getStatus must resolve
		// first (heartbeatOnline honors invisible); the rest is independent, so
		// run it concurrently to keep connect latency to two round-trips.
		const status = await presenceRepository.getStatus(conn.userId);
		// The hub holds one shared roster subscription + refresh loop per server;
		// this connection just plugs its sinks in and unplugs on close.
		const [, , leaveRoster] = await Promise.all([
			presence.syncStatus(conn.userId, status),
			presence.heartbeatOnline(conn.userId, conn.connId, status),
			conn.serverId
				? rosterHub.join(conn.serverId, {
						onPresence: (event) => conn.send("presence", event),
						onRosterChanged: () => conn.send("members", null),
					})
				: Promise.resolve(null),
		]);

		return {
			// Keep the online key warm; getStatus is re-read inside so a mid-session
			// invisible toggle is honored.
			onTick: () => presence.heartbeatOnline(conn.userId, conn.connId),
			onClose: () => {
				leaveRoster?.();
				presence.clearConnection(conn.userId, conn.connId).catch(() => {});
			},
		};
	},
};
