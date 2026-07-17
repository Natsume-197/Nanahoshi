import { isOwnerRole } from "../../auth/access.service";
import { ForbiddenError, NotFoundError } from "../../errors";
import { orgProcedure, requirePermission } from "../../index";
import { membersRepository } from "../members/members.repository";
import { UpdateServerProfileInput } from "./server-profile.model";
import { serverProfileRepository } from "./server-profile.repository";

export const serverProfileRouter = {
	get: requirePermission("settings", "read").handler(async ({ context }) => {
		const profile = await serverProfileRepository.getProfile(context.serverId);
		if (!profile) throw new NotFoundError("Server not found");
		return profile;
	}),

	/** Only the current owner may delete the server (hard check, not a delegable permission). */
	deleteServer: orgProcedure.handler(async ({ context }) => {
		const me = await membersRepository.findMember(
			context.session.user.id,
			context.serverId,
		);
		if (!isOwnerRole(me?.role)) {
			throw new ForbiddenError("Only the owner can delete the server");
		}
		await serverProfileRepository.deleteServer(context.serverId);
		return { success: true };
	}),

	update: requirePermission("settings", "update")
		.input(UpdateServerProfileInput)
		.handler(async ({ input, context }) => {
			const updated = await serverProfileRepository.updateProfile(
				context.serverId,
				input,
			);
			if (!updated) throw new NotFoundError("Server not found");
			return updated;
		}),
};
