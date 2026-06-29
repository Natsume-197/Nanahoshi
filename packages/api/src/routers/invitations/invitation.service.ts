import { auth } from "@nanahoshi-v2/auth";
import { invitationRepository } from "./invitation.repository";

// Invite a member via Better Auth's createInvitation; pass the real request
// headers so BA can verify the session.
export const inviteMember = async (
	{
		email,
		role,
	}: {
		email: string;
		role: "member" | "admin";
	},
	serverId: string,
	headers: Headers,
) => {
	return await auth.api.createInvitation({
		body: {
			email,
			role,
			organizationId: serverId,
		},
		headers,
	});
};

// Cancel an invitation via Better Auth.
export const cancelInvitation = async (
	invitationId: string,
	headers: Headers,
) => {
	return await auth.api.cancelInvitation({
		body: { invitationId },
		headers,
	});
};

// List pending invitations for an org directly from Drizzle — avoids BA's
// empty-headers 401 issue.
export const listPendingInvitations = async (serverId: string) => {
	return await invitationRepository.listPending(serverId);
};

// List pending invitations sent to an email. Doesn't require an active org —
// used for the invitations page before a user has joined any org.
export const listMyInvitations = async (email: string) => {
	return await invitationRepository.listPendingForEmail(email);
};
