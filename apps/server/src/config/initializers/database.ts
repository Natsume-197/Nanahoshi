import { ensureDefaultRoles } from "@nanahoshi/api/auth/access.repository";
import { logger } from "@nanahoshi/api/lib/logger";
import { runningRelease } from "@nanahoshi/api/modules/updates/version";
import {
	readMigrationState,
	runMigrations,
	withStartupLock,
} from "@nanahoshi/db/migrate";
import { firstSeed } from "@nanahoshi/db/seed/seed";
import { env } from "@nanahoshi/env/server";
import { StartupRefusal } from "../startup-refusal";
import type { RuntimeInitializer } from "./types";

/**
 * A verified dump before this release changes the schema, so an update that
 * goes wrong can always go back. A first install has nothing to keep.
 */
async function backupBeforeMigrating(pending: number) {
	// Imported here: the backup module opens a queue on Redis at import time.
	const { backupToolsAvailable, runBackup } = await import(
		"@nanahoshi/api/modules/database-backup/backups"
	);
	if (!env.NANAHOSHI_PRE_UPDATE_BACKUP) {
		logger.warn(
			{ pending },
			"NANAHOSHI_PRE_UPDATE_BACKUP=false: migrating without a backup",
		);
		return;
	}
	if (!(await backupToolsAvailable())) {
		if (env.ENVIRONMENT === "development") {
			logger.warn(
				"PostgreSQL backup tools unavailable; skipping pre-update backup",
			);
			return;
		}
		throw new StartupRefusal(
			"backup-failed",
			"PostgreSQL backup tools (pg_dump) are unavailable, so the database was not backed up before this update. Nothing was changed.",
		);
	}
	logger.info({ pending }, "Backing up the database before migrating");
	try {
		const { filename } = await runBackup();
		logger.info({ filename }, "Pre-update backup complete");
	} catch (cause) {
		throw new StartupRefusal(
			"backup-failed",
			`The database backup before this update failed, so nothing was changed: ${cause instanceof Error ? cause.message : String(cause)}`,
			{ cause },
		);
	}
}

export const databaseInitializer: RuntimeInitializer = {
	name: "database",
	initialize: async () => {
		// The API and worker processes boot concurrently; the advisory lock
		// serializes them so the migrator and seeders never race, and only the
		// first one through takes the pre-update backup.
		await withStartupLock(async () => {
			const state = await readMigrationState();
			if (state.status === "newer") {
				throw new StartupRefusal(
					"database-newer",
					`This database was already upgraded by a newer Nanahoshi than ${runningRelease()}. An older release can't open it: run the newer image again.`,
				);
			}
			if (state.status === "pending") {
				await backupBeforeMigrating(state.pending);
			}
			try {
				await runMigrations();
			} catch (cause) {
				throw new StartupRefusal(
					"migration-failed",
					`Updating the database failed: ${cause instanceof Error ? cause.message : String(cause)}`,
					{ cause },
				);
			}
			await firstSeed();
			await ensureDefaultRoles();
			const { recordRunningRelease } = await import(
				"@nanahoshi/api/routers/updates/update.service"
			);
			await recordRunningRelease();
		});
	},
};
