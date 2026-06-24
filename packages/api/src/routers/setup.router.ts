import { auth } from "@nanahoshi-v2/auth";
import { env } from "@nanahoshi-v2/env/server";
import { ensureDefaultRole } from "../auth/access.repository";
import { InternalServerError } from "../errors";
import { publicProcedure } from "../index";
import { logger } from "../lib/logger";
import { isAppConfigured } from "./settings/settings.service";
import { CompleteSetupInput } from "./setup.model";
import { setupRepository } from "./setup.repository";

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
		.input(CompleteSetupInput)
		.handler(async ({ input, context }) => {
			const orgId = crypto.randomUUID();
			const result = await setupRepository.completeSetup({
				orgId,
				workspaceName: input.workspaceName,
				workspaceSlug: input.workspaceSlug,
				createUser: async () => {
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

					return { id: signUpRes.user.id };
				},
			});

			// Seed the @everyone role now that the org exists (outside the tx, since
			// ensureDefaultRole uses the global db connection).
			await ensureDefaultRole(orgId);

			return result;
		}),
};
