import { db } from "@nanahoshi-v2/db";
import { securityAuditEvent } from "@nanahoshi-v2/db/schema/general";

export type SecurityAuditSource = "web" | "oauth" | "opds" | "api";
export type SecurityAuditOutcome = "success" | "failure";

export interface SecurityAuditInput {
	eventType:
		| "sign_in"
		| "sign_out"
		| "session_revoked"
		| "password_changed"
		| "role_changed";
	outcome: SecurityAuditOutcome;
	source: SecurityAuditSource;
	actor?: { id: string; name?: string | null } | null;
	subject?: {
		id: string;
		name?: string | null;
		identifier?: string | null;
	} | null;
	subjectIdentifier?: string | null;
	sessionId?: string | null;
	device?: string | null;
	ipAddress?: string | null;
	server?: { id: string; name?: string | null } | null;
	details?: Record<string, unknown>;
}

const auditSubscribers = new Set<() => void>();

/** Same-process notification used by the server gateway after a durable write. */
export function subscribeToSecurityAuditWrites(
	callback: () => void,
): () => void {
	auditSubscribers.add(callback);
	return () => auditSubscribers.delete(callback);
}

/**
 * Security auditing is deliberately best effort. Losing audit storage must
 * never prevent a person from authenticating or ending a session; operators
 * still get a structured server error with enough metadata to investigate.
 */
export async function recordSecurityAuditEvent(
	input: SecurityAuditInput,
): Promise<void> {
	try {
		await db.insert(securityAuditEvent).values({
			eventType: input.eventType,
			outcome: input.outcome,
			source: input.source,
			actorUserId: input.actor?.id ?? null,
			actorName: input.actor?.name ?? null,
			subjectUserId: input.subject?.id ?? null,
			subjectName: input.subject?.name ?? null,
			subjectIdentifier:
				input.subject?.identifier ?? input.subjectIdentifier ?? null,
			sessionId: input.sessionId ?? null,
			device: input.device ?? null,
			ipAddress: input.ipAddress ?? null,
			serverId: input.server?.id ?? null,
			serverName: input.server?.name ?? null,
			details: input.details ?? {},
		});
		for (const callback of auditSubscribers) callback();
	} catch (err) {
		console.error({
			component: "security-audit",
			event: "write_failed",
			eventType: input.eventType,
			source: input.source,
			err,
		});
	}
}

export function getAuditRequestMetadata(headers: Headers): {
	ipAddress: string | null;
	device: string | null;
} {
	// Deployment proxy is the authority for x-forwarded-for. Keep the complete
	// value requested by the product rather than deriving a location from it.
	return {
		ipAddress: headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
		device: headers.get("user-agent"),
	};
}
