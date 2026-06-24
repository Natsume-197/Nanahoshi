import { orgProcedure, protectedProcedure } from "../../index";
import { CancelInvitationInput, InviteMemberInput } from "./invitation.model";
import * as service from "./invitation.service";

export const invitationsRouter = {
	// List invitations sent to the current user's email — no org required
	listMine: protectedProcedure.handler(async ({ context }) => {
		return await service.listMyInvitations(context.session.user.email);
	}),

	invite: orgProcedure
		.input(InviteMemberInput)
		.handler(async ({ input, context }) => {
			return await service.inviteMember(
				{ email: input.email, role: input.role },
				context.organizationId,
				context.req.headers,
			);
		}),

	listPending: orgProcedure.handler(async ({ context }) => {
		// Queries Drizzle directly — no auth HTTP round-trip needed
		return await service.listPendingInvitations(context.organizationId);
	}),

	cancel: orgProcedure
		.input(CancelInvitationInput)
		.handler(async ({ input, context }) => {
			return await service.cancelInvitation(
				input.invitationId,
				context.req.headers,
			);
		}),
};
