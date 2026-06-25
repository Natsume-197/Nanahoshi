import os from "node:os";
import { env } from "@nanahoshi-v2/env/server";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "./schema";

// Auto-sized from the host: the pool has to serve the file-event worker
// (2×CPU) plus the enrich and cover workers running concurrently, so jobs
// don't queue waiting for a connection. No env var to tune.
const poolMax = Math.max(20, os.cpus().length * 4);

const pool = new Pool({
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
