import { hasGlobal } from "../../auth/access.service";
import { ForbiddenError } from "../../errors";
import {
	orgReadProcedure,
	protectedProcedure,
	publicProcedure,
	requirePermission,
} from "../../index";
import {
	CreateInviteLinkInput,
	DeleteInviteLinkInput,
	JoinInviteLinkInput,
	PreviewInviteLinkInput,
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
				serverId: context.serverId,
				role: input.role,
				maxUses: input.maxUses,
				expiresAt,
				createdBy: context.session.user.id,
			});
		}),

	list: orgReadProcedure.handler(async ({ context }) => {
		if (
			!hasGlobal(context.pc, "invitation", "create") &&
			!hasGlobal(context.pc, "invitation", "revoke")
		) {
			throw new ForbiddenError(
				"Missing permission: invitation:create or invitation:revoke",
			);
		}
		return await inviteLinkService.listLinks(context.serverId);
	}),

	delete: requirePermission("invitation", "revoke")
		.input(DeleteInviteLinkInput)
		.handler(async ({ input, context }) => {
			return await inviteLinkService.deleteLink(input.id, context.serverId);
		}),

	preview: publicProcedure
		.input(PreviewInviteLinkInput)
		.handler(async ({ input, context }) => {
			return await inviteLinkService.previewLink({
				code: input.code,
				userId: context.session?.user.id,
			});
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
