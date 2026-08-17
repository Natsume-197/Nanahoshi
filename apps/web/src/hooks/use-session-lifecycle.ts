import { useCallback, useRef } from "react";
import { useCompleteSignOut } from "@/hooks/use-complete-sign-out";
import { useDocumentEvent } from "@/hooks/use-document-event";
import { useMountEffect } from "@/hooks/use-mount-effect";
import { useWindowEvent } from "@/hooks/use-window-event";
import { authClient } from "@/lib/auth-client";
import { useGatewayChannel } from "@/lib/gateway/use-gateway-channel";
import { SESSION_UNAUTHORIZED_EVENT } from "@/lib/session-events";

type SessionsRevokedEvent =
	| { kind: "sessions_revoked" }
	| { kind: "session_revoked" };

function isSessionsRevokedEvent(data: unknown): data is SessionsRevokedEvent {
	return (
		typeof data === "object" &&
		data !== null &&
		"kind" in data &&
		(data.kind === "sessions_revoked" || data.kind === "session_revoked")
	);
}

/**
 * Keeps the five-minute cookie cache for normal traffic while handling the two
 * moments that must be authoritative: a pushed revocation and app resume.
 */
export function useSessionLifecycle() {
	const completeSignOut = useCompleteSignOut();
	const signingOutRef = useRef(false);
	const validatingRef = useRef(false);

	const signOutLocally = useCallback(async () => {
		if (signingOutRef.current) return;
		signingOutRef.current = true;
		try {
			// The server session may already be gone. signOut still expires both
			// HttpOnly Better Auth cookies in this browser.
			await authClient.signOut();
		} finally {
			await completeSignOut();
		}
	}, [completeSignOut]);

	const validateAuthoritatively = useCallback(async () => {
		if (validatingRef.current || signingOutRef.current) return;
		validatingRef.current = true;
		try {
			const result = await authClient.getSession({
				query: { disableCookieCache: true },
			});
			if (!result.error && !result.data) await signOutLocally();
		} finally {
			validatingRef.current = false;
		}
	}, [signOutLocally]);

	useGatewayChannel("sessions", (data) => {
		if (isSessionsRevokedEvent(data)) void signOutLocally();
	});

	useMountEffect(() => {
		void validateAuthoritatively();
	});
	useWindowEvent("focus", () => {
		void validateAuthoritatively();
	});
	useWindowEvent(SESSION_UNAUTHORIZED_EVENT, () => {
		void signOutLocally();
	});
	useDocumentEvent("visibilitychange", () => {
		if (document.visibilityState === "visible") {
			void validateAuthoritatively();
		}
	});
}
