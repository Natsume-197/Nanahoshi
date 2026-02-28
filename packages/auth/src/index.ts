import { db } from "@nanahoshi-v2/db";
import * as schema from "@nanahoshi-v2/db/schema/auth";
import { env } from "@nanahoshi-v2/env/server";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { admin, organization } from "better-auth/plugins";

const isProd = env.ENVIRONMENT === "production";

function getCookieDomain(url: string): string | undefined {
	const hostname = new URL(url).hostname;
	if (hostname === "localhost" || /^\d+\./.test(hostname)) return undefined;
	const parts = hostname.split(".");
	if (parts.length < 2) return undefined;
	return `.${parts.slice(-2).join(".")}`;
}

const cookieDomain = getCookieDomain(env.BETTER_AUTH_URL);

export const auth = betterAuth({
	database: drizzleAdapter(db, {
		provider: "pg",

		schema: schema,
	}),
	trustedOrigins: [env.CORS_ORIGIN],
	emailAndPassword: {
		enabled: true,
	},
	advanced: {
		crossSubDomainCookies: cookieDomain
			? { enabled: true, domain: cookieDomain }
			: { enabled: false },
		defaultCookieAttributes: {
			sameSite: isProd ? "none" : "lax",
			secure: isProd,
			httpOnly: true,
		},
	},
	plugins: [organization(), admin()],
});
