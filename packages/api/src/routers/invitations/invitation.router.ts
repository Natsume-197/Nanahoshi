import { z } from "zod";
import { orgProcedure } from "../../index";
import * as service from "./invitation.service";

export const invitationsRouter = {
	invite: orgProcedure
		.input(
			z.object({
				email: z.string().email("Valid email required"),
				role: z.enum(["member", "admin"]).default("member"),
			}),
		)
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
		.input(
			z.object({
				invitationId: z.string(),
			}),
		)
		.handler(async ({ input, context }) => {
			return await service.cancelInvitation(
				input.invitationId,
				context.req.headers,
			);
		}),
};
