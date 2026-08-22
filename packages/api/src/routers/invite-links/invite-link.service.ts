import { auth } from "@nanahoshi-v2/auth";
import { invalidatePermissionCaches } from "../../auth/access.repository";
import { ForbiddenError, NotFoundError } from "../../errors";
import { checkDiscordAccess } from "../../lib/discord-access";
import { discordAccessRepository } from "../../lib/discord-access.repository";
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

	async deleteLink(id: string, serverId: string) {
		const deleted = await inviteLinkRepository.delete(id, serverId);
		if (!deleted) {
			throw new NotFoundError("Invite link not found");
		}
		return { success: true };
	},

	async previewLink({ code, userId }: { code: string; userId?: string }) {
		const link = await inviteLinkRepository.findByCode(code);

		if (!link) return { status: "invalid" as const };
		if (link.revokedAt) return { status: "revoked" as const };
		if (link.expiresAt && link.expiresAt < new Date()) {
			return { status: "expired" as const };
		}
		if (link.maxUses !== null && link.useCount >= link.maxUses) {
			return { status: "exhausted" as const };
		}

		const server = await inviteLinkRepository.getServerPreview(link.serverId);
		if (!server) return { status: "invalid" as const };

		const [alreadyMember, enabledRules, discordAccount] = await Promise.all([
			userId
				? inviteLinkRepository.isMember(userId, link.serverId)
				: Promise.resolve(false),
			discordAccessRepository.getEnabledRules(link.serverId),
			userId
				? discordAccessRepository.getDiscordAccount(userId)
				: Promise.resolve(null),
		]);

		return {
			status: "ok" as const,
			serverId: link.serverId,
			serverName: server.name,
			serverLogo: server.logo,
			serverBackground: server.background,
			memberCount: server.memberCount,
			bookCount: server.bookCount,
			alreadyMember,
			// Joining this server is gated by Discord guild/role rules.
			requiresDiscord: enabledRules.length > 0,
			// Only meaningful with a session: has the viewer linked Discord? The
			// access token is what the gate actually needs, so a token-less row
			// must not present the join button as ready.
			discordLinked: Boolean(discordAccount?.accessToken),
		};
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

		const consumed = await inviteLinkRepository.consumeUse(link.id);
		if (!consumed) {
			throw new ForbiddenError("This invite link is no longer available");
		}

		// Add the user as a member via Better Auth's server-side API
		try {
			await auth.api.addMember({
				body: {
					userId,
					organizationId: link.serverId,
					role: link.role as "member" | "admin" | "owner",
				},
			});
		} catch (err) {
			await inviteLinkRepository.releaseUse(link.id);
			throw err;
		}

		// A permission context may have been cached while the invite page was
		// loading, before this user became a member of the server.
		invalidatePermissionCaches();

		return { alreadyMember: false, serverId: link.serverId };
	},
};
