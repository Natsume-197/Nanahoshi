import "@/test-utils/setup-dom";
import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { cleanup, render, waitFor } from "@testing-library/react";

let gatewayHandler: ((data: unknown) => void) | undefined;
let authoritativeSession: object | null = {};

const completeSignOut = mock(async () => {});
const signOut = mock(async () => {});
const getSession = mock(async () => ({
	data: authoritativeSession,
	error: null,
}));

mock.module("@/hooks/use-complete-sign-out", () => ({
	useCompleteSignOut: () => completeSignOut,
}));
mock.module("@/lib/auth-client", () => ({
	authClient: { getSession, signOut },
}));
mock.module("@/lib/gateway/use-gateway-channel", () => ({
	useGatewayChannel: (_ns: string, onMessage: (data: unknown) => void) => {
		gatewayHandler = onMessage;
	},
}));

const { useSessionLifecycle } = await import("../use-session-lifecycle");

function Harness() {
	useSessionLifecycle();
	return null;
}

beforeEach(() => {
	authoritativeSession = {};
	gatewayHandler = undefined;
	completeSignOut.mockClear();
	signOut.mockClear();
	getSession.mockClear();
});

afterEach(cleanup);

describe("useSessionLifecycle", () => {
	it("signs out immediately when another session revokes the account", async () => {
		render(<Harness />);
		await waitFor(() => expect(getSession).toHaveBeenCalledTimes(1));

		gatewayHandler?.({ kind: "sessions_revoked", initiatorSessionId: "other" });

		await waitFor(() => {
			expect(signOut).toHaveBeenCalledTimes(1);
			expect(completeSignOut).toHaveBeenCalledTimes(1);
		});
	});

	it("bypasses the cookie cache when the app regains focus", async () => {
		render(<Harness />);
		await waitFor(() => expect(getSession).toHaveBeenCalledTimes(1));
		authoritativeSession = null;

		window.dispatchEvent(new window.Event("focus"));

		await waitFor(() => {
			expect(getSession).toHaveBeenCalledTimes(2);
			expect(getSession).toHaveBeenLastCalledWith({
				query: { disableCookieCache: true },
			});
			expect(completeSignOut).toHaveBeenCalledTimes(1);
		});
	});

	it("signs out when an API request reports an unauthorized session", async () => {
		render(<Harness />);
		await waitFor(() => expect(getSession).toHaveBeenCalledTimes(1));

		window.dispatchEvent(new window.Event("nanahoshi:session-unauthorized"));

		await waitFor(() => {
			expect(signOut).toHaveBeenCalledTimes(1);
			expect(completeSignOut).toHaveBeenCalledTimes(1);
		});
	});
});
