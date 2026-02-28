import { db } from "@nanahoshi-v2/db";
import * as schema from "@nanahoshi-v2/db/schema/auth";
import { env } from "@nanahoshi-v2/env/server";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { admin, organization } from "better-auth/plugins";

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
		defaultCookieAttributes: {
			sameSite: "lax",
			httpOnly: true,
		},
	},
	plugins: [organization(), admin()],
});
