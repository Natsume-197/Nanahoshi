import { auth } from "@nanahoshi-v2/auth";
import { db } from "@nanahoshi-v2/db";
import { member, organization, user } from "@nanahoshi-v2/db/schema/auth";
import { appSettings } from "@nanahoshi-v2/db/schema/general";
import { env } from "@nanahoshi-v2/env/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { ensureDefaultRole } from "../auth/access.repository";
import { ForbiddenError, InternalServerError } from "../errors";
import { publicProcedure } from "../index";
import { logger } from "../lib/logger";
import { isAppConfigured } from "../modules/settings.service";

type SignUpResponse = Awaited<ReturnType<typeof auth.api.signUpEmail>>;

export const setupRouter = {
	isConfigured: publicProcedure.handler(async () => {
		return await isAppConfigured();
	}),
	/** Public: whether SSO login is available, for the sign-in screen. */
	ssoStatus: publicProcedure.handler(() => {
		return {
			enabled: !!env.OIDC_ENABLED && !!env.OIDC_ISSUER && !!env.OIDC_CLIENT_ID,
			providerId: env.OIDC_PROVIDER_ID,
			label: env.OIDC_PROVIDER_LABEL,
		};
	}),
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
			const orgId = crypto.randomUUID();
			const result = await db.transaction(async (tx) => {
				// 1. Lock setup status to prevent race conditions
				const [setting] = await tx
					.select({ value: appSettings.value })
					.from(appSettings)
					.where(eq(appSettings.key, "first_setup"))
					.for("update");

				if (setting?.value === true) {
					throw new ForbiddenError("Application is already configured.");
				}

				// 2. Create User via better-auth
				let signUpRes: SignUpResponse | undefined;
				try {
					signUpRes = await auth.api.signUpEmail({
						headers: context.req?.headers,
						body: {
							email: input.email,
							password: input.password,
							name: input.username,
							username: input.username.toLowerCase(),
						},
					});
				} catch (error) {
					logger.error({ err: error }, "User creation error");
					throw new InternalServerError("Failed to create user.");
				}

				if (!signUpRes?.user) {
					throw new InternalServerError("Failed to create user.");
				}

				// 3. Create Organization
				try {
					await tx.insert(organization).values({
						id: orgId,
						name: input.workspaceName,
						slug: input.workspaceSlug,
						createdAt: new Date(),
					});

					const memberId = crypto.randomUUID();
					await tx.insert(member).values({
						id: memberId,
						organizationId: orgId,
						userId: signUpRes.user.id,
						role: "owner",
						createdAt: new Date(),
					});
				} catch (err) {
					logger.error({ err }, "Organization creation error");
					throw new InternalServerError("Failed to create organization.");
				}

				// 4. Grant admin role to first user
				await tx
					.update(user)
					.set({ role: "admin" })
					.where(eq(user.id, signUpRes.user.id));

				// 5. Mark configured
				await tx
					.update(appSettings)
					.set({ value: true, updatedAt: new Date() })
					.where(eq(appSettings.key, "first_setup"));

				return { success: true };
			});

			// Seed the @everyone role now that the org exists (outside the tx, since
			// ensureDefaultRole uses the global db connection).
			await ensureDefaultRole(orgId);

			return result;
		}),
};
