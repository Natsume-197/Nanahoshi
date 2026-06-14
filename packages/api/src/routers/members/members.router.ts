import { z } from "zod";
import { getUserPermissionContext } from "../../auth/access.repository";
import { canManageMember, isOwnerRole } from "../../auth/access.service";
import { BadRequestError, ForbiddenError, NotFoundError } from "../../errors";
import { orgProcedure, requirePermission } from "../../index";
import { membersRepository } from "./members.repository";

export const membersRouter = {
	/** Hierarchy applies; the org owner can never be removed (transfer ownership first). */
	remove: requirePermission("member", "remove")
		.input(z.object({ targetUserId: z.string() }))
		.handler(async ({ input, context }) => {
			const organizationId = context.organizationId;
			if (input.targetUserId === context.session.user.id) {
				throw new BadRequestError("You cannot remove yourself");
			}

			const target = await membersRepository.findMember(
				input.targetUserId,
				organizationId,
			);
			if (!target) throw new NotFoundError("Member not found");
			if (isOwnerRole(target.role)) {
				throw new ForbiddenError("The organization owner cannot be removed");
			}

			const targetPc = await getUserPermissionContext(
				input.targetUserId,
				organizationId,
				{ isAppOwner: false },
			);
			if (!canManageMember(context.pc, targetPc.highestPosition)) {
				throw new ForbiddenError("You cannot remove this member");
			}

			await membersRepository.removeWithRoles(
				input.targetUserId,
				organizationId,
			);

			return { success: true };
		}),

	/** Only the current owner may transfer (hard check, not a delegable permission). */
	transferOwnership: orgProcedure
		.input(z.object({ targetUserId: z.string() }))
		.handler(async ({ input, context }) => {
			const userId = context.session.user.id;
			const organizationId = context.organizationId;

			if (input.targetUserId === userId) {
				throw new BadRequestError("You already own this organization");
			}

			const me = await membersRepository.findMember(userId, organizationId);
			if (!isOwnerRole(me?.role)) {
				throw new ForbiddenError(
					"Only the current owner can transfer ownership",
				);
			}

			const target = await membersRepository.findMember(
				input.targetUserId,
				organizationId,
			);
			if (!target) throw new NotFoundError("Target member not found");

			await membersRepository.transferOwnership(
				userId,
				input.targetUserId,
				organizationId,
			);

			return { success: true };
		}),
};
