import { protectedProcedure, requirePermission } from "../../index";
import { CancelInvitationInput, InviteMemberInput } from "./invitation.model";
import * as service from "./invitation.service";

export const invitationsRouter = {
	// List invitations sent to the current user's email — no org required
	listMine: protectedProcedure.handler(async ({ context }) => {
		return await service.listMyInvitations(context.session.user.email);
	}),

	invite: requirePermission("member", "invite")
		.input(InviteMemberInput)
		.handler(async ({ input, context }) => {
			return await service.inviteMember(
				{ email: input.email, role: input.role },
				context.serverId,
				context.req.headers,
			);
		}),

	listPending: requirePermission("member", "invite").handler(
		async ({ context }) => {
			// Queries Drizzle directly — no auth HTTP round-trip needed
			return await service.listPendingInvitations(context.serverId);
		},
	),

	cancel: requirePermission("invitation", "revoke")
		.input(CancelInvitationInput)
		.handler(async ({ input, context }) => {
			return await service.cancelInvitation(
				input.invitationId,
				context.req.headers,
			);
		}),
};
