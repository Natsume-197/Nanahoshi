import { db } from "@nanahoshi-v2/db";
import { sql } from "drizzle-orm";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Runs `fn` in a transaction with parallel workers disabled. Every parallel
 * worker re-opens the Groonga database (~60ms+ startup), so any query that can
 * touch a PGroonga index must never run under a Gather — the scans themselves
 * are index-driven and lose nothing by staying serial.
 */
export async function withSerialScan<T>(
	fn: (tx: Tx) => Promise<T>,
): Promise<T> {
	return db.transaction(async (tx) => {
		await tx.execute(sql`SET LOCAL max_parallel_workers_per_gather = 0`);
		return fn(tx);
	});
}
