import { ensureDefaultRoles } from "@nanahoshi-v2/api/auth/access.repository";
import { runMigrations, withStartupLock } from "@nanahoshi-v2/db/migrate";
import { firstSeed } from "@nanahoshi-v2/db/seed/seed";
import type { RuntimeInitializer } from "./types";

export const databaseInitializer: RuntimeInitializer = {
	name: "database",
	initialize: async () => {
		// The API and worker processes boot concurrently; the advisory lock
		// serializes them so the migrator and seeders never race.
		await withStartupLock(async () => {
			await runMigrations();
			await firstSeed();
			await ensureDefaultRoles();
		});
	},
};
