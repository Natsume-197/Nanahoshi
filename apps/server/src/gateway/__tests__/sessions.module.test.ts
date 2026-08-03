import { describe, expect, mock, test } from "bun:test";
import type { SessionsRevokedEvent } from "@nanahoshi-v2/api/routers/sessions/session.events";
import type { GatewayConnection } from "../types";

let subscriber: ((event: SessionsRevokedEvent) => void) | undefined;

mock.module("@nanahoshi-v2/api/routers/sessions/session.events", () => ({
	subscribeToSessionRevocations: (
		_userId: string,
		callback: (event: SessionsRevokedEvent) => void,
	) => {
		subscriber = callback;
		return () => {};
	},
}));

const { sessionsModule } = await import("../sessions.module");

function connection(sessionId: string) {
	const send = mock(() => {});
	const conn: GatewayConnection = {
		userId: "user-1",
		sessionId,
		serverId: "",
		role: null,
		connId: `connection-${sessionId}`,
		send,
		close: () => {},
	};
	return { conn, send };
}

describe("sessions gateway module", () => {
	test("forwards revocation to a different session", () => {
		const { conn, send } = connection("session-2");
		sessionsModule.connect(conn);

		subscriber?.({
			kind: "sessions_revoked",
			initiatorSessionId: "session-1",
		});

		expect(send).toHaveBeenCalledWith("sessions", {
			kind: "sessions_revoked",
			initiatorSessionId: "session-1",
		});
	});

	test("does not echo revocation to the initiating session", () => {
		const { conn, send } = connection("session-1");
		sessionsModule.connect(conn);

		subscriber?.({
			kind: "sessions_revoked",
			initiatorSessionId: "session-1",
		});

		expect(send).not.toHaveBeenCalled();
	});
});
