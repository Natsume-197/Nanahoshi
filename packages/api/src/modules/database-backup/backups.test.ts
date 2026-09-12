import { afterAll, expect, mock, test } from "bun:test";
import { mkdtemp, readFile, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = await mkdtemp(join(tmpdir(), "nanahoshi-retention-test-"));
const originalDirectory = process.cwd();
process.chdir(root);
let failDump = false;
mock.module("@nanahoshi-v2/env/server", () => ({ env: {} }));
mock.module("../../infrastructure/queue/redis", () => ({ redis: {} }));
mock.module("bullmq", () => ({ Queue: class {} }));
mock.module("../../routers/settings/settings.repository", () => ({
	settingsRepository: { getValue: async () => ({ retention: 2 }) },
}));
mock.module("./backup-dump", () => ({
	resolveBackupTools: async () => "local",
	createDatabaseDump: async (destination: string) => {
		if (failDump) throw new Error("dump failed");
		await writeFile(destination, "verified-dump");
	},
}));
const { runBackup, listBackups, backupDirectory, resolveBackup, deleteBackup } =
	await import("./backups");
process.chdir(originalDirectory);
afterAll(() => rm(root, { recursive: true, force: true }));

test("retention keeps the newest copies, ignores unrelated files and never prunes after dump failure", async () => {
	const first = await runBackup();
	await utimes(join(backupDirectory, first.filename), 1, 1);
	const second = await runBackup();
	await utimes(join(backupDirectory, second.filename), 2, 2);
	await writeFile(join(backupDirectory, "unrelated.dump"), "keep");
	const third = await runBackup();
	expect((await listBackups()).map((file) => file.filename)).toEqual([
		third.filename,
		second.filename,
	]);
	expect(await Bun.file(join(backupDirectory, first.filename)).exists()).toBe(
		false,
	);
	expect(await readFile(join(backupDirectory, "unrelated.dump"), "utf8")).toBe(
		"keep",
	);
	failDump = true;
	await expect(runBackup()).rejects.toThrow("dump failed");
	expect((await listBackups()).map((file) => file.filename)).toEqual([
		third.filename,
		second.filename,
	]);
	await expect(resolveBackup("../unrelated.dump")).rejects.toThrow(
		"Backup not found",
	);
});

test("deleting a backup removes only the selected copy and rejects paths outside the backup history", async () => {
	const filename =
		"nanahoshi-2026-09-12T03-00-00--12345678-1234-1234-1234-123456789abc.dump";
	await writeFile(join(backupDirectory, filename), "copy-to-delete");
	const before = (await listBackups()).filter(
		(file) => file.filename !== filename,
	);
	await expect(deleteBackup("../unrelated.dump")).rejects.toThrow(
		"Backup not found",
	);
	await expect(deleteBackup("unrelated.dump")).rejects.toThrow(
		"Backup not found",
	);
	expect(await deleteBackup(filename)).toEqual({ deleted: true });
	expect(await Bun.file(join(backupDirectory, filename)).exists()).toBe(false);
	expect(await listBackups()).toEqual(before);
	expect(await readFile(join(backupDirectory, "unrelated.dump"), "utf8")).toBe(
		"keep",
	);
	await expect(deleteBackup(filename)).rejects.toThrow("Backup not found");
});
