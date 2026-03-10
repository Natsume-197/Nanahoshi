import { z } from "zod";
import { protectedProcedure } from "../../index";
import { db } from "@nanahoshi-v2/db";
import { user } from "@nanahoshi-v2/db/schema/auth";
import { eq } from "drizzle-orm";

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
};
