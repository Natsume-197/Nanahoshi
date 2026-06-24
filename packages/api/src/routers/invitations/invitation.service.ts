import { auth } from "@nanahoshi-v2/auth";
import { invitationRepository } from "./invitation.repository";

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
	return await invitationRepository.listPending(organizationId);
};

/**
 * List pending invitations sent to the given email address.
 * Does NOT require an active organization — used for the user-facing
 * invitations page before a user has joined any org.
 */
export const listMyInvitations = async (email: string) => {
	return await invitationRepository.listPendingForEmail(email);
};
