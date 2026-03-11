import { auth } from "@nanahoshi-v2/auth";
import { ForbiddenError, NotFoundError } from "../../errors";
import { checkDiscordAccess } from "../../lib/discord-access";
import { inviteLinkRepository } from "./invite-link.repository";

export const inviteLinkService = {
	async createLink({
		organizationId,
		role,
		maxUses,
		expiresAt,
		createdBy,
	}: {
		organizationId: string;
		role: string;
		maxUses: number | null;
		expiresAt: Date | null;
		createdBy: string;
	}) {
		return await inviteLinkRepository.create({
			organizationId,
			role,
			maxUses,
			expiresAt,
			createdBy,
		});
	},

	async listLinks(organizationId: string) {
		return await inviteLinkRepository.listByOrg(organizationId);
	},

	async revokeLink(id: string, organizationId: string) {
		const updated = await inviteLinkRepository.revoke(id, organizationId);
		if (!updated) {
			throw new NotFoundError("Invite link not found or already revoked");
		}
		return { success: true };
	},

	async joinViaLink({
		code,
		userId,
	}: {
		code: string;
		userId: string;
	}) {
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
			throw new ForbiddenError("This invite link has reached its maximum number of uses");
		}

		const alreadyMember = await inviteLinkRepository.isMember(
			userId,
			link.organizationId,
		);

		if (alreadyMember) {
			return { alreadyMember: true, organizationId: link.organizationId };
		}

		// Check Discord access rules before adding the member
		await checkDiscordAccess(userId, link.organizationId);

		// Add the user as a member via Better Auth's server-side API
		await auth.api.addMember({
			body: {
				userId,
				organizationId: link.organizationId,
				role: link.role as "member" | "admin" | "owner",
			},
		});

		await inviteLinkRepository.incrementUseCount(link.id);

		return { alreadyMember: false, organizationId: link.organizationId };
	},
};

