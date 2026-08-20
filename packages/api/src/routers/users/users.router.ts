import { env } from "@nanahoshi-v2/env/server";
import { z } from "zod";
import { resolveLibraryAccess } from "../../auth/access.repository";
import { orgProcedure, protectedProcedure } from "../../index";
import { SearchUsersInput } from "./users.model";
import { usersRepository } from "./users.repository";

export const usersRouter = {
	search: orgProcedure
		.input(SearchUsersInput)
		.handler(async ({ input, context }) => {
			return usersRepository.search(
				input.query,
				context.serverId,
				context.session.user.id,
				input.limit ?? 5,
			);
		}),
	getLastActiveOrg: protectedProcedure.handler(async ({ context }) => {
		const serverId = await usersRepository.getLastActiveOrg(
			context.session.user.id,
		);
		return { serverId };
	}),
	setLastActiveOrg: protectedProcedure
		.input(
			z.object({
				serverId: z.string().nullable(),
			}),
		)
		.handler(async ({ input, context }) => {
			await usersRepository.setLastActiveOrg(
				context.session.user.id,
				input.serverId,
			);
			return { ok: true };
		}),
	getMyRole: orgProcedure.handler(async ({ context }) => {
		const role = await usersRepository.getRole(
			context.session.user.id,
			context.serverId,
		);
		return { role: role ?? "member" };
	}),

	/** Everything the client needs to gate UI (permissions, flags, accessible libraries, SSO). */
	getMyAbilities: orgProcedure.handler(async ({ context }) => {
		const access = await resolveLibraryAccess(context.session);
		if (!access) throw new Error("No active organization");
		const { pc, accessibleLibraryIds } = access;

		return {
			isAppOwner: pc.isAppOwner,
			isOrgOwner: pc.isOrgOwner,
			hasAdministrator: pc.hasAdministrator,
			highestPosition: pc.highestPosition,
			globalPerms: pc.globalPerms,
			roleIds: pc.roleIds,
			accessibleLibraryIds,
			ssoEnabled:
				!!env.OIDC_ENABLED && !!env.OIDC_ISSUER && !!env.OIDC_CLIENT_ID,
		};
	}),
};
