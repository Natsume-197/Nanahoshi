import { auth } from "@nanahoshi-v2/auth";
import { db } from "@nanahoshi-v2/db";
import { invitation, organization } from "@nanahoshi-v2/db/schema/auth";
import { and, eq } from "drizzle-orm";

/**
 * Invite a member via Better Auth's createInvitation.
 * We pass the real request headers so BA can verify the session.
 */
export const inviteMember = async (
	{
		email,
		role,
	}: {
		email: string;
		role: "member" | "admin";
	},
	organizationId: string,
	headers: Headers,
) => {
	return await auth.api.createInvitation({
		body: {
			email,
			role,
			organizationId,
		},
		headers,
	});
};

/**
 * Cancel an invitation via Better Auth.
 */
export const cancelInvitation = async (
	invitationId: string,
	headers: Headers,
) => {
	return await auth.api.cancelInvitation({
		body: { invitationId },
		headers,
	});
};

/**
 * List pending invitations for an org directly from Drizzle — no BA HTTP call
 * needed so we avoid the empty-headers 401 issue.
 */
export const listPendingInvitations = async (organizationId: string) => {
	return await db
		.select()
		.from(invitation)
		.where(
			and(
				eq(invitation.organizationId, organizationId),
				eq(invitation.status, "pending"),
			),
		);
};

/**
 * List pending invitations sent to the given email address.
 * Does NOT require an active organization — used for the user-facing
 * invitations page before a user has joined any org.
 */
export const listMyInvitations = async (email: string) => {
	const rows = await db
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
	return rows;
};
