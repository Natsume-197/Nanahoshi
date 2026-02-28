import { type BetterAuthOptions, betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { admin, organization } from "better-auth/plugins";
import { db } from "@nanahoshi-v2/db";
import * as schema from "@nanahoshi-v2/db/schema/auth";
import { env } from "@nanahoshi-v2/env/server";

const isProd = env.ENVIRONMENT === "production";

function getCookieDomain(url: string): string | undefined {
	const hostname = new URL(url).hostname;
	if (hostname === "localhost" || /^\d+\./.test(hostname)) return undefined;
	const parts = hostname.split(".");
	if (parts.length < 2) return undefined;
	return `.${parts.slice(-2).join(".")}`;
}

const cookieDomain = getCookieDomain(env.BETTER_AUTH_URL);

const crossSubDomainCookies = cookieDomain
	? { enabled: true, domain: cookieDomain }
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
