// Disposable end-to-end acceptance check for a clean EPUB import. It creates a
// temporary library backed by hard links, runs the production scanner +
// file-event worker, asserts the target, then removes every temporary row, job,
// cover and link it created.
//
// SCAN_ACCEPTANCE_RUN=1 bun run scan:acceptance --library=/path/to/books --books=353 --seconds=20

import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type { JobType, Queue } from "bullmq";

if (process.env.SCAN_ACCEPTANCE_RUN !== "1") {
	throw new Error(
		"Set SCAN_ACCEPTANCE_RUN=1 to allow disposable DB/Redis writes",
	);
}

process.env.PROCESS_ROLE = "worker";

const stringArg = (name: string) =>
	process.argv
		.find((arg) => arg.startsWith(`--${name}=`))
		?.slice(name.length + 3);
const numberArg = (name: string, fallback: number) => {
	const value = Number(stringArg(name) ?? fallback);
	if (!Number.isFinite(value) || value <= 0) {
		throw new Error(`--${name} must be a positive number`);
	}
	return value;
};

const sourceRootArg = stringArg("library");
if (!sourceRootArg) throw new Error("Pass --library=/path/to/books");
const sourceRoot = path.resolve(sourceRootArg);
const expectedBooks = Math.floor(numberArg("books", 353));
const targetSeconds = numberArg("seconds", 20);

async function listEpubs(root: string): Promise<string[]> {
	const files: string[] = [];
	const pending = [root];
	while (pending.length > 0) {
		const directory = pending.pop();
		if (!directory) continue;
		for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
			const fullPath = path.join(directory, entry.name);
			if (entry.isDirectory()) pending.push(fullPath);
			else if (entry.isFile() && entry.name.toLowerCase().endsWith(".epub")) {
				files.push(fullPath);
			}
		}
	}
	return files.sort();
}

async function removeTaskJobs(
	queue: Pick<Queue, "getJobs">,
	predicate: (data: Record<string, unknown>) => boolean,
): Promise<void> {
	const jobTypes: JobType[] = [
		"wait",
		"active",
		"completed",
		"failed",
		"delayed",
		"prioritized",
	];
	const jobs = await queue.getJobs(jobTypes);
	for (const job of jobs) {
		const data = (job.data ?? {}) as Record<string, unknown>;
		if (predicate(data)) await job.remove().catch(() => {});
	}
}

async function removeCoverArtifacts(uuids: Set<string>): Promise<void> {
	for (const directory of [
		path.join(process.cwd(), "data", "covers"),
		path.join(process.cwd(), "data", "tmp"),
	]) {
		const entries = await fs.readdir(directory).catch(() => []);
		for (const entry of entries) {
			if ([...uuids].some((uuid) => entry.startsWith(uuid))) {
				await fs.unlink(path.join(directory, entry)).catch(() => {});
			}
		}
	}
}

function percentile(values: number[], fraction: number): number {
	if (values.length === 0) return 0;
	const sorted = [...values].sort((a, b) => a - b);
	return sorted[
		Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)
	] as number;
}

async function processingMetrics(queue: Queue, scanTaskId: string) {
	const jobs = (await queue.getJobs(["completed"]))
		.filter((job) => job.data?.taskId === scanTaskId)
		.filter(
			(job) =>
				typeof job.processedOn === "number" &&
				typeof job.finishedOn === "number",
		);
	const intervals = jobs.map((job) => ({
		started: job.processedOn as number,
		finished: job.finishedOn as number,
	}));
	const durations = intervals.map(
		({ started, finished }) => finished - started,
	);
	const processingStart = Math.min(...intervals.map(({ started }) => started));
	const processingEnd = Math.max(...intervals.map(({ finished }) => finished));
	const wallMs = intervals.length > 0 ? processingEnd - processingStart : 0;
	const busyMs = durations.reduce((sum, value) => sum + value, 0);
	const events = intervals
		.flatMap(({ started, finished }) => [
			{ at: started, delta: 1 },
			{ at: finished, delta: -1 },
		])
		.sort((a, b) => a.at - b.at || a.delta - b.delta);
	let active = 0;
	let peak = 0;
	for (const event of events) {
		active += event.delta;
		peak = Math.max(peak, active);
	}
	return {
		jobs: jobs.length,
		wallMs,
		busyMs,
		effectiveConcurrency: wallMs > 0 ? busyMs / wallMs : 0,
		peakConcurrency: peak,
		p50Ms: percentile(durations, 0.5),
		p95Ms: percentile(durations, 0.95),
		maxMs: Math.max(0, ...durations),
	};
}

const sourceFiles = await listEpubs(sourceRoot);
if (sourceFiles.length !== expectedBooks) {
	throw new Error(
		`Expected ${expectedBooks} EPUBs, found ${sourceFiles.length} under ${sourceRoot}`,
	);
}

// Hard links must live on the same filesystem as the source EPUBs. Keeping the
// disposable directory beside the configured root also avoids copying the
// collection before the timed scan.
const scratchDir = await fs.mkdtemp(
	path.join(path.dirname(sourceRoot), ".nanahoshi-scan-acceptance-"),
);
let temporaryLibraryId: number | null = null;
let taskId: string | null = null;
let fileWorker:
	| { pause: (force?: boolean) => Promise<void>; close: () => Promise<void> }
	| undefined;
let progressListener: { close: () => Promise<void> } | undefined;
let memoryController: { close: () => Promise<void> } | undefined;
const temporaryBookIds = new Set<number>();
const temporaryBookUuids = new Set<string>();

try {
	for (const [index, source] of sourceFiles.entries()) {
		const target = path.join(
			scratchDir,
			`${String(index).padStart(4, "0")}-${path.basename(source)}`,
		);
		await fs.link(source, target).catch((cause) => {
			throw new Error(
				`Cannot hard-link ${source} into ${scratchDir}; use a temp directory on the same filesystem`,
				{ cause },
			);
		});
	}

	const [{ db }, schema, drizzle, repositories] = await Promise.all([
		import("@nanahoshi-v2/db"),
		import("@nanahoshi-v2/db/schema/general"),
		import("drizzle-orm"),
		import("../src/routers/libraries/library.repository"),
	]);
	const { eq } = drizzle;
	const sourceLibraries = await db
		.select({
			serverId: schema.library.serverId,
			automaticGroupingEnabled: schema.library.automaticGroupingEnabled,
			metadataProviders: schema.library.metadataProviders,
			metadataConfig: schema.library.metadataConfig,
			libraryPath: schema.libraryPath.path,
		})
		.from(schema.libraryPath)
		.innerJoin(
			schema.library,
			eq(schema.libraryPath.libraryId, schema.library.id),
		);
	const sourceLibrary = sourceLibraries.find(
		(row) => path.resolve(row.libraryPath) === sourceRoot,
	);
	if (!sourceLibrary) {
		throw new Error(`No configured library owns ${sourceRoot}`);
	}

	const temporaryLibrary = await repositories.libraryRepository.create(
		{
			uuid: randomUUID(),
			name: `__scan_acceptance_${Date.now()}`,
			isCronWatch: false,
			scanIntervalMinutes: null,
			isPublic: false,
			mediaType: "ebook",
			automaticGroupingEnabled: sourceLibrary.automaticGroupingEnabled ?? true,
			metadataProviders: sourceLibrary.metadataProviders,
			metadataConfig: sourceLibrary.metadataConfig,
			autoEnrichPausedAt: new Date().toISOString(),
			paths: [scratchDir],
		},
		sourceLibrary.serverId,
	);
	temporaryLibraryId = temporaryLibrary.id;
	const temporaryPath = temporaryLibrary.paths?.[0];
	if (!temporaryPath) throw new Error("Temporary library path was not created");

	const queueCounts = await (
		await import("../src/infrastructure/queue/queues/file-event.queue")
	).fileEventQueue.getJobCounts("active", "waiting", "prioritized");
	if (
		(queueCounts.active ?? 0) +
			(queueCounts.waiting ?? 0) +
			(queueCounts.prioritized ?? 0) >
		0
	) {
		throw new Error("file-events must be idle before running acceptance");
	}

	progressListener = await (
		await import("../src/infrastructure/queue/task-progress.listener")
	).startTaskProgressListeners();
	const workerModule = await import(
		"../src/infrastructure/workers/file.event.worker"
	);
	fileWorker = workerModule.fileEventWorker;
	const { startMemoryPressureController } = await import(
		"../src/lib/memory-pressure-controller"
	);
	const { fileEventQueue } = await import(
		"../src/infrastructure/queue/queues/file-event.queue"
	);
	memoryController = startMemoryPressureController([
		{
			name: "file-event",
			worker: workerModule.fileEventWorker,
			maximumConcurrency: workerModule.fileEventMaximumConcurrency,
			readJobCounts: () =>
				fileEventQueue.getJobCounts("active", "waiting", "prioritized"),
		},
	]);

	const taskManager = await import("../src/modules/taskManager");
	const task = await taskManager.createTask({
		type: "library-scan",
		serverId: sourceLibrary.serverId,
		label: "Scan acceptance",
		libraryId: temporaryLibrary.id,
		payload: { acceptance: true },
	});
	taskId = task.id;

	const started = performance.now();
	const { scanPathLibrary } = await import(
		"../src/modules/scanning/libraryScanner"
	);
	await scanPathLibrary(
		scratchDir,
		temporaryLibrary.id,
		temporaryPath.id,
		task.id,
		"ebook",
		"full",
	);
	await taskManager.finalizeTask(task.id);

	const deadline = Date.now() + Math.max(60_000, targetSeconds * 3_000);
	let completedTask = await taskManager.getTask(task.id);
	while (completedTask?.status === "running" && Date.now() < deadline) {
		await Bun.sleep(50);
		completedTask = await taskManager.getTask(task.id);
	}
	const elapsedMs = performance.now() - started;
	if (completedTask?.status !== "completed") {
		throw new Error(
			`Acceptance task did not complete: ${completedTask?.status ?? "missing"}`,
		);
	}

	const books = await db
		.select({ id: schema.book.id, uuid: schema.book.uuid })
		.from(schema.book)
		.where(eq(schema.book.libraryId, temporaryLibrary.id));
	for (const book of books) {
		temporaryBookIds.add(book.id);
		temporaryBookUuids.add(book.uuid);
	}
	const processing = await processingMetrics(fileEventQueue, task.id);

	const result = {
		books: books.length,
		totalJobs: completedTask.totalJobs,
		completedJobs: completedTask.completedJobs,
		failedJobs: completedTask.failedJobs,
		processing,
		elapsedMs: Number(elapsedMs.toFixed(1)),
		targetMs: targetSeconds * 1000,
		passed:
			books.length === expectedBooks &&
			completedTask.completedJobs === expectedBooks &&
			completedTask.failedJobs === 0 &&
			elapsedMs <= targetSeconds * 1000,
	};
	console.log(JSON.stringify(result));
	if (!result.passed) throw new Error("Scan acceptance target was not met");
} finally {
	await memoryController?.close().catch(() => {});
	await fileWorker?.pause(true).catch(() => {});
	await fileWorker?.close().catch(() => {});
	await progressListener?.close().catch(() => {});

	const { fileEventQueue } = await import(
		"../src/infrastructure/queue/queues/file-event.queue"
	);
	const { coverIngestQueue } = await import(
		"../src/infrastructure/queue/queues/cover-ingest.queue"
	);
	if (taskId) {
		await removeTaskJobs(
			fileEventQueue,
			(data) => data.taskId === taskId,
		).catch(() => {});
		await (await import("../src/modules/taskManager"))
			.deleteTask(taskId)
			.catch(() => {});
	}
	if (temporaryBookIds.size > 0) {
		await removeTaskJobs(coverIngestQueue, (data) =>
			temporaryBookIds.has(Number(data.bookId)),
		).catch(() => {});
	}
	if (temporaryLibraryId !== null) {
		const { db } = await import("@nanahoshi-v2/db");
		const { book, library } = await import("@nanahoshi-v2/db/schema/general");
		const { eq } = await import("drizzle-orm");
		if (temporaryBookIds.size === 0) {
			const books = await db
				.select({ id: book.id, uuid: book.uuid })
				.from(book)
				.where(eq(book.libraryId, temporaryLibraryId))
				.catch(() => []);
			for (const row of books) {
				temporaryBookIds.add(row.id);
				temporaryBookUuids.add(row.uuid);
			}
			await removeTaskJobs(coverIngestQueue, (data) =>
				temporaryBookIds.has(Number(data.bookId)),
			).catch(() => {});
		}
		await db
			.delete(library)
			.where(eq(library.id, temporaryLibraryId))
			.catch(() => {});
	}
	await removeCoverArtifacts(temporaryBookUuids);
	await fs.rm(scratchDir, { recursive: true, force: true });
	await fileEventQueue.close().catch(() => {});
	await coverIngestQueue.close().catch(() => {});
	await (await import("@nanahoshi-v2/db")).pool.end().catch(() => {});
	await (await import("../src/infrastructure/queue/redis")).redis
		.quit()
		.catch(() => {});
}
