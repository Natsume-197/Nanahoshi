import { expect, test } from "bun:test";
import {
	chmod,
	mkdtemp,
	readFile,
	rm,
	stat,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	BackupConfigSchema,
	BackupFilenameSchema,
	backupPattern,
} from "./backup.model";
import { createDatabaseDump } from "./backup-dump";

test("schedules use validated UTC hours and bounded retention; filenames reject traversal", () => {
	expect(backupPattern(BackupConfigSchema.parse({}))).toBeNull();
	expect(
		backupPattern(BackupConfigSchema.parse({ frequency: "daily", hour: 23 })),
	).toBe("0 23 * * *");
	expect(
		backupPattern(BackupConfigSchema.parse({ frequency: "weekly", hour: 0 })),
	).toBe("0 0 * * 0");
	for (const value of [
		{ hour: 24 },
		{ hour: -1 },
		{ retention: 0 },
		{ retention: 101 },
		{ frequency: "hourly" },
	])
		expect(BackupConfigSchema.safeParse(value).success).toBe(false);
	expect(BackupFilenameSchema.safeParse("../database.dump").success).toBe(
		false,
	);
	expect(
		BackupFilenameSchema.safeParse(
			"nanahoshi-2026-09-12T03-00-00--12345678-1234-1234-1234-123456789abc.dump",
		).success,
	).toBe(true);
});

test("only verified dumps become private downloadable files; failures preserve existing copies", async () => {
	const root = await mkdtemp(join(tmpdir(), "nanahoshi-dump-test-"));
	const oldPath = process.env.PATH;
	try {
		const dump = join(root, "pg_dump");
		const restore = join(root, "pg_restore");
		await writeFile(dump, '#!/bin/sh\nprintf "verified-dump" > "$4"\n');
		await writeFile(restore, "#!/bin/sh\nexit 0\n");
		await Promise.all([chmod(dump, 0o755), chmod(restore, 0o755)]);
		process.env.PATH = `${root}:${oldPath}`;
		const destination = join(root, "database.dump");
		await createDatabaseDump(destination, {});
		expect(await readFile(destination, "utf8")).toBe("verified-dump");
		expect((await stat(destination)).mode & 0o777).toBe(0o600);
		await writeFile(
			restore,
			'#!/bin/sh\necho "secret diagnostic" >&2\nexit 1\n',
		);
		await expect(createDatabaseDump(destination, {})).rejects.toThrow(
			"Database backup failed",
		);
		expect(await readFile(destination, "utf8")).toBe("verified-dump");
		expect(await Bun.file(`${destination}.partial`).exists()).toBe(false);
		await writeFile(restore, "#!/bin/sh\nexit 0\n");
		await writeFile(dump, '#!/bin/sh\n: > "$4"\n');
		await expect(
			createDatabaseDump(join(root, "empty.dump"), {}),
		).rejects.toThrow("Database backup failed");
		expect(await Bun.file(join(root, "empty.dump")).exists()).toBe(false);
	} finally {
		process.env.PATH = oldPath;
		await rm(root, { recursive: true, force: true });
	}
});

test("development can dump and verify through the matching Compose container without host PostgreSQL tools", async () => {
	const root = await mkdtemp(join(tmpdir(), "nanahoshi-docker-dump-test-"));
	const oldPath = process.env.PATH;
	const oldLog = process.env.BACKUP_TEST_ARGS;
	try {
		const docker = join(root, "docker");
		const log = join(root, "arguments.log");
		await writeFile(
			docker,
			`#!/bin/sh
printf '%s\\n' "$*" >> "$BACKUP_TEST_ARGS"
case "$*" in
  inspect*) printf '[{"HostPort":"5432"}]';;
  *--version*) printf 'PostgreSQL 18';;
  *pg_dump*) printf 'docker-verified-dump';;
  *pg_restore*) read content; [ "$content" = 'docker-verified-dump' ];;
  *) exit 1;;
esac
`,
		);
		await chmod(docker, 0o755);
		process.env.PATH = root;
		process.env.BACKUP_TEST_ARGS = log;
		const destination = join(root, "database.dump");
		await createDatabaseDump(
			destination,
			{ PGPASSWORD: "test-password", PGUSER: "postgres", PGDATABASE: "test" },
			5432,
		);
		expect(await readFile(destination, "utf8")).toBe("docker-verified-dump");
		expect((await stat(destination)).mode & 0o777).toBe(0o600);
		const argumentsText = await readFile(log, "utf8");
		expect(argumentsText).toContain("nanahoshi-v2-postgres");
		expect(argumentsText).not.toContain("test-password");
		await writeFile(
			docker,
			(await readFile(docker, "utf8")).replace(
				/read content;[^\n]+/,
				"exit 1;;",
			),
		);
		await expect(createDatabaseDump(destination, {}, 5432)).rejects.toThrow(
			"Database backup failed",
		);
		expect(await readFile(destination, "utf8")).toBe("docker-verified-dump");
		expect(await Bun.file(`${destination}.partial`).exists()).toBe(false);
		await expect(
			createDatabaseDump(join(root, "production.dump"), {}),
		).rejects.toThrow("Database backup failed");
		await expect(
			createDatabaseDump(join(root, "wrong-port.dump"), {}, 5433),
		).rejects.toThrow("Database backup failed");
	} finally {
		process.env.PATH = oldPath;
		if (oldLog === undefined) delete process.env.BACKUP_TEST_ARGS;
		else process.env.BACKUP_TEST_ARGS = oldLog;
		await rm(root, { recursive: true, force: true });
	}
});
