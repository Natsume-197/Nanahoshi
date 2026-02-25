import "dotenv/config";
import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
  server: {
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),

    DATABASE_URL: z.url(),
    CORS_ORIGIN: z.url(),
    ENVIRONMENT: z.enum(["development", "production"]).default("development"),
    NAMESPACE_UUID: z.uuid(),
    DOWNLOAD_SECRET: z.uuid(),
    NANAHOSHI_DATA_PATH: z.string().default("./data"),
    SERVER_URL: z.string(),

    BETTER_AUTH_SECRET: z.string().min(32),
    BETTER_AUTH_URL: z.url(),
    DISCORD_CLIENT_ID: z.string().optional(),
    DISCORD_CLIENT_SECRET: z.string().optional(),

    SMTP_HOST: z.string().default("smtp.gmail.com"),
    SMTP_PORT: z.coerce.number().default(465),
    SMTP_SECURE: z
      .string()
      .transform((v) => v === "true")
      .default(true),
    SMTP_USER: z.email(),
    SMTP_PASS: z.string(),

    ELASTICSEARCH_NODE: z.string().url().default("http://127.0.0.1:9200"),
    ELASTICSEARCH_INDEX_PREFIX: z.string().default("nanahoshi"),

    REDIS_HOST: z.string().default("127.0.0.1"),
    REDIS_PORT: z.coerce.number().default(6379),
    REDIS_PASSWORD: z.string().optional(),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
});
