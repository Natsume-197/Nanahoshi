import { NotFoundError } from "../../errors";
import { requirePermission } from "../../index";
import { UpdateServerProfileInput } from "./server-profile.model";
import { serverProfileRepository } from "./server-profile.repository";

export const serverProfileRouter = {
	get: requirePermission("settings", "read").handler(async ({ context }) => {
		const profile = await serverProfileRepository.getProfile(context.serverId);
		if (!profile) throw new NotFoundError("Server not found");
		return profile;
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
