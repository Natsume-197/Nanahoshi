import { randomBytes } from "node:crypto";
import { db } from "@nanahoshi-v2/db";
import { discordAccessRule } from "@nanahoshi-v2/db/schema/general";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { NotFoundError } from "../../errors";
import { orgAdminProcedure } from "../../index";

function generateId() {
	return randomBytes(12).toString("hex");
}

export const discordRulesRouter = {
	list: orgAdminProcedure.handler(async ({ context }) => {
		return await db
			.select()
			.from(discordAccessRule)
			.where(eq(discordAccessRule.organizationId, context.organizationId))
			.orderBy(discordAccessRule.createdAt);
	}),

	create: orgAdminProcedure
		.input(
			z.object({
				guildId: z.string().min(1, "Guild ID is required"),
				roleId: z.string().optional(),
				label: z.string().optional(),
			}),
		)
		.handler(async ({ input, context }) => {
			const [created] = await db
				.insert(discordAccessRule)
				.values({
					id: generateId(),
					organizationId: context.organizationId,
					guildId: input.guildId,
					roleId: input.roleId ?? null,
					label: input.label ?? null,
					enabled: true,
				})
				.returning();
			return created;
		}),

	delete: orgAdminProcedure
		.input(z.object({ id: z.string() }))
		.handler(async ({ input, context }) => {
			const [deleted] = await db
				.delete(discordAccessRule)
				.where(
					and(
						eq(discordAccessRule.id, input.id),
						eq(discordAccessRule.organizationId, context.organizationId),
					),
				)
				.returning();
			if (!deleted) {
				throw new NotFoundError("Rule not found");
			}
			return { success: true };
		}),

	toggle: orgAdminProcedure
		.input(z.object({ id: z.string(), enabled: z.boolean() }))
		.handler(async ({ input, context }) => {
			const [updated] = await db
				.update(discordAccessRule)
				.set({ enabled: input.enabled })
				.where(
					and(
						eq(discordAccessRule.id, input.id),
						eq(discordAccessRule.organizationId, context.organizationId),
					),
				)
				.returning();
			if (!updated) {
				throw new NotFoundError("Rule not found");
			}
			return updated;
		}),
};
