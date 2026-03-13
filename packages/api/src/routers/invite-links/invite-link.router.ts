import { z } from "zod";
import { orgProcedure, protectedProcedure } from "../../index";
import { inviteLinkService } from "./invite-link.service";

export const inviteLinksRouter = {
	create: orgProcedure
		.input(
			z.object({
				role: z.enum(["member", "admin"]).default("member"),
				maxUses: z.number().int().positive().nullable().default(null),
				expiresIn: z.enum(["1d", "7d", "30d", "never"]).default("never"),
			}),
		)
		.handler(async ({ input, context }) => {
			const expiresAt: Date | null =
				input.expiresIn === "never"
					? null
					: new Date(
							Date.now() +
								(input.expiresIn === "1d"
									? 86400000
									: input.expiresIn === "7d"
										? 604800000
										: 2592000000),
						);

			return await inviteLinkService.createLink({
				organizationId: context.organizationId,
				role: input.role,
				maxUses: input.maxUses,
				expiresAt,
				createdBy: context.session.user.id,
			});
		}),

	list: orgProcedure.handler(async ({ context }) => {
		return await inviteLinkService.listLinks(context.organizationId);
	}),

	revoke: orgProcedure
		.input(z.object({ id: z.string() }))
		.handler(async ({ input, context }) => {
			return await inviteLinkService.revokeLink(
				input.id,
				context.organizationId,
			);
		}),

	join: protectedProcedure
		.input(z.object({ code: z.string() }))
		.handler(async ({ input, context }) => {
			return await inviteLinkService.joinViaLink({
				code: input.code,
				userId: context.session.user.id,
			});
		}),
};
