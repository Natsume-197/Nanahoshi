import {
	orgProcedure,
	protectedProcedure,
	requirePermission,
} from "../../index";
import {
	CreateInviteLinkInput,
	JoinInviteLinkInput,
	RevokeInviteLinkInput,
} from "./invite-link.model";
import { inviteLinkService } from "./invite-link.service";

export const inviteLinksRouter = {
	create: requirePermission("invitation", "create")
		.input(CreateInviteLinkInput)
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

	revoke: requirePermission("invitation", "revoke")
		.input(RevokeInviteLinkInput)
		.handler(async ({ input, context }) => {
			return await inviteLinkService.revokeLink(
				input.id,
				context.organizationId,
			);
		}),

	join: protectedProcedure
		.input(JoinInviteLinkInput)
		.handler(async ({ input, context }) => {
			return await inviteLinkService.joinViaLink({
				code: input.code,
				userId: context.session.user.id,
			});
		}),
};
