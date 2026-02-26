import { Redis } from "ioredis";
import { env } from "@nanahoshi-v2/env/server";

export const redis = new Redis({
	host: env.REDIS_HOST,
	port: env.REDIS_PORT,
	password: env.REDIS_PASSWORD || undefined,
	maxRetriesPerRequest: null,
});
