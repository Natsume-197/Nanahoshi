import os from "node:os";
import { env } from "@nanahoshi-v2/env/server";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "./schema";

// Sized for the file-event + enrich + cover workers running concurrently.
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
