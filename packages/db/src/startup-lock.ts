// Pure module (no db/env imports) so it stays testable without infrastructure.

// Arbitrary app-wide key; any value works as long as every process uses it.
export const STARTUP_LOCK_ID = 810_423_117;

interface LockClient {
	query(text: string, values?: unknown[]): Promise<unknown>;
	release(): void;
}

interface LockPool {
	connect(): Promise<LockClient>;
}

/**
 * Run startup DB work (migrations, seeding) under a Postgres advisory lock so
 * concurrently booting processes can't race each other. Advisory locks are
 * session-scoped, so a dedicated client is held for the duration; `fn` itself
 * runs on the regular pool.
 */
export async function withStartupLockUsing<T>(
	pool: LockPool,
	fn: () => Promise<T>,
): Promise<T> {
	const client = await pool.connect();
	try {
		await client.query("SELECT pg_advisory_lock($1)", [STARTUP_LOCK_ID]);
		try {
			return await fn();
		} finally {
			await client.query("SELECT pg_advisory_unlock($1)", [STARTUP_LOCK_ID]);
		}
	} finally {
		client.release();
	}
}
