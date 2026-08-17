import {
	publishInstanceActivity,
	subscribeToInstanceActivity,
} from "@nanahoshi-v2/api/modules/instance-activity/playback.manager";
import { subscribeToSecurityAuditWrites } from "@nanahoshi-v2/auth/security-audit";
import type { GatewayConnection, GatewayModule } from "./types";

/** Instance-global operations stream; only the application owner may attach. */
let auditRelayStarted = false;

function ensureAuditRelay() {
	if (auditRelayStarted) return;
	auditRelayStarted = true;
	subscribeToSecurityAuditWrites(() =>
		publishInstanceActivity({ kind: "audit_changed" }),
	);
}

export const instanceActivityModule: GatewayModule = {
	ns: "instance-activity",

	connect(conn: GatewayConnection) {
		if (conn.role !== "admin") return {};
		ensureAuditRelay();
		const unsubscribe = subscribeToInstanceActivity((event) =>
			conn.send("instance-activity", event),
		);
		return { onClose: unsubscribe };
	},
};
