import { env } from "@nanahoshi-v2/env/server";
import { z } from "zod";
import { resolveLibraryAccess } from "../../auth/access.repository";
import { orgProcedure, protectedProcedure } from "../../index";
import { usersRepository } from "./users.repository";

export const usersRouter = {
	getLastActiveOrg: protectedProcedure.handler(async ({ context }) => {
		const organizationId = await usersRepository.getLastActiveOrg(
			context.session.user.id,
		);
		return { organizationId };
	}),
	setLastActiveOrg: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().nullable(),
			}),
		)
		.handler(async ({ input, context }) => {
			await usersRepository.setLastActiveOrg(
				context.session.user.id,
				input.organizationId,
			);
			return { ok: true };
		}),
	getMyRole: orgProcedure.handler(async ({ context }) => {
		const role = await usersRepository.getRole(
			context.session.user.id,
			context.organizationId,
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
