import "dotenv/config";
import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
	server: {
		// General
		ENVIRONMENT: z.enum(["development", "production"]).default("development"),
		PROCESS_ROLE: z.enum(["api", "worker"]).default("api"),
		CORS_ORIGIN: z.url(),
		NAMESPACE_UUID: z.uuid(),
		DOWNLOAD_SECRET: z.uuid(),
		COOKIE_DOMAIN: z.string().optional(),
		SERVER_URL: z.string(),
		VITE_SERVER_URL: z.string().optional(),

		// Database
		DB_HOST: z.string().default("localhost"),
		DB_PORT: z.coerce.number().default(5432),
		DB_USER: z.string().default("postgres"),
		DB_PASSWORD: z.string().default("password"),
		DB_NAME: z.string().default("nanahoshi-v2"),

		// Redis
		REDIS_HOST: z.string().default("127.0.0.1"),
		REDIS_PORT: z.coerce.number().default(6379),
		REDIS_PASSWORD: z.string().optional(),

		// Authentication
		BETTER_AUTH_SECRET: z.string().min(32),
		BETTER_AUTH_URL: z.url(),
		DISCORD_CLIENT_ID: z.string().optional(),
		DISCORD_CLIENT_SECRET: z.string().optional(),

		// OIDC / SSO
		OIDC_ENABLED: z
			.string()
			.transform((v) => v === "true")
			.default(false),
		OIDC_PROVIDER_ID: z.string().default("oidc"),
		OIDC_PROVIDER_LABEL: z.string().default("SSO"),
		OIDC_ISSUER: z.string().optional(),
		OIDC_CLIENT_ID: z.string().optional(),
		OIDC_CLIENT_SECRET: z.string().optional(),
		OIDC_SCOPES: z.string().default("openid email profile"),
		OIDC_GROUPS_CLAIM: z.string().default("groups"),
		OIDC_ROLE_MAP: z.string().default("{}"),
		OIDC_DEFAULT_ORG_ID: z.string().optional(),
		OIDC_AUTO_PROVISION: z
			.string()
			.transform((v) => v === "true")
			.default(true),

		// Email
		SMTP_HOST: z.string().default("smtp.gmail.com"),
		SMTP_PORT: z.coerce.number().default(465),
		SMTP_SECURE: z
			.string()
			.transform((v) => v === "true")
			.default(true),
		SMTP_USER: z.email(),
		SMTP_PASS: z.string(),

		// Search
		SEARCH_PROVIDER: z.enum(["elasticsearch", "pgroonga"]).default("pgroonga"),
		ELASTICSEARCH_NODE: z.string().optional(),
		ELASTICSEARCH_INDEX_PREFIX: z.string().default("nanahoshi"),
	},
	runtimeEnv: process.env,
	emptyStringAsUndefined: true,
});

// Fail loudly if production is still running on the insecure development defaults.
if (env.ENVIRONMENT === "production") {
	const insecure: string[] = [];
	if (env.DB_PASSWORD === "password") insecure.push("DB_PASSWORD");
	if (env.DB_USER === "postgres" && env.DB_PASSWORD === "password")
		insecure.push("DB_USER");
	if (insecure.length > 0) {
		throw new Error(
			`Insecure default(s) in production: ${insecure.join(", ")}. Set strong values before launch.`,
		);
	}
}
