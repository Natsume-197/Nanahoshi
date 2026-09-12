import { mkdir, readdir, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { env } from "@nanahoshi-v2/env/server";
import { Queue } from "bullmq";
import { BadRequestError, NotFoundError } from "../../errors";
import { redis } from "../../infrastructure/queue/redis";
import { settingsRepository } from "../../routers/settings/settings.repository";
import {
	type BackupConfig,
	BackupConfigSchema,
	BackupFilenameSchema,
	backupPattern,
} from "./backup.model";

import { createDatabaseDump, resolveBackupTools } from "./backup-dump";

const developmentPort =
	env.ENVIRONMENT === "development" &&
	["localhost", "127.0.0.1", "::1"].includes(env.DB_HOST)
		? env.DB_PORT
		: undefined;
export const backupDirectory = join(process.cwd(), "data", "backups");
export const backupQueue = new Queue("database-backup", {
	connection: redis,
	defaultJobOptions: {
		removeOnComplete: { count: 20 },
		removeOnFail: { count: 20 },
	},
});
export async function getBackupConfig() {
	return BackupConfigSchema.parse(
		(await settingsRepository.getValue("database-backups")) ?? {},
	);
}
export async function backupToolsAvailable() {
	return (await resolveBackupTools(developmentPort)) !== null;
}
export async function syncBackupSchedule(config: BackupConfig) {
	await backupQueue.setGlobalConcurrency(1);
	const pattern = backupPattern(config);
	if (pattern) {
		await backupQueue.upsertJobScheduler(
			"database-backup-schedule",
			{ pattern, tz: "UTC" },
			{ name: "scheduled", data: {} },
		);
	} else {
		await backupQueue.removeJobScheduler("database-backup-schedule");
	}
}
export async function updateBackupConfig(config: BackupConfig) {
	if (config.frequency !== "disabled" && !(await backupToolsAvailable())) {
		throw new BadRequestError(
			"PostgreSQL backup tools are unavailable. In development, start the PostgreSQL Compose container and check Docker access. In production, install PostgreSQL client tools on the server and worker.",
		);
	}
	await settingsRepository.upsert("database-backups", config);
	await syncBackupSchedule(config);
	return config;
}
export async function listBackups() {
	let names: string[];
	try {
		names = await readdir(backupDirectory);
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
		throw error;
	}
	const files = await Promise.all(
		names
			.filter((name) => BackupFilenameSchema.safeParse(name).success)
			.map(async (filename) => {
				try {
					const info = await stat(join(backupDirectory, filename));
					return info.isFile()
						? { filename, size: info.size, createdAt: info.mtime.toISOString() }
						: null;
				} catch (error) {
					if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
					throw error;
				}
			}),
	);
	return files
		.filter((file) => file !== null)
		.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
export async function resolveBackup(filename: string) {
	if (!BackupFilenameSchema.safeParse(filename).success)
		throw new NotFoundError("Backup not found");
	const file = (await listBackups()).find((file) => file.filename === filename);
	if (!file) throw new NotFoundError("Backup not found");
	return { ...file, path: join(backupDirectory, filename) };
}
export async function deleteBackup(filename: string) {
	const file = await resolveBackup(filename);
	await rm(file.path, { force: true });
	return { deleted: true as const };
}
export async function runBackup() {
	await mkdir(backupDirectory, { recursive: true, mode: 0o700 });
	const filename = `nanahoshi-${new Date().toISOString().replace(/[:.Z]/g, "-")}-${crypto.randomUUID()}.dump`;
	const destination = join(backupDirectory, filename);
	await createDatabaseDump(
		destination,
		{
			PGHOST: env.DB_HOST,
			PGPORT: String(env.DB_PORT),
			PGUSER: env.DB_USER,
			PGPASSWORD: env.DB_PASSWORD,
			PGDATABASE: env.DB_NAME,
		},
		developmentPort,
	);
	const { retention } = await getBackupConfig();
	const files = await listBackups();
	for (const file of files.slice(retention))
		await rm(join(backupDirectory, file.filename), { force: true });
	return { filename };
}
export async function enqueueBackup() {
	if (!(await backupToolsAvailable()))
		throw new BadRequestError(
			"PostgreSQL backup tools are unavailable. In development, start the PostgreSQL Compose container and check Docker access. In production, install PostgreSQL client tools on the server and worker.",
		);
	await backupQueue.setGlobalConcurrency(1);
	const job = await backupQueue.add(
		"manual",
		{},
		{ deduplication: { id: "manual-backup" } },
	);
	return { jobId: job.id as string };
}
