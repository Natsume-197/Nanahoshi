import { db } from "@nanahoshi-v2/db";
import { session, user } from "@nanahoshi-v2/db/schema/auth";
import {
	downloadDeliveryEvent,
	securityAuditEvent,
} from "@nanahoshi-v2/db/schema/general";
import { and, desc, eq, ilike, lt } from "drizzle-orm";

export class InstanceActivityRepository {
	listAudit(input: {
		outcome?: "success" | "failure";
		userId?: string;
		device?: string;
		serverId?: string;
		cursor?: number;
		limit: number;
	}) {
		return db
			.select()
			.from(securityAuditEvent)
			.where(
				and(
					input.outcome
						? eq(securityAuditEvent.outcome, input.outcome)
						: undefined,
					input.userId
						? eq(securityAuditEvent.subjectUserId, input.userId)
						: undefined,
					input.device
						? ilike(securityAuditEvent.device, `%${input.device}%`)
						: undefined,
					input.serverId
						? eq(securityAuditEvent.serverId, input.serverId)
						: undefined,
					input.cursor ? lt(securityAuditEvent.id, input.cursor) : undefined,
				),
			)
			.orderBy(desc(securityAuditEvent.id))
			.limit(input.limit + 1);
	}

	listDownloads(input: {
		userId?: string;
		device?: string;
		serverId?: string;
		limit: number;
	}) {
		return db
			.select()
			.from(downloadDeliveryEvent)
			.where(
				and(
					input.userId
						? eq(downloadDeliveryEvent.userId, input.userId)
						: undefined,
					input.device
						? ilike(downloadDeliveryEvent.device, `%${input.device}%`)
						: undefined,
					input.serverId
						? eq(downloadDeliveryEvent.serverId, input.serverId)
						: undefined,
				),
			)
			.orderBy(desc(downloadDeliveryEvent.id))
			.limit(input.limit);
	}

	async getSessionForRevocation(sessionId: string) {
		const [row] = await db
			.select({
				sessionId: session.id,
				userId: user.id,
				userName: user.name,
				userEmail: user.email,
				device: session.userAgent,
				ipAddress: session.ipAddress,
				serverId: session.activeOrganizationId,
			})
			.from(session)
			.innerJoin(user, eq(user.id, session.userId))
			.where(eq(session.id, sessionId))
			.limit(1);
		return row ?? null;
	}

	async deleteSession(sessionId: string): Promise<void> {
		await db.delete(session).where(eq(session.id, sessionId));
	}
}

export const instanceActivityRepository = new InstanceActivityRepository();
