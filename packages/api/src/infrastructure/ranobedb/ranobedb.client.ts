import os from "node:os";
import { env } from "@nanahoshi-v2/env/server";
import { Pool } from "pg";
import { logger } from "../../lib/logger";

export const RANOBEDB_DATABASE = "ranobedb";

let pool: Pool | null = null;
let warnedUnavailable = false;

function getRanobedbPool(): Pool {
	if (!pool) {
		pool = new Pool({
			host: env.DB_HOST,
			port: env.DB_PORT,
			user: env.DB_USER,
			password: env.DB_PASSWORD,
			database: RANOBEDB_DATABASE,
			ssl: false,
			// Each enrich job fires ~7 lookups in parallel; size for concurrency.
			max: Math.max(10, os.cpus().length * 2),
		});
		// Swallow idle-client errors (e.g. DB dropped mid-import) so they don't crash the process
		pool.on("error", () => {});
	}
	return pool;
}

export async function resetRanobedbPool(): Promise<void> {
	const old = pool;
	pool = null;
	warnedUnavailable = false;
	await old?.end().catch(() => {});
}

/**
 * Runs a query against the ranobedb database. Returns null on ANY error
 * (database absent, mid-import, schema drift) so callers can fail soft.
 */
export async function queryRanobedb<T>(
	text: string,
	params?: unknown[],
): Promise<T[] | null> {
	try {
		const result = await getRanobedbPool().query(text, params);
		warnedUnavailable = false;
		return result.rows as T[];
	} catch (error) {
		if (!warnedUnavailable) {
			warnedUnavailable = true;
			logger.warn(
				{ err: error },
				"[RanobeDB] Query failed — database missing or not yet imported",
			);
		}
		return null;
	}
}

/** Cheap readiness probe for the admin UI. */
export async function isRanobedbReady(): Promise<boolean> {
	const rows = await queryRanobedb<{ ok: number }>("SELECT 1 AS ok");
	return rows !== null;
}
