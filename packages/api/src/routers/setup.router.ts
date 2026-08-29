import { auth } from "@nanahoshi-v2/auth";
import { getRegistrationSettings } from "@nanahoshi-v2/auth/registration-settings";
import { env } from "@nanahoshi-v2/env/server";
import { ensureDefaultRole } from "../auth/access.repository";
import { InternalServerError } from "../errors";
import { publicProcedure } from "../index";
import { logger } from "../lib/logger";
import {
	isAppConfigured,
	markAppConfigured,
} from "./settings/settings.service";
import { CompleteSetupInput } from "./setup.model";
import { setupRepository } from "./setup.repository";

type SignUpResponse = Awaited<ReturnType<typeof auth.api.signUpEmail>>;

export const setupRouter = {
	/** Public: which external sign-in providers are available, for the auth screens. */
	ssoStatus: publicProcedure.handler(async () => {
		const [registration, configured] = await Promise.all([
			getRegistrationSettings(),
			isAppConfigured(),
		]);
		const discordConfigured =
			!!env.DISCORD_CLIENT_ID && !!env.DISCORD_CLIENT_SECRET;
		return {
			configured,
			enabled: !!env.OIDC_ENABLED && !!env.OIDC_ISSUER && !!env.OIDC_CLIENT_ID,
			providerId: env.OIDC_PROVIDER_ID,
			label: env.OIDC_PROVIDER_LABEL,
			discord: discordConfigured,
			// Email invitations / Send to Kindle need SMTP; the invitations UI
			// disables the email path when this is false.
			mailer: !!env.SMTP_USER && !!env.SMTP_PASS,
			// Which registration paths the instance currently offers. Sign-in for
			// existing accounts is never affected by these.
			signup: {
				policy: registration.policy,
				email: registration.methods.email,
				discord: discordConfigured && registration.methods.discord,
			},
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

			// The tx wrote the first_setup flag directly; refresh the in-process
			// cache so the public auth gate sees it immediately.
			await markAppConfigured();

			return result;
		}),
};
