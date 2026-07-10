import path from "node:path";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { db, pool } from "./index";
import { withStartupLockUsing } from "./startup-lock";

/** Serializes the API and worker processes booting concurrently. */
export const withStartupLock = <T>(fn: () => Promise<T>): Promise<T> =>
	withStartupLockUsing(pool, fn);

export async function runMigrations() {
	const migrationsFolder = path.join(__dirname, "migrations");
	console.log(`Running migrations from ${migrationsFolder}...`);
	await migrate(db, { migrationsFolder });
	console.log("Migrations applied successfully.");
}
