import { migrate } from "drizzle-orm/node-postgres/migrator";
import path from "path";
import { db } from "./index";

export async function runMigrations() {
	const migrationsFolder = path.join(__dirname, "migrations");
	console.log(`Running migrations from ${migrationsFolder}...`);
	await migrate(db, { migrationsFolder });
	console.log("Migrations applied successfully.");
}
