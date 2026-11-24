import { readFile } from "node:fs/promises";
import path from "node:path";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { db, pool } from "./index";
import { classifyMigrations, type MigrationState } from "./migration-state";
import { withStartupLockUsing } from "./startup-lock";

/** Serializes the API and worker processes booting concurrently. */
export const withStartupLock = <T>(fn: () => Promise<T>): Promise<T> =>
	withStartupLockUsing(pool, fn);

const migrationsFolder = () => path.join(__dirname, "migrations");

export async function runMigrations() {
	const folder = migrationsFolder();
	console.log(`Running migrations from ${folder}...`);
	await migrate(db, { migrationsFolder: folder });
	console.log("Migrations applied successfully.");
}

/** What the next `runMigrations` would do to this database. */
export async function readMigrationState(): Promise<MigrationState> {
	const journal = JSON.parse(
		await readFile(
			path.join(migrationsFolder(), "meta", "_journal.json"),
			"utf8",
		),
	) as { entries: { when: number }[] };
	const exists = await pool.query<{ table: string | null }>(
		`SELECT to_regclass('drizzle.__drizzle_migrations')::text AS "table"`,
	);
	let appliedNewest: number | null = null;
	if (exists.rows[0]?.table) {
		const newest = await pool.query<{ created_at: string | null }>(
			"SELECT max(created_at)::text AS created_at FROM drizzle.__drizzle_migrations",
		);
		const value = newest.rows[0]?.created_at;
		appliedNewest = value ? Number(value) : null;
	}
	return classifyMigrations(
		journal.entries.map((entry) => entry.when),
		appliedNewest,
	);
}
