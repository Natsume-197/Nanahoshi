import { auth } from "@nanahoshi-v2/auth";
import { db } from "@nanahoshi-v2/db";
import { member, organization, user } from "@nanahoshi-v2/db/schema/auth";
import { ORPCError } from "@orpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { publicProcedure } from "../index";
import {
	isAppConfigured,
	markAppConfigured,
} from "../modules/settings.service";

export const setupRouter = {
	complete: publicProcedure
		.input(
			z.object({
				workspaceName: z.string().min(1),
				workspaceSlug: z.string().min(1),
				username: z.string().min(1),
				email: z.string().email(),
				password: z.string().min(8),
			}),
		)
		.handler(async ({ input, context }) => {
			const isConfigured = await isAppConfigured();
			if (isConfigured) {
				throw new ORPCError("FORBIDDEN", {
					message: "Application is already configured.",
				});
			}

			// 1. Create User via better-auth
			let signUpRes;
			try {
				signUpRes = await auth.api.signUpEmail({
					headers: context.req?.headers,
					body: {
						email: input.email,
						password: input.password,
						name: input.username,
					},
				});
			} catch (error) {
				console.error("User creation error", error);
				throw new ORPCError("INTERNAL_SERVER_ERROR", {
					message: "Failed to create user.",
				});
			}

			if (!signUpRes?.user) {
				throw new ORPCError("INTERNAL_SERVER_ERROR", {
					message: "Failed to create user.",
				});
			}

			// 2. Create Organization via Drizzle manually to ensure owner assignment
			// (because better-auth createOrganization usually expects a logged-in user session in headers)
			try {
				const orgId = crypto.randomUUID();
				await db.insert(organization).values({
					id: orgId,
					name: input.workspaceName,
					slug: input.workspaceSlug,
					createdAt: new Date(),
				});

				const memberId = crypto.randomUUID();
				await db.insert(member).values({
					id: memberId,
					organizationId: orgId,
					userId: signUpRes.user.id,
					role: "owner", // better-auth default admin role for orgs is usually owner or admin
					createdAt: new Date(),
				});
			} catch (err) {
				console.error("Organization creation error", err);
				throw new ORPCError("INTERNAL_SERVER_ERROR", {
					message: "Failed to create organization.",
				});
			}

			// 3. Grant admin role to first user (directly via DB, since no admin exists yet to call setRole)
			await db
				.update(user)
				.set({ role: "admin" })
				.where(eq(user.id, signUpRes.user.id));

			// 4. Mark configured
			await markAppConfigured();

			return { success: true };
		}),
};
