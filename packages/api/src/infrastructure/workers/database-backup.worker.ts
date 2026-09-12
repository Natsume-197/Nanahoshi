import { Worker } from "bullmq";
import { logger } from "../../lib/logger";
import { runBackup } from "../../modules/database-backup/backups";
import { redis } from "../queue/redis";

export const databaseBackupWorker = new Worker("database-backup", runBackup, {
	connection: redis,
	concurrency: 1,
});
databaseBackupWorker.on("failed", (_job, err) =>
	logger.error({ err }, "Database backup failed"),
);
