import { env } from "@nanahoshi-v2/env/server";
import { Redis } from "ioredis";

export const redis = new Redis({
	host: env.REDIS_HOST,
	port: env.REDIS_PORT,
	password: env.REDIS_PASSWORD || undefined,
	maxRetriesPerRequest: null,
});
