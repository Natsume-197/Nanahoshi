import os from "node:os";
import { env } from "@nanahoshi-v2/env/server";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "./schema";

// The worker process runs the file-event + enrich + cover pipelines and needs
// a pool sized to its concurrency; the API process only serves requests. Both
// processes share Postgres max_connections, so the API stays modest.
const poolMax =
	env.PROCESS_ROLE === "worker" ? Math.max(20, os.cpus().length * 4) : 20;

export const pool = new Pool({
	host: env.DB_HOST,
	port: env.DB_PORT,
	user: env.DB_USER,
	password: env.DB_PASSWORD,
	database: env.DB_NAME,
	ssl: false,
	max: poolMax,
	idleTimeoutMillis: 30_000,
});

export const db = drizzle(pool, { schema });
