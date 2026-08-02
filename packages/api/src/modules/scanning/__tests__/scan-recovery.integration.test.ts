import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

/**
 * Crash/restart coverage against real Postgres + Redis/BullMQ.
 *
 * Run with dev infrastructure up:
 *   SCAN_RECOVERY_INTEGRATION=1 bun test --env-file=apps/server/.env \
 *     packages/api/src/modules/scanning/__tests__/scan-recovery.integration.test.ts
 */
const enabled = process.env.SCAN_RECOVERY_INTEGRATION === "1";

describe.skipIf(!enabled)("scan crash recovery integration", () => {
	let db: typeof import("@nanahoshi-v2/db").db;
	let pool: typeof import("@nanahoshi-v2/db").pool;
	let sql: typeof import("drizzle-orm").sql;
	let createTask: typeof import("../../taskManager").createTask;
	let deleteTask: typeof import("../../taskManager").deleteTask;
	let redis: typeof import("../../../infrastructure/queue/redis").redis;
	let root = "";
	let libraryId = 0;
	let libraryPathId = 0;
	let taskId = "";

	const organizationId = `scan-recovery-${crypto.randomUUID()}`;
	const directoryCount = 200;

	beforeAll(async () => {
		({ db, pool } = await import("@nanahoshi-v2/db"));
		({ sql } = await import("drizzle-orm"));
		({ createTask, deleteTask } = await import("../../taskManager"));
		({ redis } = await import("../../../infrastructure/queue/redis"));
		const { runMigrations } = await import("@nanahoshi-v2/db/migrate");
		await runMigrations();

		root = await mkdtemp(path.join(tmpdir(), "nanahoshi-scan-recovery-"));
		for (let offset = 0; offset < directoryCount; offset += 100) {
			await Promise.all(
				Array.from({ length: 100 }, (_, index) =>
					mkdir(path.join(root, `directory-${offset + index}`)),
				),
			);
		}

		await db.execute(sql`
			insert into organization (id, name, slug, created_at)
			values (
				${organizationId},
				'scan recovery integration',
				${`scan-recovery-${crypto.randomUUID()}`},
				now()
			)
		`);
		const library = await db.execute(sql`
			insert into library (name, server_id, media_type, created_at)
			values ('scan recovery integration', ${organizationId}, 'ebook', now())
			returning id
		`);
		libraryId = Number((library.rows[0] as { id: number }).id);
		const libraryPath = await db.execute(sql`
			insert into library_path (library_id, path, is_enabled, created_at)
			values (${libraryId}, ${root}, true, now())
			returning id
		`);
		libraryPathId = Number((libraryPath.rows[0] as { id: number }).id);
		taskId = (
			await createTask({
				type: "library-scan",
				serverId: organizationId,
				libraryId,
			})
		).id;
	});

	afterAll(async () => {
		if (taskId) await deleteTask(taskId).catch(() => {});
		if (db && sql) {
			await db
				.execute(sql`delete from organization where id = ${organizationId}`)
				.catch(() => {});
		}
		if (root) await rm(root, { recursive: true, force: true });
		if (redis) await redis.quit().catch(() => {});
		if (pool) await pool.end().catch(() => {});
	});

	const spawnScan = () =>
		Bun.spawn(
			[
				process.execPath,
				"run",
				"packages/api/scripts/scan-recovery-child.ts",
				root,
				String(libraryId),
				String(libraryPathId),
				taskId,
			],
			{
				cwd: path.resolve(import.meta.dir, "../../../../../.."),
				env: {
					...process.env,
					SCAN_CHECKPOINT_ROWS: "5",
					SCAN_CHECKPOINT_INTERVAL_MS: "30000",
				},
				stdout: "pipe",
				stderr: "pipe",
			},
		);

	test("a killed scanner resumes the same durable run and completes the tree", async () => {
		const first = spawnScan();
		let durableDirectories = 0;
		const deadline = Date.now() + 15_000;
		while (Date.now() < deadline) {
			const result = await db.execute(sql`
				select count(*)::int as count
				from scanned_directory
				where library_path_id = ${libraryPathId}
			`);
			durableDirectories = Number(
				(result.rows[0] as { count: number } | undefined)?.count ?? 0,
			);
			if (durableDirectories >= 5) break;
			await Bun.sleep(10);
		}
		expect(durableDirectories).toBeGreaterThanOrEqual(5);

		first.kill("SIGKILL");
		expect(await first.exited).not.toBe(0);
		const beforeResume = await db.execute(sql`
			select id, status
			from scan_run
			where task_id = ${taskId} and library_path_id = ${libraryPathId}
		`);
		expect(beforeResume.rows).toHaveLength(1);
		expect((beforeResume.rows[0] as { status: string }).status).toBe("active");

		const resumed = spawnScan();
		const resumedExit = await resumed.exited;
		if (resumedExit !== 0) {
			const [stdout, stderr] = await Promise.all([
				new Response(resumed.stdout).text(),
				new Response(resumed.stderr).text(),
			]);
			throw new Error(
				`resumed scanner exited ${resumedExit}\nstdout:\n${stdout}\nstderr:\n${stderr}`,
			);
		}

		const afterResume = await db.execute(sql`
			select id, status
			from scan_run
			where task_id = ${taskId} and library_path_id = ${libraryPathId}
		`);
		expect(afterResume.rows).toHaveLength(1);
		expect(afterResume.rows[0]?.id).toBe(beforeResume.rows[0]?.id);
		expect((afterResume.rows[0] as { status: string }).status).toBe(
			"completed",
		);

		const directories = await db.execute(sql`
			select count(*)::int as count
			from scanned_directory
			where library_path_id = ${libraryPathId}
		`);
		expect(Number((directories.rows[0] as { count: number }).count)).toBe(
			directoryCount + 1,
		);
	}, 30_000);
});
