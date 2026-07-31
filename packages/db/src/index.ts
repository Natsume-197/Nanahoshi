import { env } from "@nanahoshi-v2/env/server";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "./schema";

// The worker process runs the file-event + enrich + cover pipelines and needs
// a pool sized to its concurrency; the API process only serves requests. Both
// processes share Postgres max_connections, so the API stays modest.
const poolMax =
	env.PROCESS_ROLE === "worker"
		? Math.max(8, (env.WORKER_CONCURRENCY ?? 2) * 4)
		: 20;

export const pool = new Pool({
	host: env.DB_HOST,
	port: env.DB_PORT,
	user: env.DB_USER,
	password: env.DB_PASSWORD,
	database: env.DB_NAME,
	ssl: false,
	max: poolMax,
	// Long idle timeout on purpose: a fresh backend pays cold relcache/plan
	// caches (~80-140ms planning on big queries on the Pi); keep them warm.
	idleTimeoutMillis: 300_000,
});

export const db = drizzle(pool, { schema });
