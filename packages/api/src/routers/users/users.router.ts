import { db } from "@nanahoshi-v2/db";
import { member, user } from "@nanahoshi-v2/db/schema/auth";
import { env } from "@nanahoshi-v2/env/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { resolveLibraryAccess } from "../../auth/access.repository";
import { orgProcedure, protectedProcedure } from "../../index";

export const usersRouter = {
	getLastActiveOrg: protectedProcedure.handler(async ({ context }) => {
		const userId = context.session.user.id;
		const result = await db
			.select({ lastActiveOrganizationId: user.lastActiveOrganizationId })
			.from(user)
			.where(eq(user.id, userId))
			.limit(1);
		return { organizationId: result[0]?.lastActiveOrganizationId ?? null };
	}),
	setLastActiveOrg: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().nullable(),
			}),
		)
		.handler(async ({ input, context }) => {
			const userId = context.session.user.id;
			await db
				.update(user)
				.set({ lastActiveOrganizationId: input.organizationId })
				.where(eq(user.id, userId));
			return { ok: true };
		}),
	getMyRole: orgProcedure.handler(async ({ context }) => {
		const userId = context.session.user.id;
		const organizationId = context.organizationId;
		const [membership] = await db
			.select({ role: member.role })
			.from(member)
			.where(
				and(
					eq(member.userId, userId),
					eq(member.organizationId, organizationId),
				),
			)
			.limit(1);

		return { role: membership?.role ?? "member" };
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
