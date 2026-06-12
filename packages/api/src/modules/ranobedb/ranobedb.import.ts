import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { createGunzip } from "node:zlib";
import { env } from "@nanahoshi-v2/env/server";
import { Client } from "pg";
import { ranobedbImportQueue } from "../../infrastructure/queue/queues/ranobedb-import.queue";
import {
	queryRanobedb,
	RANOBEDB_DATABASE,
	resetRanobedbPool,
} from "../../infrastructure/ranobedb/ranobedb.client";
import { setRanobedbConfig } from "../settings.service";
import {
	incrementCompleted,
	incrementFailed,
	isTaskCancelled,
} from "../taskManager";

export const RANOBEDB_DUMP_URL =
	"https://dumps.ranobedb.org/rndb-db-public-latest.dump.gz";
export const RANOBEDB_IMPORT_TASK_UNITS = 100;
const DOWNLOAD_PROGRESS_SHARE = 80; // download maps to 0-80%, restore to 80-100%
const MIN_EXPECTED_BOOKS = 1000;

const TMP_DIR = path.join(process.cwd(), "data/tmp");

// How psql is reached: native binary (production image) or via docker exec
// into the dev Postgres container (mirrors the Flatpak fallback in converter.ts)
type PsqlMode =
	| { kind: "native" }
	| { kind: "docker"; container: string }
	| null;

let psqlMode: PsqlMode | undefined;

async function tryCommand(cmd: string[]): Promise<boolean> {
	try {
		const proc = Bun.spawn([...cmd, "--version"], {
			stdout: "pipe",
			stderr: "pipe",
		});
		return (await proc.exited) === 0;
	} catch {
		return false;
	}
}

async function findPostgresContainer(): Promise<string | null> {
	try {
		const proc = Bun.spawn(
			[
				"docker",
				"ps",
				"--filter",
				`publish=${env.DB_PORT}`,
				"--format",
				"{{.Names}}",
			],
			{ stdout: "pipe", stderr: "pipe" },
		);
		if ((await proc.exited) !== 0) return null;
		const name = (await new Response(proc.stdout).text()).trim().split("\n")[0];
		return name || null;
	} catch {
		return null;
	}
}

export async function checkPsqlAvailable(): Promise<boolean> {
	if (psqlMode !== undefined) return psqlMode !== null;

	if (await tryCommand(["psql"])) {
		psqlMode = { kind: "native" };
	} else {
		// Dev fallback: use psql inside the Postgres container itself
		const container = await findPostgresContainer();
		if (
			container &&
			(await tryCommand(["docker", "exec", container, "psql"]))
		) {
			psqlMode = { kind: "docker", container };
			console.log(
				`[RanobeDB] Using psql via docker exec (${container}) for dump imports.`,
			);
		} else {
			psqlMode = null;
		}
	}

	if (psqlMode === null) {
		console.warn(
			"[RanobeDB] ⚠ psql not found (native or docker). RanobeDB dump import is disabled. Install postgresql-client to enable it.",
		);
	}
	return psqlMode !== null;
}

function buildPsqlRestoreCommand(): {
	cmd: string[];
	procEnv: Record<string, string | undefined>;
} {
	if (psqlMode?.kind === "docker") {
		// Inside the container psql connects via the local socket — no -h/-p.
		// Bare -e PGPASSWORD passes the value through from our env without
		// exposing it in the process arguments (visible in `ps`).
		return {
			cmd: [
				"docker",
				"exec",
				"-i",
				"-e",
				"PGPASSWORD",
				psqlMode.container,
				"psql",
				"-U",
				env.DB_USER,
				"-d",
				RANOBEDB_DATABASE,
				"-q",
			],
			procEnv: { ...process.env, PGPASSWORD: env.DB_PASSWORD },
		};
	}
	return {
		cmd: [
			"psql",
			"-h",
			env.DB_HOST,
			"-p",
			String(env.DB_PORT),
			"-U",
			env.DB_USER,
			"-d",
			RANOBEDB_DATABASE,
			"-q",
		],
		procEnv: { ...process.env, PGPASSWORD: env.DB_PASSWORD },
	};
}

/** Tracks coarse percent progress against the 100-unit task. */
class TaskProgress {
	private reported = 0;

	constructor(private taskId?: string) {}

	async report(percent: number): Promise<void> {
		if (!this.taskId) return;
		const target = Math.min(Math.floor(percent), RANOBEDB_IMPORT_TASK_UNITS);
		while (this.reported < target) {
			this.reported++;
			await incrementCompleted(this.taskId);
		}
	}

	async fail(): Promise<void> {
		if (!this.taskId) return;
		while (this.reported < RANOBEDB_IMPORT_TASK_UNITS) {
			this.reported++;
			await incrementFailed(this.taskId);
		}
	}
}

export async function runRanobedbImport(taskId?: string): Promise<{
	bookCount: number;
}> {
	const progress = new TaskProgress(taskId);
	try {
		if (!(await checkPsqlAvailable())) {
			throw new Error(
				"psql not found — install postgresql-client to import the RanobeDB dump",
			);
		}

		const dumpPath = await downloadDump(progress, taskId);

		await recreateDatabase();
		await progress.report(DOWNLOAD_PROGRESS_SHARE + 5);

		await restoreDump(dumpPath);
		await progress.report(95);

		const bookCount = await verifyImport();

		await setRanobedbConfig({ lastImportedAt: new Date().toISOString() });
		await resetRanobedbPool();
		await fs.unlink(dumpPath).catch(() => {});

		await progress.report(RANOBEDB_IMPORT_TASK_UNITS);
		console.log(`[RanobeDB] Import complete: ${bookCount} books`);
		return { bookCount };
	} catch (error) {
		await progress.fail();
		throw error;
	}
}

async function downloadDump(
	progress: TaskProgress,
	taskId?: string,
): Promise<string> {
	await fs.mkdir(TMP_DIR, { recursive: true });
	const dumpPath = path.join(TMP_DIR, "ranobedb.dump.gz");

	console.log(`[RanobeDB] Downloading dump from ${RANOBEDB_DUMP_URL}`);
	const response = await fetch(RANOBEDB_DUMP_URL);
	if (!response.ok || !response.body) {
		throw new Error(`Dump download failed (HTTP ${response.status})`);
	}

	const totalBytes = Number(response.headers.get("content-length") ?? 0);
	const file = Bun.file(dumpPath);
	const writer = file.writer();
	let received = 0;
	let sinceCancelCheck = 0;

	const reader = response.body.getReader();
	while (true) {
		const { done, value: chunk } = await reader.read();
		if (done) break;

		writer.write(chunk);
		received += chunk.byteLength;
		sinceCancelCheck += chunk.byteLength;

		if (totalBytes > 0) {
			await progress.report((received / totalBytes) * DOWNLOAD_PROGRESS_SHARE);
		}
		// Check for cancellation every ~5MB
		if (taskId && sinceCancelCheck > 5 * 1024 * 1024) {
			sinceCancelCheck = 0;
			if (await isTaskCancelled(taskId)) {
				await writer.end();
				await fs.unlink(dumpPath).catch(() => {});
				throw new Error("Import cancelled");
			}
		}
	}
	await writer.end();

	console.log(`[RanobeDB] Downloaded ${received} bytes`);
	return dumpPath;
}

async function recreateDatabase(): Promise<void> {
	// Drop any open provider connections first so DROP DATABASE can't hang
	await resetRanobedbPool();

	const admin = new Client({
		host: env.DB_HOST,
		port: env.DB_PORT,
		user: env.DB_USER,
		password: env.DB_PASSWORD,
		database: "postgres",
		ssl: false,
	});
	await admin.connect();
	try {
		await admin.query(
			`DROP DATABASE IF EXISTS ${RANOBEDB_DATABASE} WITH (FORCE)`,
		);
		await admin.query(`CREATE DATABASE ${RANOBEDB_DATABASE}`);
	} finally {
		await admin.end();
	}
}

async function restoreDump(dumpPath: string): Promise<void> {
	console.log("[RanobeDB] Restoring dump with psql...");
	// No ON_ERROR_STOP: plain dumps carry OWNER TO statements for roles that
	// don't exist locally; correctness is validated by verifyImport() instead.
	const { cmd, procEnv } = buildPsqlRestoreCommand();
	const proc = Bun.spawn(cmd, {
		env: procEnv,
		stdin: "pipe",
		stdout: "ignore",
		stderr: "pipe",
	});

	const gunzip = createGunzip();
	const source = createReadStream(dumpPath);
	source.pipe(gunzip);

	for await (const chunk of gunzip) {
		proc.stdin.write(chunk);
	}
	proc.stdin.end();

	const exitCode = await proc.exited;
	if (exitCode !== 0) {
		const stderr = await new Response(proc.stderr).text();
		throw new Error(
			`psql restore failed (code ${exitCode}): ${stderr.slice(0, 500)}`,
		);
	}
}

async function verifyImport(): Promise<number> {
	const rows = await queryRanobedb<{ count: string }>(
		"SELECT count(*) AS count FROM book",
	);
	const bookCount = Number(rows?.[0]?.count ?? 0);
	if (bookCount < MIN_EXPECTED_BOOKS) {
		throw new Error(
			`Import sanity check failed: only ${bookCount} books found (expected >= ${MIN_EXPECTED_BOOKS})`,
		);
	}
	return bookCount;
}

// ─── Auto-update scheduling ──────────────────────────────

const AUTO_UPDATE_SCHEDULER_ID = "ranobedb-auto-update";

export async function syncRanobedbAutoUpdate(
	autoUpdate: boolean,
): Promise<void> {
	if (autoUpdate) {
		// Weekly, Monday 03:00 server time (dump publishes daily at 00:00 UTC)
		await ranobedbImportQueue.upsertJobScheduler(
			AUTO_UPDATE_SCHEDULER_ID,
			{ pattern: "0 3 * * 1" },
			{ name: "import", data: {} },
		);
	} else {
		await ranobedbImportQueue.removeJobScheduler(AUTO_UPDATE_SCHEDULER_ID);
	}
}
