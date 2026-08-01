import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";

mock.module("@nanahoshi-v2/env/server", () => ({
	env: {
		DATABASE_URL: "postgres://mock",
		NAMESPACE_UUID: "00000000-0000-4000-8000-000000000000",
		WORKER_CONCURRENCY: 2,
	},
}));

/**
 * Unit tests for the library scanner (scanPathLibrary).
 *
 * We mock all external dependencies (db, queue, filesystem, hashing) so these
 * tests run without any infrastructure. The mocks simulate Drizzle's chainable
 * query builder by returning objects whose methods return `this`, and that
 * resolve to the values in `selectResults` when awaited.
 *
 * The scanner pipeline issues selects in this order (ebook scan):
 *   [0] loadKnownFiles  — scanned_file rows of this library path
 *   [1] dedupe          — library_path rows of the library (empty → dedupe ends)
 *   [2] dedupe          — hashes with count > 1
 *   [3] dedupe          — rows in duplicate groups or already marked duplicate
 *   [4] dedupe          — books at those relative paths (only if [3] non-empty)
 *   [n] createEbookJobs — "verified" rows, repeated until an empty page
 *   […] summary         — status counts
 * Missing entries in `selectResults` resolve to [].
 *
 * Run with:
 *   bun test packages/api/src/modules/__tests__/libraryScanner.test.ts
 */

// ─── Mock: Drizzle DB ────────────────────────────────────────────────────────

type InsertCall = {
	values: Array<Record<string, unknown>>;
	conflictConfig: Record<string, unknown> | null;
};
const insertCalls: InsertCall[] = [];

type UpdateCall = {
	setValues: Record<string, unknown>;
	where?: unknown;
};
const updateCalls: UpdateCall[] = [];

let deleteCallCount = 0;

// Each awaited select() resolves to the next entry in this array, in order.
let selectResults: Array<Array<Record<string, unknown>>> = [];
let selectCallIndex = 0;

function createSelectChain() {
	const chain = Promise.resolve().then(() => {
		const result = selectResults[selectCallIndex] ?? [];
		selectCallIndex++;
		return result;
	}) as Promise<Array<Record<string, unknown>>> & {
		from: ReturnType<typeof mock>;
		where: ReturnType<typeof mock>;
		groupBy: ReturnType<typeof mock>;
		having: ReturnType<typeof mock>;
		orderBy: ReturnType<typeof mock>;
		limit: ReturnType<typeof mock>;
		offset: ReturnType<typeof mock>;
	};

	chain.from = mock(() => chain);
	chain.where = mock(() => chain);
	chain.groupBy = mock(() => chain);
	chain.having = mock(() => chain);
	chain.orderBy = mock(() => chain);
	chain.limit = mock(() => chain);
	chain.offset = mock(() => chain);
	return chain;
}

function createInsertChain() {
	const call: InsertCall = {
		values: [],
		conflictConfig: null,
	};
	const chain = Promise.resolve(undefined) as Promise<void> & {
		values: ReturnType<typeof mock>;
		onConflictDoUpdate: ReturnType<typeof mock>;
		onConflictDoNothing: ReturnType<typeof mock>;
		returning: ReturnType<typeof mock>;
	};

	chain.values = mock((v: unknown) => {
		call.values = Array.isArray(v) ? (v as Array<Record<string, unknown>>) : [];
		return chain;
	});
	chain.onConflictDoUpdate = mock((config: unknown) => {
		const safeConfig =
			config && typeof config === "object"
				? (config as Record<string, unknown>)
				: {};
		call.conflictConfig = { type: "update", ...safeConfig };
		insertCalls.push(call);
		return chain;
	});
	chain.onConflictDoNothing = mock((config: unknown) => {
		const safeConfig =
			config && typeof config === "object"
				? (config as Record<string, unknown>)
				: {};
		call.conflictConfig = { type: "nothing", ...safeConfig };
		insertCalls.push(call);
		return chain;
	});
	chain.returning = mock(() => []);
	return chain;
}

function createUpdateChain() {
	const call: UpdateCall = { setValues: {} };
	const chain = Promise.resolve(undefined) as Promise<void> & {
		set: ReturnType<typeof mock>;
		where: ReturnType<typeof mock>;
	};

	chain.set = mock((values: unknown) => {
		call.setValues =
			values && typeof values === "object"
				? (values as Record<string, unknown>)
				: {};
		updateCalls.push(call);
		return chain;
	});
	chain.where = mock((condition: unknown) => {
		call.where = condition;
		return chain;
	});
	return chain;
}

// Collects leaf values (columns as mocked strings, bound params) from a
// where-clause SQL tree so tests can assert what a condition filters on.
function collectParamValues(node: unknown, out: unknown[] = []): unknown[] {
	if (typeof node === "string" || typeof node === "number") {
		out.push(node);
		return out;
	}
	if (!node || typeof node !== "object") return out;
	if (Array.isArray(node)) {
		for (const item of node) collectParamValues(item, out);
		return out;
	}
	const record = node as { constructor?: { name?: string }; value?: unknown };
	if (record.constructor?.name === "Param") {
		out.push(record.value);
		return out;
	}
	const chunks = (node as { queryChunks?: unknown[] }).queryChunks;
	if (Array.isArray(chunks)) collectParamValues(chunks, out);
	return out;
}

function createDeleteChain() {
	const chain = Promise.resolve(undefined) as Promise<void> & {
		where: ReturnType<typeof mock>;
	};

	chain.where = mock(() => {
		deleteCallCount++;
		return chain;
	});
	return chain;
}

const mockInsert = mock(() => createInsertChain());
const mockSelect = mock(() => createSelectChain());
const mockUpdate = mock(() => createUpdateChain());
const mockDelete = mock(() => createDeleteChain());

// Book filehash migrations (rehashFilehashBatch) land here as raw updates.
const bookRehashCalls: Array<{ relativePaths: string[]; hashes: string[] }> =
	[];
// In-place scanned_file re-hashes (rehashBatch) land here.
const scannedRehashCalls: Array<{ paths: string[]; hashes: string[] }> = [];

// upsertBatch runs a raw unnest statement via db.execute; decode its six array
// params back into row objects so tests can assert on them like insert values.
const mockExecute = mock((node: unknown) => {
	const query = new PgDialect().sqlToQuery(node as SQL);
	if (query.sql.includes("update book")) {
		const [relativePaths, hashes] = query.params as [string[], string[]];
		bookRehashCalls.push({ relativePaths, hashes });
		return Promise.resolve([]);
	}
	if (query.sql.includes("update scanned_file")) {
		const [paths, hashes] = query.params as [string[], string[]];
		scannedRehashCalls.push({ paths, hashes });
		return Promise.resolve([]);
	}
	const [paths, libraryPathIds, sizes, mtimes, statuses, hashes] =
		query.params as [
			string[],
			number[],
			number[],
			string[],
			string[],
			string[],
		];
	insertCalls.push({
		values: paths.map((path, i) => ({
			path,
			libraryPathId: libraryPathIds[i],
			size: sizes[i],
			mtime: mtimes[i],
			status: statuses[i],
			hash: hashes[i],
		})),
		conflictConfig: /on conflict \(path, library_path_id\) do update/.test(
			query.sql,
		)
			? { type: "update", target: ["path", "library_path_id"] }
			: null,
	});
	return Promise.resolve([]);
});

mock.module("@nanahoshi-v2/db", () => ({
	db: {
		insert: mockInsert,
		select: mockSelect,
		update: mockUpdate,
		delete: mockDelete,
		execute: mockExecute,
	},
}));

// Re-export all real schema exports plus override scannedFile with a simple mock.
// This prevents mock pollution across test files that share the same Bun process.
const realSchema = await import("@nanahoshi-v2/db/schema/general");
mock.module("@nanahoshi-v2/db/schema/general", () => ({
	...realSchema,
	scannedFile: {
		path: "path",
		libraryPathId: "library_path_id",
		size: "size",
		mtime: "mtime",
		status: "status",
		hash: "hash",
		id: "id",
		error: "error",
		createdAt: "created_at",
		updatedAt: "updated_at",
	},
}));

// ─── Mock: BullMQ queue ──────────────────────────────────────────────────────

const mockAddBulk = mock(() => Promise.resolve());
const mockGetJobCountByTypes = mock(() => Promise.resolve(0));
mock.module("../../../infrastructure/queue/queues/file-event.queue", () => ({
	fileEventQueue: {
		addBulk: mockAddBulk,
		getJobCountByTypes: mockGetJobCountByTypes,
	},
}));

// Most scanner tests exercise the first/full walk. Directory mtime behaviour
// has its own focused cases, so keep this advisory cache empty by default.
let directoryMtimes: Array<{ path: string; mtimeMs: number }> = [];
const mockDirectoryUpsert = mock(() => Promise.resolve());
const mockDirectoryPrune = mock(() => Promise.resolve());
mock.module("../scannedDirectory.repository", () => ({
	scannedDirectoryRepository: {
		loadByLibraryPath: mock(() => Promise.resolve(directoryMtimes)),
		upsertBatch: mockDirectoryUpsert,
		pruneMissing: mockDirectoryPrune,
	},
}));

// ─── Mock: utility functions & filesystem ────────────────────────────────────

// `contentHashes` lets tests force two paths to share a content hash.
let contentHashes: Record<string, string | null> = {};
mock.module("../../../utils/misc", () => ({
	calculateContentHash: mock((filePath: string) =>
		Promise.resolve(
			Object.hasOwn(contentHashes, filePath)
				? contentHashes[filePath]
				: `content-${filePath}`,
		),
	),
	// Test rows use "content-*" hashes (current) and "legacy-*" (old format).
	isCurrentHashFormat: mock((hash: string) => !hash.startsWith("legacy-")),
	formatBytes: mock((bytes: number) => `${bytes} bytes`),
	generateDeterministicUUID: mock(
		(filename: string, hash: string) => `uuid-${filename}-${hash}`,
	),
}));

// `fgFiles` controls which file paths fast-glob "finds" during a scan.
let fgFiles: string[] = [];
let fgStreamError: Error | null = null;
mock.module("fast-glob", () => ({
	default: {
		stream: mock((_pattern: string, options?: { suppressErrors?: boolean }) => {
			let index = 0;
			return {
				[Symbol.asyncIterator]: () => ({
					next: () => {
						if (fgStreamError && options?.suppressErrors !== true) {
							return Promise.reject(fgStreamError);
						}
						if (index < fgFiles.length) {
							return Promise.resolve({
								done: false,
								value: fgFiles[index++],
							});
						}
						return Promise.resolve({ done: true, value: undefined });
					},
				}),
			};
		}),
	},
}));

// Default stat result; override per path with `statResults`.
// `fsAccessErrors` makes fs.access reject for a path (simulates unmounted root).
const FIXED_MTIME = new Date("2025-01-01T00:00:00Z").getTime();
let statResults: Record<string, { size: number; mtimeMs: number }> = {};
type DirectoryEntry = {
	name: string;
	isDirectory: () => boolean;
	isFile: () => boolean;
};
let directoryEntries: Record<string, DirectoryEntry[]> = {};
const fsStatErrors = new Set<string>();
const fsAccessErrors = new Set<string>();
const fsReaddirErrors = new Set<string>();
mock.module("fs/promises", () => ({
	default: {
		stat: mock((filePath: string) => {
			if (fsStatErrors.has(filePath)) {
				return Promise.reject(new Error(`ENOENT: no such file ${filePath}`));
			}
			return Promise.resolve(
				statResults[filePath] ?? { size: 1024, mtimeMs: FIXED_MTIME },
			);
		}),
		access: mock((filePath: string) => {
			if (fsAccessErrors.has(filePath)) {
				return Promise.reject(new Error(`ENOENT: no such dir ${filePath}`));
			}
			return Promise.resolve();
		}),
		readdir: mock((directory: string) => {
			if (fsReaddirErrors.has(directory)) {
				return Promise.reject(new Error(`EACCES: cannot read ${directory}`));
			}
			return Promise.resolve(directoryEntries[directory] ?? []);
		}),
	},
}));

// ─── Mock: taskManager (cancellation + reserve) ──────────────────────────────

// `cancelAfterChecks` simulates a cancel arriving mid-scan: checkpoints pass
// until the counter runs out, then every later checkpoint throws.
let cancelAfterChecks: number | null = null;
let checkpointCalls = 0;
const mockReserve = mock(() => Promise.resolve());
class TaskCancelledError extends Error {
	constructor(taskId: string) {
		super(`Task ${taskId} was cancelled`);
		this.name = "TaskCancelledError";
	}
}
mock.module("../../taskManager", () => ({
	reserve: mockReserve,
	throwIfTaskCancelled: mock(async (taskId?: string) => {
		if (!taskId || cancelAfterChecks === null) return;
		checkpointCalls++;
		if (checkpointCalls > cancelAfterChecks) {
			throw new TaskCancelledError(taskId);
		}
	}),
}));

// Silence pino output and keep the scanner's logging observable if needed.
const loggerMock = {
	info: mock(() => {}),
	warn: mock(() => {}),
	error: mock(() => {}),
	debug: mock(() => {}),
	child: mock(() => loggerMock),
};
mock.module("../../../lib/logger", () => ({ logger: loggerMock }));

// ─── Import module under test (after all mocks are registered) ───────────────

const { scanPathLibrary } = await import("../libraryScanner");

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** A scanned_file row that matches the default fs.stat mock (unchanged file). */
function knownRow(
	id: number,
	path: string,
	overrides: Partial<Record<string, unknown>> = {},
) {
	return {
		id,
		path,
		size: 1024,
		mtime: new Date(FIXED_MTIME),
		status: "done",
		hash: `content-${path}`,
		libraryPathId: 100,
		...overrides,
	};
}

function resetTracking() {
	insertCalls.length = 0;
	bookRehashCalls.length = 0;
	scannedRehashCalls.length = 0;
	updateCalls.length = 0;
	deleteCallCount = 0;
	directoryMtimes = [];
	directoryEntries = {};
	mockDirectoryUpsert.mockClear();
	mockDirectoryPrune.mockClear();
	selectCallIndex = 0;
	mockInsert.mockClear();
	mockExecute.mockClear();
	mockSelect.mockClear();
	mockUpdate.mockClear();
	mockDelete.mockClear();
	mockAddBulk.mockClear();
	mockGetJobCountByTypes.mockClear();
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("libraryScanner", () => {
	beforeEach(() => {
		resetTracking();
		selectResults = [];
		fgFiles = [];
		fgStreamError = null;
		contentHashes = {};
		statResults = {};
		fsStatErrors.clear();
		fsAccessErrors.clear();
		fsReaddirErrors.clear();
		cancelAfterChecks = null;
		checkpointCalls = 0;
		mockReserve.mockClear();
	});

	// ─── Root guard ─────────────────────────────────────────────────────────

	describe("Root guard", () => {
		test("an inaccessible root (unmounted disk) aborts the scan before pruning anything", async () => {
			fsAccessErrors.add("/library");
			selectResults = [
				[
					knownRow(1, "/library/book1.epub"),
					knownRow(2, "/library/book2.epub"),
				],
			];

			await expect(scanPathLibrary("/library", 1, 100)).rejects.toThrow(
				"not accessible",
			);

			// Nothing was deleted and no delete events were queued
			expect(mockAddBulk).not.toHaveBeenCalled();
			expect(mockDelete).not.toHaveBeenCalled();
			expect(deleteCallCount).toBe(0);
		});
	});

	// ─── Cancellation ───────────────────────────────────────────────────────

	describe("Cancellation", () => {
		test("a cancel before discovery stops the scan before any write", async () => {
			fgFiles = ["/library/book1.epub", "/library/book2.epub"];
			cancelAfterChecks = 0;

			await expect(
				scanPathLibrary("/library", 1, 100, "task-1"),
			).rejects.toBeInstanceOf(TaskCancelledError);

			expect(insertCalls.length).toBe(0);
			expect(mockAddBulk).not.toHaveBeenCalled();
			expect(deleteCallCount).toBe(0);
		});

		test("a cancel after discovery keeps the upserts but skips pruning and job creation", async () => {
			// One new file on disk, one known row whose file vanished (prune bait).
			fgFiles = ["/library/new.epub"];
			selectResults = [[knownRow(1, "/library/gone.epub")]];
			cancelAfterChecks = 1;

			await expect(
				scanPathLibrary("/library", 1, 100, "task-1"),
			).rejects.toBeInstanceOf(TaskCancelledError);

			// Discovery committed its batch — self-healing "pending" rows the next
			// scan will promote and enqueue.
			expect(insertCalls.length).toBe(1);
			expect(insertCalls[0].values[0].path).toBe("/library/new.epub");
			// The vanished file was NOT pruned and no delete events were queued.
			expect(deleteCallCount).toBe(0);
			expect(mockAddBulk).not.toHaveBeenCalled();
		});

		test("a cancel before job creation skips enqueuing entirely", async () => {
			fgFiles = ["/library/book1.epub"];
			cancelAfterChecks = 4;

			await expect(
				scanPathLibrary("/library", 1, 100, "task-1"),
			).rejects.toBeInstanceOf(TaskCancelledError);

			expect(mockAddBulk).not.toHaveBeenCalled();
			expect(mockReserve).not.toHaveBeenCalled();
		});

		test("a scan with a taskId that is never cancelled completes normally", async () => {
			fgFiles = ["/library/book1.epub"];
			cancelAfterChecks = null;

			await scanPathLibrary("/library", 1, 100, "task-1");

			expect(insertCalls.length).toBe(1);
		});
	});

	// ─── Phase 1 — Discover ─────────────────────────────────────────────────

	describe("Phase 1 — Discover", () => {
		test("new files are upserted as pending with a content hash, conflict target (path, libraryPathId)", async () => {
			fgFiles = ["/library/book1.epub", "/library/book2.epub"];

			await scanPathLibrary("/library", 1, 100);

			expect(insertCalls.length).toBe(1);
			const upsert = insertCalls[0];
			expect(upsert.conflictConfig?.type).toBe("update");
			expect(upsert.conflictConfig?.target).toEqual([
				"path",
				"library_path_id",
			]);
			expect(upsert.values.length).toBe(2);
			for (const val of upsert.values) {
				expect(val.libraryPathId).toBe(100);
				expect(val.status).toBe("pending");
			}
			expect(upsert.values[0].path).toBe("/library/book1.epub");
			expect(upsert.values[0].hash).toBe("content-/library/book1.epub");
			expect(upsert.values[0].size).toBe(1024);
		});

		test("unchanged files (same size and mtime) are not re-upserted", async () => {
			fgFiles = ["/library/book1.epub"];
			selectResults = [[knownRow(1, "/library/book1.epub")]];

			await scanPathLibrary("/library", 1, 100);

			expect(insertCalls.length).toBe(0);
			expect(scannedRehashCalls.length).toBe(0);
		});

		test("a modified file (size changed) is re-hashed and upserted as pending", async () => {
			fgFiles = ["/library/book1.epub"];
			statResults["/library/book1.epub"] = { size: 2048, mtimeMs: FIXED_MTIME };
			selectResults = [[knownRow(1, "/library/book1.epub")]];

			await scanPathLibrary("/library", 1, 100);

			expect(insertCalls.length).toBe(1);
			expect(insertCalls[0].values[0].status).toBe("pending");
			expect(insertCalls[0].values[0].size).toBe(2048);
			expect(insertCalls[0].values[0].hash).toBe("content-/library/book1.epub");
		});

		test("legacy rows (size-only hash) are re-hashed in place without resetting their status", async () => {
			fgFiles = ["/library/book1.epub"];
			selectResults = [
				[knownRow(1, "/library/book1.epub", { hash: "legacy-1024" })],
			];

			await scanPathLibrary("/library", 1, 100);

			expect(insertCalls.length).toBe(0);
			// rehashBatch updates hash in place (status untouched, so no re-enqueue)
			expect(scannedRehashCalls.length).toBe(1);
			expect(scannedRehashCalls[0].paths).toEqual(["/library/book1.epub"]);
			expect(scannedRehashCalls[0].hashes).toEqual([
				"content-/library/book1.epub",
			]);
			// book.filehash is migrated alongside, keyed by relative path
			expect(bookRehashCalls.length).toBe(1);
			expect(bookRehashCalls[0].relativePaths).toEqual(["book1.epub"]);
			expect(bookRehashCalls[0].hashes).toEqual([
				"content-/library/book1.epub",
			]);
		});

		test("fs.stat error on one file processes the rest before rejecting the incomplete scan", async () => {
			fgFiles = [
				"/library/good1.epub",
				"/library/broken.epub",
				"/library/good2.epub",
			];
			fsStatErrors.add("/library/broken.epub");

			await expect(scanPathLibrary("/library", 1, 100)).rejects.toBeInstanceOf(
				AggregateError,
			);

			expect(insertCalls.length).toBe(1);
			const insertedPaths = insertCalls[0].values.map((v) => v.path);
			expect(insertedPaths).toContain("/library/good1.epub");
			expect(insertedPaths).toContain("/library/good2.epub");
			expect(insertedPaths).not.toContain("/library/broken.epub");
		});

		test("a failed stat protects the known file from pruning and rejects the incomplete scan", async () => {
			fgFiles = ["/library/broken.epub"];
			fsStatErrors.add("/library/broken.epub");
			selectResults = [[knownRow(1, "/library/broken.epub")]];

			await expect(scanPathLibrary("/library", 1, 100)).rejects.toBeInstanceOf(
				AggregateError,
			);

			expect(mockAddBulk).not.toHaveBeenCalled();
			expect(mockDelete).not.toHaveBeenCalled();
		});

		test("a nested readdir failure protects descendants and does not persist the failed directory mtime", async () => {
			const nested = "/library/nested";
			const file = `${nested}/book.epub`;
			directoryMtimes = [{ path: nested, mtimeMs: FIXED_MTIME - 1 }];
			directoryEntries = {
				"/library": [
					{
						name: "nested",
						isDirectory: () => true,
						isFile: () => false,
					},
				],
			};
			fsReaddirErrors.add(nested);
			selectResults = [[knownRow(1, file)]];

			await expect(scanPathLibrary("/library", 1, 100)).rejects.toBeInstanceOf(
				AggregateError,
			);

			expect(mockDelete).not.toHaveBeenCalled();
			const persistedDirectories = mockDirectoryUpsert.mock
				.calls[0][1] as Array<{
				path: string;
			}>;
			expect(
				persistedDirectories.map((directory) => directory.path),
			).not.toContain(nested);
		});

		test("a failed directory stat protects descendants and is not persisted", async () => {
			const nested = "/library/nested";
			const file = `${nested}/book.epub`;
			directoryMtimes = [{ path: nested, mtimeMs: FIXED_MTIME }];
			directoryEntries = {
				"/library": [
					{
						name: "nested",
						isDirectory: () => true,
						isFile: () => false,
					},
				],
			};
			fsStatErrors.add(nested);
			selectResults = [[knownRow(1, file)]];

			await expect(scanPathLibrary("/library", 1, 100)).rejects.toBeInstanceOf(
				AggregateError,
			);

			expect(mockDelete).not.toHaveBeenCalled();
			const persistedDirectories = mockDirectoryUpsert.mock
				.calls[0][1] as Array<{
				path: string;
			}>;
			expect(
				persistedDirectories.map((directory) => directory.path),
			).not.toContain(nested);
		});

		test("a glob error rejects the scan instead of treating discovery as complete", async () => {
			fgStreamError = new Error("glob failed");
			selectResults = [[knownRow(1, "/library/book.epub")]];

			await expect(scanPathLibrary("/library", 1, 100)).rejects.toThrow(
				"glob failed",
			);

			expect(mockDelete).not.toHaveBeenCalled();
		});

		test("a changed file hash failure protects the known row while other hashes persist", async () => {
			const broken = "/library/broken.epub";
			const good = "/library/good.epub";
			fgFiles = [broken, good];
			contentHashes[broken] = null;
			statResults[broken] = { size: 2048, mtimeMs: FIXED_MTIME };
			selectResults = [
				[knownRow(1, broken), knownRow(2, "/library/missing.epub")],
			];

			await expect(scanPathLibrary("/library", 1, 100)).rejects.toBeInstanceOf(
				AggregateError,
			);

			expect(insertCalls).toHaveLength(1);
			expect(insertCalls[0].values.map((row) => row.path)).toEqual([good]);
			expect(mockAddBulk).not.toHaveBeenCalled();
			expect(mockDelete).not.toHaveBeenCalled();
		});

		test("a legacy rehash failure rejects incomplete discovery while other hashes persist", async () => {
			const legacy = "/library/legacy.epub";
			const good = "/library/good.epub";
			fgFiles = [legacy, good];
			contentHashes[legacy] = null;
			selectResults = [[knownRow(1, legacy, { hash: "legacy-1024" })]];

			await expect(scanPathLibrary("/library", 1, 100)).rejects.toBeInstanceOf(
				AggregateError,
			);

			expect(insertCalls).toHaveLength(1);
			expect(insertCalls[0].values.map((row) => row.path)).toEqual([good]);
			expect(scannedRehashCalls).toHaveLength(0);
			expect(bookRehashCalls).toHaveLength(0);
			expect(mockDelete).not.toHaveBeenCalled();
		});

		test("files exceeding DB_BATCH_SIZE are upserted in multiple batches", async () => {
			fgFiles = Array.from(
				{ length: 10_001 },
				(_, i) => `/library/book${i}.epub`,
			);

			await scanPathLibrary("/library", 1, 100);

			expect(insertCalls.length).toBe(2);
			expect(insertCalls[0].values.length).toBe(10_000);
			expect(insertCalls[1].values.length).toBe(1);
		});
	});

	// ─── Phase 2 — Prune ────────────────────────────────────────────────────

	describe("Phase 2 — Prune", () => {
		test("files in DB but not on disk create delete jobs and are removed from scannedFile", async () => {
			fgFiles = ["/library/book1.epub"];
			selectResults = [
				[
					knownRow(1, "/library/book1.epub"),
					knownRow(2, "/library/subdir/gone.epub"),
				],
			];

			await scanPathLibrary("/library", 1, 100);

			expect(mockAddBulk).toHaveBeenCalled();
			const deleteJobs = mockAddBulk.mock.calls[0][0];
			expect(deleteJobs.length).toBe(1);
			expect(deleteJobs[0].data.action).toBe("delete");
			expect(deleteJobs[0].data.path).toBe("/library/subdir/gone.epub");
			expect(deleteJobs[0].data.filename).toBe("gone.epub");
			expect(deleteJobs[0].data.relativePath).toBe("subdir/gone.epub");
			expect(deleteJobs[0].data.libraryId).toBe(1);
			expect(deleteJobs[0].data.libraryPathId).toBe(100);

			expect(mockDelete).toHaveBeenCalled();
			expect(deleteCallCount).toBeGreaterThan(0);
		});

		test("audiobook folders that lost every audio file get a folder-level delete event", async () => {
			fgFiles = ["/audio/AuthorB/Keep/track1.mp3"];
			selectResults = [
				[
					knownRow(1, "/audio/AuthorB/Keep/track1.mp3"),
					knownRow(2, "/audio/AuthorA/Gone/track1.mp3"),
					knownRow(3, "/audio/AuthorA/Gone/CD 1/track2.mp3"),
				],
			];

			await scanPathLibrary("/audio", 1, 100, undefined, "audiobook");

			const allJobs = mockAddBulk.mock.calls.flatMap(
				(call: unknown[]) =>
					call[0] as Array<{
						data: { action: string; path: string; relativePath: string };
					}>,
			);
			const deleteJobs = allJobs.filter((j) => j.data.action === "delete");

			// Per-file delete events for both missing tracks
			const deletedPaths = deleteJobs.map((j) => j.data.path);
			expect(deletedPaths).toContain("/audio/AuthorA/Gone/track1.mp3");
			expect(deletedPaths).toContain("/audio/AuthorA/Gone/CD 1/track2.mp3");

			// One folder-level event for the emptied audiobook folder; the disc
			// subfolder collapses into its parent, matching the book's relativePath
			const folderDeletes = deleteJobs.filter(
				(j) => j.data.relativePath === "AuthorA/Gone",
			);
			expect(folderDeletes.length).toBe(1);

			// The folder that still has files on disk is not deleted
			expect(
				deleteJobs.some((j) => j.data.relativePath === "AuthorB/Keep"),
			).toBe(false);
		});

		test("when all DB files still exist on disk, no delete jobs are created and nothing is removed", async () => {
			fgFiles = ["/library/book1.epub", "/library/book2.epub"];
			selectResults = [
				[
					knownRow(1, "/library/book1.epub"),
					knownRow(2, "/library/book2.epub"),
				],
			];

			await scanPathLibrary("/library", 1, 100);

			expect(mockAddBulk).not.toHaveBeenCalled();
			expect(mockDelete).not.toHaveBeenCalled();
		});
	});

	// ─── Phase 3 — Dedupe ───────────────────────────────────────────────────

	describe("Phase 3 — Dedupe", () => {
		test("a new copy of an already-processed book is marked duplicate; the canonical with the book survives", async () => {
			fgFiles = ["/library/a.epub", "/library/b-copy.epub"];
			contentHashes["/library/b-copy.epub"] = "content-/library/a.epub";

			const rowA = knownRow(1, "/library/a.epub", {
				hash: "content-/library/a.epub",
			});
			const rowB = knownRow(2, "/library/b-copy.epub", {
				status: "pending",
				hash: "content-/library/a.epub",
			});

			selectResults = [
				[rowA], // known files (b-copy is new)
				[{ id: 100, path: "/library" }], // library paths
				[{ hash: "content-/library/a.epub" }], // duplicate hash groups
				[rowA, rowB], // group members
				[{ id: 7, relativePath: "a.epub", libraryPathId: 100 }], // existing books
			];

			await scanPathLibrary("/library", 1, 100);

			const duplicateUpdates = updateCalls.filter(
				(c) => c.setValues.status === "duplicate",
			);
			expect(duplicateUpdates.length).toBe(1);

			// b-copy has no book yet, so nothing is queued for deletion
			const allJobs = mockAddBulk.mock.calls.flatMap(
				(call: unknown[]) => call[0] as Array<{ data: { action: string } }>,
			);
			expect(allJobs.filter((j) => j.data.action === "delete").length).toBe(0);
		});

		test("two duplicate books already in the catalog: the oldest book is kept, the other is queued for deletion", async () => {
			fgFiles = ["/library/a.epub", "/library/b.epub"];

			const sharedHash = "content-shared";
			const rowA = knownRow(1, "/library/a.epub", { hash: sharedHash });
			const rowB = knownRow(2, "/library/b.epub", { hash: sharedHash });

			selectResults = [
				[rowA, rowB], // known files, both unchanged...
				[{ id: 100, path: "/library" }],
				[{ hash: sharedHash }],
				[rowA, rowB],
				[
					{ id: 7, relativePath: "a.epub", libraryPathId: 100 },
					{ id: 9, relativePath: "b.epub", libraryPathId: 100 },
				],
			];
			// ...so make stat agree with the rows and hashes agree with sharedHash
			contentHashes["/library/a.epub"] = sharedHash;
			contentHashes["/library/b.epub"] = sharedHash;

			await scanPathLibrary("/library", 1, 100);

			const duplicateUpdates = updateCalls.filter(
				(c) => c.setValues.status === "duplicate",
			);
			expect(duplicateUpdates.length).toBe(1);

			const allJobs = mockAddBulk.mock.calls.flatMap(
				(call: unknown[]) =>
					call[0] as Array<{
						data: { action: string; path: string; relativePath: string };
					}>,
			);
			const deleteJobs = allJobs.filter((j) => j.data.action === "delete");
			expect(deleteJobs.length).toBe(1);
			expect(deleteJobs[0].data.path).toBe("/library/b.epub");
			expect(deleteJobs[0].data.relativePath).toBe("b.epub");
		});

		test("a row stuck as duplicate whose canonical disappeared is reset to pending", async () => {
			fgFiles = ["/library/survivor.epub"];

			const orphan = knownRow(1, "/library/survivor.epub", {
				status: "duplicate",
			});

			selectResults = [
				[orphan], // known files
				[{ id: 100, path: "/library" }], // library paths
				[], // no duplicate hash groups
				[orphan], // rows still marked duplicate
				[], // no books at those paths
			];

			await scanPathLibrary("/library", 1, 100);

			const pendingUpdate = updateCalls.find(
				(c) => c.setValues.status === "pending",
			);
			expect(pendingUpdate).toBeDefined();
		});

		test("audiobook scans skip dedupe entirely", async () => {
			fgFiles = [];

			await scanPathLibrary("/audio", 1, 100, undefined, "audiobook");

			// Only loadKnownFiles, the (empty) job-creator page and the summary
			// run — no dedupe selects, no jobs.
			expect(mockAddBulk).not.toHaveBeenCalled();
			const duplicateUpdates = updateCalls.filter(
				(c) => c.setValues.status === "duplicate",
			);
			expect(duplicateUpdates.length).toBe(0);
		});
	});

	// ─── Phase 4 — Promote ──────────────────────────────────────────────────

	describe("Phase 4 — Promote", () => {
		test("remaining pending files are updated to verified status", async () => {
			fgFiles = ["/library/book1.epub"];

			await scanPathLibrary("/library", 1, 100);

			const verifiedUpdate = updateCalls.find(
				(c) => c.setValues.status === "verified",
			);
			expect(verifiedUpdate).toBeDefined();
		});

		test("failed rows are promoted alongside pending so a rescan retries them", async () => {
			fgFiles = ["/library/book1.epub"];

			await scanPathLibrary("/library", 1, 100);

			const verifiedUpdate = updateCalls.find(
				(c) => c.setValues.status === "verified",
			);
			const params = collectParamValues(verifiedUpdate?.where);
			expect(params).toContain("pending");
			expect(params).toContain("failed");
		});
	});

	// ─── Phase 5 — Job creation ─────────────────────────────────────────────

	describe("Phase 5 — Job creation", () => {
		test("job data contains all required fields with correct values", async () => {
			const testMtime = new Date("2025-06-15T12:00:00Z");
			fgFiles = [];
			selectResults = [
				[], // known files
				[], // library paths (empty → dedupe ends early)
				[
					{
						path: "/library/manga/vol-1.epub",
						size: 5120,
						mtime: testMtime,
						hash: "file-hash-abc",
						status: "verified",
						libraryPathId: 100,
					},
				],
				[], // job pagination terminator
			];

			await scanPathLibrary("/library", 1, 100);

			expect(mockAddBulk).toHaveBeenCalled();
			const job = mockAddBulk.mock.calls[0][0][0];

			expect(job.name).toBe("file-event");
			expect(job.data.action).toBe("add");
			expect(job.data.path).toBe("/library/manga/vol-1.epub");
			expect(job.data.filename).toBe("vol-1.epub");
			expect(job.data.relativePath).toBe("manga/vol-1.epub");
			expect(job.data.size).toBe(5120);
			expect(job.data.mtime).toBe(testMtime.getTime());
			expect(job.data.lastModified).toBe(testMtime.toISOString());
			expect(job.data.fileHash).toBe("file-hash-abc");
			expect(job.data.libraryId).toBe(1);
			expect(job.data.libraryPathId).toBe(100);
		});

		test("verified files exceeding the producer batch are queued in multiple batches", async () => {
			fgFiles = [];

			const makeVerifiedFile = (i: number) => ({
				path: `/library/book${i}.epub`,
				size: 1024,
				mtime: new Date("2025-01-01T00:00:00Z"),
				hash: `hash-${i}`,
				status: "verified",
				libraryPathId: 100,
			});

			selectResults = [
				[], // known files
				[], // library paths
				Array.from({ length: 250 }, (_, i) => makeVerifiedFile(i)),
				[makeVerifiedFile(250)],
				[], // job pagination terminator
			];

			await scanPathLibrary("/library", 1, 100);

			expect(mockAddBulk.mock.calls.length).toBe(2);
			expect(mockAddBulk.mock.calls[0][0].length).toBe(250);
			expect(mockAddBulk.mock.calls[1][0].length).toBe(1);
		});

		test("jobs are created with the scanned libraryPathId, not a default", async () => {
			fgFiles = [];
			selectResults = [
				[],
				[],
				[
					{
						path: "/novels/book.epub",
						size: 2048,
						mtime: new Date(),
						hash: "novel-hash",
						status: "verified",
						libraryPathId: 300,
					},
				],
				[],
			];

			await scanPathLibrary("/novels", 10, 300);

			expect(mockAddBulk).toHaveBeenCalled();
			const jobs = mockAddBulk.mock.calls[0][0];
			expect(jobs[0].data.libraryId).toBe(10);
			expect(jobs[0].data.libraryPathId).toBe(300);
			expect(jobs[0].data.action).toBe("add");
		});
	});

	// ─── Re-scan behavior ───────────────────────────────────────────────────

	describe("Re-scan behavior", () => {
		test("incremental scans preserve known files below an unchanged directory", async () => {
			const unchangedDir = "/library/unchanged";
			const file = `${unchangedDir}/book.epub`;
			directoryMtimes = [{ path: unchangedDir, mtimeMs: FIXED_MTIME }];
			directoryEntries = {
				"/library": [
					{
						name: "unchanged",
						isDirectory: () => true,
						isFile: () => false,
					},
				],
			};
			selectResults = [[knownRow(1, file)], [], [], []];

			await scanPathLibrary("/library", 1, 100);

			expect(insertCalls).toHaveLength(0);
			expect(mockDelete).not.toHaveBeenCalled();
			expect(mockAddBulk).not.toHaveBeenCalled();
		});

		test("a full scan still visits files below a cached unchanged directory", async () => {
			const unchangedDir = "/library/unchanged";
			const file = `${unchangedDir}/book.epub`;
			directoryMtimes = [{ path: unchangedDir, mtimeMs: FIXED_MTIME }];
			fgFiles = [file];
			selectResults = [[knownRow(1, file)], [], [], []];

			await scanPathLibrary("/library", 1, 100, undefined, "ebook", "full");

			expect(mockDirectoryUpsert).toHaveBeenCalled();
			expect(mockDirectoryPrune).toHaveBeenCalled();
			expect(mockDelete).not.toHaveBeenCalled();
		});

		test("file moved within library is treated as delete old path + add new path", async () => {
			fgFiles = ["/library/folder-b/book.epub"];
			selectResults = [
				[knownRow(1, "/library/folder-a/book.epub")], // known: old location
				[], // library paths (dedupe ends early)
				[
					{
						path: "/library/folder-b/book.epub",
						size: 1024,
						mtime: new Date(FIXED_MTIME),
						hash: "content-/library/folder-b/book.epub",
						status: "verified",
						libraryPathId: 100,
					},
				],
				[],
			];

			await scanPathLibrary("/library", 1, 100);

			// New location is upserted as pending
			expect(insertCalls[0].values[0].path).toBe("/library/folder-b/book.epub");
			expect(insertCalls[0].values[0].status).toBe("pending");

			const allJobs = mockAddBulk.mock.calls.flatMap(
				(call: unknown[]) =>
					call[0] as Array<{
						data: { action: string; path: string; relativePath: string };
					}>,
			);

			const deleteJob = allJobs.find((j) => j.data.action === "delete");
			expect(deleteJob).toBeDefined();
			expect(deleteJob?.data.path).toBe("/library/folder-a/book.epub");

			const addJob = allJobs.find((j) => j.data.action === "add");
			expect(addJob).toBeDefined();
			expect(addJob?.data.path).toBe("/library/folder-b/book.epub");
			expect(addJob?.data.relativePath).toBe("folder-b/book.epub");

			expect(mockDelete).toHaveBeenCalled();
		});

		test("new file added between scans is picked up without touching the existing one", async () => {
			fgFiles = ["/library/book1.epub", "/library/book2.epub"];
			selectResults = [
				[knownRow(1, "/library/book1.epub")],
				[],
				[
					{
						path: "/library/book2.epub",
						size: 1024,
						mtime: new Date(FIXED_MTIME),
						hash: "content-/library/book2.epub",
						status: "verified",
						libraryPathId: 100,
					},
				],
				[],
			];

			await scanPathLibrary("/library", 1, 100);

			expect(insertCalls.length).toBe(1);
			expect(insertCalls[0].values.length).toBe(1);
			expect(insertCalls[0].values[0].path).toBe("/library/book2.epub");

			expect(mockDelete).not.toHaveBeenCalled();

			const allJobs = mockAddBulk.mock.calls.flatMap(
				(call: unknown[]) => call[0] as Array<{ data: { action: string } }>,
			);
			expect(allJobs.filter((j) => j.data.action === "add").length).toBe(1);
		});
	});

	// ─── Regression ─────────────────────────────────────────────────────────

	describe("Regression", () => {
		test("scanning an empty directory completes without errors and creates no jobs", async () => {
			fgFiles = [];

			await scanPathLibrary("/library", 1, 100);

			expect(mockAddBulk).not.toHaveBeenCalled();
		});
	});
});
