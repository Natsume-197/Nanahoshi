import { ensureDefaultRoles } from "@nanahoshi-v2/api/auth/access.repository";
import { runMigrations } from "@nanahoshi-v2/db/migrate";
import { firstSeed } from "@nanahoshi-v2/db/seed/seed";
import type { RuntimeInitializer } from "./types";

export const databaseInitializer: RuntimeInitializer = {
	name: "database",
	initialize: async () => {
		await runMigrations();
		await firstSeed();
		await ensureDefaultRoles();
	},
};
