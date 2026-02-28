import { type BetterAuthOptions, betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { admin, organization } from "better-auth/plugins";
import { db } from "@nanahoshi-v2/db";
import * as schema from "@nanahoshi-v2/db/schema/auth";
import { env } from "@nanahoshi-v2/env/server";

const isProd = env.ENVIRONMENT === "production";

const crossSubDomainCookies = isProd
	? { enabled: true, domain: ".natsucloud.com" }
	: { enabled: false };

const cookieConfig = {
	sameSite: (isProd ? "none" : "lax") as "none" | "lax",
	secure: true,
	httpOnly: true,
};

const authConfig = {
	database: drizzleAdapter(db, {
		provider: "pg",
		schema: schema,
	}),
	trustedOrigins: [env.CORS_ORIGIN],
	emailAndPassword: {
		enabled: true,
	},
	advanced: {
		defaultCookieAttributes: cookieConfig,
		crossSubDomainCookies: crossSubDomainCookies,
	},
	...(env.DISCORD_CLIENT_ID &&
		env.DISCORD_CLIENT_SECRET && {
			socialProviders: {
				discord: {
					clientId: env.DISCORD_CLIENT_ID,
					clientSecret: env.DISCORD_CLIENT_SECRET,
					scope: [
						"identify",
						"email",
						"guilds",
						"guilds.members.read",
					],
				},
			},
		}),
	plugins: [organization(), admin()],
} satisfies BetterAuthOptions;

export const auth = betterAuth(authConfig) as ReturnType<
	typeof betterAuth<typeof authConfig>
>;
