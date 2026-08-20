import { recordSecurityAuditEvent } from "@nanahoshi-v2/auth/security-audit";
import { db } from "@nanahoshi-v2/db";
import {
	downloadDeliveryEvent,
	securityAuditEvent,
} from "@nanahoshi-v2/db/schema/general";
import { lt } from "drizzle-orm";
import { logger } from "../../lib/logger";
import {
	clearActivePlayback,
	listActivePlayback,
} from "../../modules/instance-activity/playback.manager";
import { publishSessionRevoked } from "../sessions/session.events";
import { instanceActivityRepository } from "./instance-activity.repository";

const log = logger.child({ component: "instance-activity" });
const RETENTION_MS = 90 * 24 * 60 * 60 * 1000;

export async function listInstanceActivity(input: {
	outcome?: "success" | "failure";
	userId?: string;
	device?: string;
	serverId?: string;
	cursor?: number;
	limit: number;
}) {
	const [activePlayback, auditRows, downloads] = await Promise.all([
		listActivePlayback(),
		instanceActivityRepository.listAudit(input),
		instanceActivityRepository.listDownloads({ limit: input.limit }),
	]);
	const rows = auditRows.slice(0, input.limit);
	return {
		activePlayback,
		audit: rows,
		downloads,
		nextCursor:
			auditRows.length > input.limit ? (rows.at(-1)?.id ?? null) : null,
	};
}

export async function revokeSession(input: {
	sessionId: string;
	actor: { id: string; name: string };
}): Promise<{ revoked: boolean }> {
	const target = await instanceActivityRepository.getSessionForRevocation(
		input.sessionId,
	);
	if (!target) return { revoked: false };

	await instanceActivityRepository.deleteSession(input.sessionId);
	await clearActivePlayback(input.sessionId).catch((err) =>
		log.error(
			{ err, sessionId: input.sessionId },
			"Failed to clear active playback",
		),
	);
	publishSessionRevoked(target.userId, target.sessionId);
	void recordSecurityAuditEvent({
		eventType: "session_revoked",
		outcome: "success",
		source: "web",
		actor: input.actor,
		subject: {
			id: target.userId,
			name: target.userName,
			identifier: target.userEmail,
		},
		sessionId: target.sessionId,
		device: target.device,
		ipAddress: target.ipAddress,
		server: target.serverId ? { id: target.serverId } : null,
	});
	return { revoked: true };
}

export async function purgeExpiredInstanceActivityEvents(): Promise<void> {
	const cutoff = new Date(Date.now() - RETENTION_MS).toISOString();
	try {
		await Promise.all([
			db
				.delete(securityAuditEvent)
				.where(lt(securityAuditEvent.createdAt, cutoff)),
			db
				.delete(downloadDeliveryEvent)
				.where(lt(downloadDeliveryEvent.createdAt, cutoff)),
		]);
	} catch (err) {
		log.error({ err, cutoff }, "Failed to purge expired instance activity");
	}
}

export function startInstanceActivityRetention(): {
	close: () => Promise<void>;
} {
	void purgeExpiredInstanceActivityEvents();
	const timer = setInterval(
		() => {
			void purgeExpiredInstanceActivityEvents();
		},
		24 * 60 * 60 * 1000,
	);
	return { close: async () => clearInterval(timer) };
}
