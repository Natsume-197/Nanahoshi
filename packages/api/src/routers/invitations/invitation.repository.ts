import { db } from "@nanahoshi-v2/db";
import { invitation, organization } from "@nanahoshi-v2/db/schema/auth";
import { and, eq } from "drizzle-orm";

export class InvitationRepository {
	async listPending(organizationId: string) {
		return db
			.select()
			.from(invitation)
			.where(
				and(
					eq(invitation.organizationId, organizationId),
					eq(invitation.status, "pending"),
				),
			);
	}

	async listPendingForEmail(email: string) {
		return db
			.select({
				id: invitation.id,
				email: invitation.email,
				role: invitation.role,
				status: invitation.status,
				expiresAt: invitation.expiresAt,
				organizationId: invitation.organizationId,
				organizationName: organization.name,
			})
			.from(invitation)
			.innerJoin(organization, eq(invitation.organizationId, organization.id))
			.where(
				and(
					eq(invitation.email, email.toLowerCase()),
					eq(invitation.status, "pending"),
				),
			);
	}
}

export const invitationRepository = new InvitationRepository();
