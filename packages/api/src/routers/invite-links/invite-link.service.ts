import { auth } from "@nanahoshi-v2/auth";
import { ForbiddenError, NotFoundError } from "../../errors";
import { checkDiscordAccess } from "../../lib/discord-access";
import { inviteLinkRepository } from "./invite-link.repository";

export const inviteLinkService = {
	async createLink({
		serverId,
		role,
		maxUses,
		expiresAt,
		createdBy,
	}: {
		serverId: string;
		role: string;
		maxUses: number | null;
		expiresAt: Date | null;
		createdBy: string;
	}) {
		return await inviteLinkRepository.create({
			serverId,
			role,
			maxUses,
			expiresAt,
			createdBy,
		});
	},

	async listLinks(serverId: string) {
		return await inviteLinkRepository.listByOrg(serverId);
	},

	async revokeLink(id: string, serverId: string) {
		const updated = await inviteLinkRepository.revoke(id, serverId);
		if (!updated) {
			throw new NotFoundError("Invite link not found or already revoked");
		}
		return { success: true };
	},

	async joinViaLink({ code, userId }: { code: string; userId: string }) {
		const link = await inviteLinkRepository.findByCode(code);

		if (!link) {
			throw new NotFoundError("Invalid invite link");
		}

		if (link.revokedAt) {
			throw new ForbiddenError("This invite link has been revoked");
		}

		if (link.expiresAt && link.expiresAt < new Date()) {
			throw new ForbiddenError("This invite link has expired");
		}

		if (link.maxUses !== null && link.useCount >= link.maxUses) {
			throw new ForbiddenError(
				"This invite link has reached its maximum number of uses",
			);
		}

		const alreadyMember = await inviteLinkRepository.isMember(
			userId,
			link.serverId,
		);

		if (alreadyMember) {
			return { alreadyMember: true, serverId: link.serverId };
		}

		// Check Discord access rules before adding the member
		await checkDiscordAccess(userId, link.serverId);

		// Add the user as a member via Better Auth's server-side API
		await auth.api.addMember({
			body: {
				userId,
				organizationId: link.serverId,
				role: link.role as "member" | "admin" | "owner",
			},
		});

		await inviteLinkRepository.incrementUseCount(link.id);

		return { alreadyMember: false, serverId: link.serverId };
	},
};
