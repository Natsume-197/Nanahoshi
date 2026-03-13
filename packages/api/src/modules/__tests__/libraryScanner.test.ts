import { beforeEach, describe, expect, mock, test } from "bun:test";

/**
 * Unit tests for the library scanner (scanPathLibrary).
 *
 * We mock all external dependencies (db, queue, filesystem, hashing) so these
 * tests run without any infrastructure. The mocks simulate Drizzle's chainable
 * query builder by returning objects whose methods return `this`, and that
 * resolve to the values in `selectResults` when awaited.
 *
 * Run with:
 *   bun test packages/api/src/modules/__tests__/libraryScanner.test.ts
 */

// ─── Mock: Drizzle DB ────────────────────────────────────────────────────────
// We capture every insert call so tests can inspect the values and conflict
// strategy that the scanner used.

type InsertCall = {
	values: Array<Record<string, unknown>>;
	conflictConfig: Record<string, unknown> | null;
};
const insertCalls: InsertCall[] = [];

type UpdateCall = {
	setValues: Record<string, unknown>;
};
const updateCalls: UpdateCall[] = [];

let deleteCallCount = 0;

// Each awaited select() resolves to the next entry in this array, in order.
// Tests populate this before calling scanPathLibrary.
let selectResults: Array<Array<Record<string, unknown>>> = [];
let selectCallIndex = 0;

function createSelectChain() {
	const chain = Promise.resolve().then(() => {
		// When the chain is awaited, pop the next result from selectResults.
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
	const chain = Promise.resolve(undefined) as Promise<void> & {
		set: ReturnType<typeof mock>;
		where: ReturnType<typeof mock>;
	};

	chain.set = mock((values: unknown) => {
		const safeValues =
			values && typeof values === "object"
				? (values as Record<string, unknown>)
				: {};
		updateCalls.push({ setValues: safeValues });
		return chain;
	});
	chain.where = mock(() => chain);
	return chain;
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

mock.module("@nanahoshi-v2/db", () => ({
	db: {
		insert: mockInsert,
		select: mockSelect,
		update: mockUpdate,
		delete: mockDelete,
	},
}));

// Re-export all real schema exports plus override scannedFile with a simple mock.
// This prevents mock pollution when other test files import from the same module.
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
mock.module("../../infrastructure/queue/queues/file-event.queue", () => ({
	fileEventQueue: {
		addBulk: mockAddBulk,
	},
}));

// ─── Mock: utility functions & filesystem ────────────────────────────────────

mock.module("../../utils/misc", () => ({
	calculateMetadataHash: mock(() => "mock-metadata-hash"),
	calculateContentHash: mock(() => Promise.resolve("mock-content-hash")),
	formatBytes: mock((bytes: number) => `${bytes} bytes`),
}));

// `fgFiles` controls which file paths fast-glob "finds" during a scan.
let fgFiles: string[] = [];
mock.module("fast-glob", () => ({
	default: {
		stream: mock(() => {
			let index = 0;
			return {
				[Symbol.asyncIterator]: () => ({
					next: () => {
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

// `fsStatErrors` controls which paths make fs.stat throw (simulates missing/unreadable files).
const fsStatErrors = new Set<string>();
mock.module("fs/promises", () => ({
	default: {
		stat: mock((filePath: string) => {
			if (fsStatErrors.has(filePath)) {
				return Promise.reject(new Error(`ENOENT: no such file ${filePath}`));
			}
			return Promise.resolve({
				size: 1024,
				mtimeMs: Date.now(),
			});
		}),
	},
}));

// ─── Import module under test (after all mocks are registered) ───────────────

const { scanPathLibrary } = await import("../libraryScanner");

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Resets all mock tracking state. Used between scans in re-scan tests. */
function resetTracking() {
	insertCalls.length = 0;
	updateCalls.length = 0;
	deleteCallCount = 0;
	selectCallIndex = 0;
	mockInsert.mockClear();
	mockSelect.mockClear();
	mockUpdate.mockClear();
	mockDelete.mockClear();
	mockAddBulk.mockClear();
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("libraryScanner", () => {
	beforeEach(() => {
		resetTracking();
		selectResults = [];
		fgFiles = [];
		fsStatErrors.clear();
	});

	// ─── Phase 1 — Scan & upsert ────────────────────────────────────────────

	describe("Phase 1 — Scan & upsert", () => {
		test("uses onConflictDoUpdate with (path, libraryPathId) and sets status to pending", async () => {
			fgFiles = ["/library/book1.epub", "/library/book2.epub"];
			selectResults = [[], [], [], [], []];

			await scanPathLibrary("/library", 1, 100);

			expect(insertCalls.length).toBeGreaterThan(0);

			const firstInsert = insertCalls[0];
			expect(firstInsert.conflictConfig.type).toBe("update");
			expect(firstInsert.conflictConfig.target).toEqual([
				"path",
				"library_path_id",
			]);

			for (const val of firstInsert.values) {
				expect(val.libraryPathId).toBe(100);
				expect(val.status).toBe("pending");
			}
		});

		test("inserted values contain correct file metadata from fs.stat", async () => {
			fgFiles = ["/library/book1.epub"];
			selectResults = [[], [], [], [], []];

			await scanPathLibrary("/library", 1, 100);

			const firstInsert = insertCalls[0];
			expect(firstInsert.values.length).toBe(1);
			expect(firstInsert.values[0].path).toBe("/library/book1.epub");
			expect(firstInsert.values[0].hash).toBe("mock-metadata-hash");
			expect(firstInsert.values[0].size).toBe(1024);
		});

		test("files exceeding DB_BATCH_SIZE are upserted in multiple batches", async () => {
			fgFiles = Array.from(
				{ length: 10_001 },
				(_, i) => `/library/book${i}.epub`,
			);
			selectResults = [[], [], [], [], []];

			await scanPathLibrary("/library", 1, 100);

			expect(mockInsert.mock.calls.length).toBe(2);
			expect(insertCalls[0].values.length).toBe(10_000);
			expect(insertCalls[1].values.length).toBe(1);
		});

		test("fs.stat error on one file skips it and continues scanning the rest", async () => {
			fgFiles = [
				"/library/good1.epub",
				"/library/broken.epub",
				"/library/good2.epub",
			];
			fsStatErrors.add("/library/broken.epub");
			selectResults = [[], [], [], [], []];

			await scanPathLibrary("/library", 1, 100);

			expect(insertCalls.length).toBe(1);
			expect(insertCalls[0].values.length).toBe(2);

			const insertedPaths = insertCalls[0].values.map((v) => v.path);
			expect(insertedPaths).toContain("/library/good1.epub");
			expect(insertedPaths).toContain("/library/good2.epub");
			expect(insertedPaths).not.toContain("/library/broken.epub");
		});

		test("conflict target includes libraryPathId so same path in different library paths are separate records", async () => {
			fgFiles = ["/shared/book.epub"];
			selectResults = [[], [], [], [], []];

			await scanPathLibrary("/shared", 2, 200);

			expect(insertCalls[0].values[0].libraryPathId).toBe(200);
			expect(insertCalls[0].conflictConfig.target).toEqual([
				"path",
				"library_path_id",
			]);
		});
	});

	// ─── Phase 1.5 — Missing file detection ─────────────────────────────────

	describe("Phase 1.5 — Missing file detection", () => {
		test("files in DB but not on disk create delete jobs and are removed from scannedFile", async () => {
			fgFiles = ["/library/book1.epub"];
			selectResults = [
				[
					{ path: "/library/book1.epub" },
					{ path: "/library/deleted-book.epub" },
				],
				[],
				[],
				[],
				[],
			];

			await scanPathLibrary("/library", 1, 100);

			expect(mockAddBulk).toHaveBeenCalled();
			const firstBulkCall = mockAddBulk.mock.calls[0][0];
			expect(firstBulkCall.length).toBe(1);
			expect(firstBulkCall[0].data.action).toBe("delete");
			expect(firstBulkCall[0].data.path).toBe("/library/deleted-book.epub");
			expect(firstBulkCall[0].data.libraryId).toBe(1);
			expect(firstBulkCall[0].data.libraryPathId).toBe(100);

			expect(mockDelete).toHaveBeenCalled();
			expect(deleteCallCount).toBeGreaterThan(0);
		});

		test("multiple missing files each get their own delete job with correct metadata", async () => {
			fgFiles = ["/library/surviving.epub"];
			selectResults = [
				[
					{ path: "/library/surviving.epub" },
					{ path: "/library/gone1.epub" },
					{ path: "/library/subdir/gone2.pdf" },
				],
				[],
				[],
				[],
				[],
			];

			await scanPathLibrary("/library", 3, 150);

			expect(mockAddBulk).toHaveBeenCalled();
			const deleteJobs = mockAddBulk.mock.calls[0][0];
			expect(deleteJobs.length).toBe(2);

			for (const job of deleteJobs) {
				expect(job.data.action).toBe("delete");
				expect(job.data.libraryId).toBe(3);
				expect(job.data.libraryPathId).toBe(150);
			}

			const deletedPaths = deleteJobs.map(
				(j: { data: { path: string } }) => j.data.path,
			);
			expect(deletedPaths).toContain("/library/gone1.epub");
			expect(deletedPaths).toContain("/library/subdir/gone2.pdf");

			const job2 = deleteJobs.find(
				(j: { data: { path: string } }) =>
					j.data.path === "/library/subdir/gone2.pdf",
			);
			expect(job2.data.filename).toBe("gone2.pdf");
		});

		test("when all DB files still exist on disk, no delete jobs are created and nothing is removed", async () => {
			fgFiles = ["/library/book1.epub", "/library/book2.epub"];
			selectResults = [
				[{ path: "/library/book1.epub" }, { path: "/library/book2.epub" }],
				[],
				[],
				[],
				[],
			];

			await scanPathLibrary("/library", 1, 100);

			expect(mockAddBulk).not.toHaveBeenCalled();
			expect(mockDelete).not.toHaveBeenCalled();
			expect(deleteCallCount).toBe(0);
		});

		test("delete jobs carry the correct libraryPathId, not another path's", async () => {
			fgFiles = ["/manga/vol1.cbz"];
			selectResults = [
				[{ path: "/manga/vol1.cbz" }, { path: "/manga/vol2.cbz" }],
				[],
				[],
				[],
				[],
			];

			await scanPathLibrary("/manga", 5, 200);

			expect(mockAddBulk).toHaveBeenCalled();
			const deleteJobs = mockAddBulk.mock.calls[0][0];
			expect(deleteJobs[0].data.action).toBe("delete");
			expect(deleteJobs[0].data.path).toBe("/manga/vol2.cbz");
			expect(deleteJobs[0].data.libraryId).toBe(5);
			expect(deleteJobs[0].data.libraryPathId).toBe(200);
		});
	});

	// ─── Phase 2 — Duplicate detection ──────────────────────────────────────

	describe("Phase 2 — Duplicate detection", () => {
		test("when no metadata hash duplicates exist, content hash verification is skipped entirely", async () => {
			fgFiles = ["/library/unique1.epub", "/library/unique2.pdf"];
			selectResults = [
				[{ path: "/library/unique1.epub" }, { path: "/library/unique2.pdf" }],
				[],
				[],
				[],
				[],
			];

			await scanPathLibrary("/library", 1, 100);

			const contentHashUpdates = updateCalls.filter(
				(c) => c.setValues.hash !== undefined,
			);
			expect(contentHashUpdates.length).toBe(0);
		});
	});

	// ─── Phase 3 — Duplicate marking ────────────────────────────────────────

	describe("Phase 3 — Duplicate marking", () => {
		test("first file alphabetically is primary, rest are marked as duplicate", async () => {
			fgFiles = ["/library/a-original.epub", "/library/b-copy.epub"];
			selectResults = [
				[
					{ path: "/library/a-original.epub" },
					{ path: "/library/b-copy.epub" },
				],
				[{ hash: "mock-metadata-hash", count: 2 }],
				[
					{
						path: "/library/a-original.epub",
						size: 1024,
						libraryPathId: 100,
					},
					{
						path: "/library/b-copy.epub",
						size: 1024,
						libraryPathId: 100,
					},
				],
				[{ hash: "mock-content-hash", count: 2 }],
				[
					{
						id: "id-1",
						path: "/library/a-original.epub",
						size: 1024,
						libraryPathId: 100,
					},
					{
						id: "id-2",
						path: "/library/b-copy.epub",
						size: 1024,
						libraryPathId: 100,
					},
				],
				[],
				[],
			];

			await scanPathLibrary("/library", 1, 100);

			const duplicateUpdate = updateCalls.find(
				(c) => c.setValues.status === "duplicate",
			);
			expect(duplicateUpdate).toBeDefined();

			const verifiedUpdate = updateCalls.find(
				(c) => c.setValues.status === "verified",
			);
			expect(verifiedUpdate).toBeDefined();
		});

		test("remaining pending files are updated to verified status", async () => {
			fgFiles = ["/library/book1.epub"];
			selectResults = [[], [], [], [], []];

			await scanPathLibrary("/library", 1, 100);

			const verifiedUpdate = updateCalls.find(
				(c) => c.setValues.status === "verified",
			);
			expect(verifiedUpdate).toBeDefined();
		});
	});

	// ─── Phase 4 — Job creation ─────────────────────────────────────────────

	describe("Phase 4 — Job creation", () => {
		test("created jobs carry libraryId and libraryPathId so the worker knows which library owns each file", async () => {
			fgFiles = ["/library/book1.epub"];
			selectResults = [
				[],
				[],
				[],
				[
					{
						path: "/library/book1.epub",
						size: 1024,
						mtime: new Date(),
						hash: "test-hash",
						status: "verified",
						libraryPathId: 100,
					},
				],
				[],
				[],
			];

			await scanPathLibrary("/library", 1, 100);

			expect(mockAddBulk).toHaveBeenCalled();
			const jobs = mockAddBulk.mock.calls[0][0];
			expect(jobs[0].data.libraryId).toBe(1);
			expect(jobs[0].data.libraryPathId).toBe(100);
			expect(jobs[0].data.action).toBe("add");
		});

		test("job data contains all required fields with correct values", async () => {
			const testMtime = new Date("2025-06-15T12:00:00Z");
			fgFiles = ["/library/manga/vol-1.cbz"];
			selectResults = [
				[],
				[],
				[],
				[
					{
						path: "/library/manga/vol-1.cbz",
						size: 5120,
						mtime: testMtime,
						hash: "file-hash-abc",
						status: "verified",
						libraryPathId: 100,
					},
				],
				[],
				[],
			];

			await scanPathLibrary("/library", 1, 100);

			expect(mockAddBulk).toHaveBeenCalled();
			const job = mockAddBulk.mock.calls[0][0][0];

			expect(job.name).toBe("file-event");
			expect(job.data.action).toBe("add");
			expect(job.data.path).toBe("/library/manga/vol-1.cbz");
			expect(job.data.filename).toBe("vol-1.cbz");
			expect(job.data.relativePath).toBe("manga/vol-1.cbz");
			expect(job.data.size).toBe(5120);
			expect(job.data.mtime).toBe(testMtime.getTime());
			expect(job.data.lastModified).toBe(testMtime.toISOString());
			expect(job.data.fileHash).toBe("file-hash-abc");
			expect(job.data.libraryId).toBe(1);
			expect(job.data.libraryPathId).toBe(100);
		});

		test("verified files exceeding JOB_BATCH_SIZE are queued in multiple batches", async () => {
			fgFiles = ["/library/book.epub"];

			const makeVerifiedFile = (i: number) => ({
				path: `/library/book${i}.epub`,
				size: 1024,
				mtime: new Date("2025-01-01T00:00:00Z"),
				hash: `hash-${i}`,
				status: "verified",
				libraryPathId: 100,
			});

			selectResults = [
				[],
				[],
				[],
				Array.from({ length: 10_000 }, (_, i) => makeVerifiedFile(i)),
				[makeVerifiedFile(10_000)],
				[],
				[],
			];

			await scanPathLibrary("/library", 1, 100);

			expect(mockAddBulk.mock.calls.length).toBe(2);
			expect(mockAddBulk.mock.calls[0][0].length).toBe(10_000);
			expect(mockAddBulk.mock.calls[1][0].length).toBe(1);
		});

		test("jobs are created with the scanned libraryPathId, not a default", async () => {
			fgFiles = ["/novels/book.epub"];
			selectResults = [
				[],
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
				[],
			];

			await scanPathLibrary("/novels", 10, 300);

			expect(mockAddBulk).toHaveBeenCalled();
			const jobs = mockAddBulk.mock.calls[0][0];
			expect(jobs[0].data.libraryId).toBe(10);
			expect(jobs[0].data.libraryPathId).toBe(300);
			expect(jobs[0].data.action).toBe("add");
			expect(jobs[0].data.filename).toBe("book.epub");
		});
	});

	// ─── Re-scan behavior ───────────────────────────────────────────────────

	describe("Re-scan behavior", () => {
		test("running twice resets existing files back to pending via onConflictDoUpdate", async () => {
			fgFiles = ["/library/book1.epub", "/library/book2.epub"];
			selectResults = [[], [], [], [], []];
			await scanPathLibrary("/library", 1, 100);

			const firstScanInserts = [...insertCalls];
			expect(firstScanInserts.length).toBeGreaterThan(0);
			expect(firstScanInserts[0].conflictConfig.type).toBe("update");

			resetTracking();

			selectResults = [
				[{ path: "/library/book1.epub" }, { path: "/library/book2.epub" }],
				[],
				[],
				[
					{
						path: "/library/book1.epub",
						size: 1024,
						mtime: new Date(),
						hash: "mock-metadata-hash",
						status: "verified",
						libraryPathId: 100,
					},
					{
						path: "/library/book2.epub",
						size: 1024,
						mtime: new Date(),
						hash: "mock-metadata-hash",
						status: "verified",
						libraryPathId: 100,
					},
				],
				[],
				[],
			];

			await scanPathLibrary("/library", 1, 100);

			expect(insertCalls.length).toBeGreaterThan(0);
			expect(insertCalls[0].conflictConfig.type).toBe("update");
			for (const val of insertCalls[0].values) {
				expect(val.status).toBe("pending");
			}

			expect(mockDelete).not.toHaveBeenCalled();

			expect(mockAddBulk).toHaveBeenCalled();
			const jobs = mockAddBulk.mock.calls[0][0];
			expect(jobs.length).toBe(2);
			expect(jobs[0].data.action).toBe("add");
			expect(jobs[1].data.action).toBe("add");
		});

		test("file removed between scans creates a delete job on second scan", async () => {
			fgFiles = ["/library/book1.epub", "/library/book2.epub"];
			selectResults = [[], [], [], [], []];
			await scanPathLibrary("/library", 1, 100);

			resetTracking();

			fgFiles = ["/library/book1.epub"];
			selectResults = [
				[{ path: "/library/book1.epub" }, { path: "/library/book2.epub" }],
				[],
				[],
				[],
				[],
			];

			await scanPathLibrary("/library", 1, 100);

			expect(mockAddBulk).toHaveBeenCalled();
			const deleteJobs = mockAddBulk.mock.calls[0][0];
			expect(deleteJobs.length).toBe(1);
			expect(deleteJobs[0].data.action).toBe("delete");
			expect(deleteJobs[0].data.path).toBe("/library/book2.epub");
			expect(deleteJobs[0].data.filename).toBe("book2.epub");

			expect(mockDelete).toHaveBeenCalled();
			expect(deleteCallCount).toBeGreaterThan(0);
		});

		test("new file added between scans is picked up on second scan", async () => {
			fgFiles = ["/library/book1.epub"];
			selectResults = [[], [], [], [], []];
			await scanPathLibrary("/library", 1, 100);

			resetTracking();

			fgFiles = ["/library/book1.epub", "/library/book2.epub"];
			selectResults = [
				[{ path: "/library/book1.epub" }],
				[],
				[],
				[
					{
						path: "/library/book1.epub",
						size: 1024,
						mtime: new Date(),
						hash: "mock-metadata-hash",
						status: "verified",
						libraryPathId: 100,
					},
					{
						path: "/library/book2.epub",
						size: 1024,
						mtime: new Date(),
						hash: "mock-metadata-hash",
						status: "verified",
						libraryPathId: 100,
					},
				],
				[],
				[],
			];

			await scanPathLibrary("/library", 1, 100);

			expect(insertCalls[0].values.length).toBe(2);
			const insertedPaths = insertCalls[0].values.map((v) => v.path);
			expect(insertedPaths).toContain("/library/book1.epub");
			expect(insertedPaths).toContain("/library/book2.epub");

			expect(mockDelete).not.toHaveBeenCalled();

			expect(mockAddBulk).toHaveBeenCalled();
			const jobs = mockAddBulk.mock.calls[0][0];
			expect(jobs.length).toBe(2);
		});

		test("file moved within library is treated as delete old path + add new path", async () => {
			fgFiles = ["/library/folder-a/book.epub"];
			selectResults = [[], [], [], [], []];
			await scanPathLibrary("/library", 1, 100);

			resetTracking();

			fgFiles = ["/library/folder-b/book.epub"];
			selectResults = [
				[{ path: "/library/folder-a/book.epub" }],
				[],
				[],
				[
					{
						path: "/library/folder-b/book.epub",
						size: 1024,
						mtime: new Date(),
						hash: "mock-metadata-hash",
						status: "verified",
						libraryPathId: 100,
					},
				],
				[],
				[],
			];

			await scanPathLibrary("/library", 1, 100);

			expect(insertCalls[0].values.length).toBe(1);
			expect(insertCalls[0].values[0].path).toBe("/library/folder-b/book.epub");

			expect(mockAddBulk).toHaveBeenCalled();
			const allJobs = mockAddBulk.mock.calls.flatMap(
				(call: unknown[]) => call[0],
			);

			const deleteJob = allJobs.find(
				(j: { data: { action: string } }) => j.data.action === "delete",
			);
			expect(deleteJob).toBeDefined();
			expect(deleteJob.data.path).toBe("/library/folder-a/book.epub");
			expect(deleteJob.data.filename).toBe("book.epub");

			const addJob = allJobs.find(
				(j: { data: { action: string } }) => j.data.action === "add",
			);
			expect(addJob).toBeDefined();
			expect(addJob.data.path).toBe("/library/folder-b/book.epub");
			expect(addJob.data.relativePath).toBe("folder-b/book.epub");

			expect(mockDelete).toHaveBeenCalled();
		});
	});

	// ─── Regression ─────────────────────────────────────────────────────────

	describe("Regression", () => {
		test("queue is NOT obliterated at scan start (old bug destroyed jobs from other concurrent scans)", async () => {
			fgFiles = [];
			selectResults = [[], [], [], [], []];

			await scanPathLibrary("/library", 1, 100);
		});

		test("scanning an empty directory completes without errors and creates no jobs", async () => {
			fgFiles = [];
			selectResults = [[], [], [], [], []];

			await scanPathLibrary("/library", 1, 100);

			expect(mockAddBulk).not.toHaveBeenCalled();
		});
	});
});
