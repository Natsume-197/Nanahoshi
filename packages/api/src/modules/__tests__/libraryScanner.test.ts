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

const insertCalls: { values: any[]; conflictConfig: any }[] = [];

// Each awaited select() resolves to the next entry in this array, in order.
// Tests populate this before calling scanPathLibrary.
let selectResults: any[][] = [];
let selectCallIndex = 0;

function createSelectChain() {
	const chain: any = {
		from: mock(() => chain),
		where: mock(() => chain),
		groupBy: mock(() => chain),
		having: mock(() => chain),
		orderBy: mock(() => chain),
		limit: mock(() => chain),
		offset: mock(() => chain),
		// When the chain is awaited, pop the next result from selectResults.
		then: (resolve: any) => {
			const result = selectResults[selectCallIndex] ?? [];
			selectCallIndex++;
			return resolve(result);
		},
	};
	return chain;
}

function createInsertChain() {
	const call: { values: any[]; conflictConfig: any } = {
		values: [],
		conflictConfig: null,
	};
	const chain: any = {
		values: mock((v: any) => {
			call.values = v;
			return chain;
		}),
		onConflictDoUpdate: mock((config: any) => {
			call.conflictConfig = { type: "update", ...config };
			insertCalls.push(call);
			return chain;
		}),
		onConflictDoNothing: mock((config: any) => {
			call.conflictConfig = { type: "nothing", ...config };
			insertCalls.push(call);
			return chain;
		}),
		returning: mock(() => []),
		then: (resolve: any) => resolve(undefined),
	};
	return chain;
}

function createUpdateChain() {
	const chain: any = {
		set: mock(() => chain),
		where: mock(() => chain),
		then: (resolve: any) => resolve(undefined),
	};
	return chain;
}

function createDeleteChain() {
	const chain: any = {
		where: mock(() => chain),
		then: (resolve: any) => resolve(undefined),
	};
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

mock.module("fs/promises", () => ({
	default: {
		stat: mock(() =>
			Promise.resolve({
				size: 1024,
				mtimeMs: Date.now(),
			}),
		),
	},
}));

// ─── Import module under test (after all mocks are registered) ───────────────

const { scanPathLibrary } = await import("../libraryScanner");

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("libraryScanner", () => {
	beforeEach(() => {
		insertCalls.length = 0;
		selectResults = [];
		selectCallIndex = 0;
		fgFiles = [];
		mockInsert.mockClear();
		mockSelect.mockClear();
		mockUpdate.mockClear();
		mockDelete.mockClear();
		mockAddBulk.mockClear();
	});

	test("Phase 1: uses onConflictDoUpdate with (path, libraryPathId) and sets status to pending", async () => {
		// Simulate finding 2 files on disk
		fgFiles = ["/library/book1.epub", "/library/book2.epub"];

		// DB returns empty for all subsequent phases (no existing files, no duplicates, etc.)
		selectResults = [[], [], [], [], []];

		await scanPathLibrary("/library", 1, 100);

		// The scanner should have called insert at least once
		expect(insertCalls.length).toBeGreaterThan(0);

		const firstInsert = insertCalls[0];

		// BUG FIX: must use onConflictDoUpdate (not DoNothing) so re-scans
		// reset existing "done" records back to "pending"
		expect(firstInsert.conflictConfig.type).toBe("update");
		expect(firstInsert.conflictConfig.target).toEqual([
			"path",
			"library_path_id",
		]);

		// Every inserted row must carry the libraryPathId and start as "pending"
		for (const val of firstInsert.values) {
			expect(val.libraryPathId).toBe(100);
			expect(val.status).toBe("pending");
		}
	});

	test("Phase 1: inserted values contain correct file metadata from fs.stat", async () => {
		fgFiles = ["/library/book1.epub"];
		selectResults = [[], [], [], [], []];

		await scanPathLibrary("/library", 1, 100);

		const firstInsert = insertCalls[0];
		expect(firstInsert.values.length).toBe(1);
		expect(firstInsert.values[0].path).toBe("/library/book1.epub");
		expect(firstInsert.values[0].hash).toBe("mock-metadata-hash");
		// fs.stat mock returns size: 1024
		expect(firstInsert.values[0].size).toBe(1024);
	});

	test("Phase 4: created jobs carry libraryId and libraryPathId so the worker knows which library owns each file", async () => {
		fgFiles = ["/library/book1.epub"];

		selectResults = [
			[], // Phase 1.5 detectAndRemoveMissingFiles — no existing DB records
			[], // Phase 2  findPotentialDuplicates — no duplicates
			[], // Phase 3  markFinalDuplicates — no duplicates
			// Phase 4: the scanner queries for "verified" files to create jobs.
			// We return one file so a job gets created.
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
			[], // Phase 4 second iteration (empty = stop the loop)
			[], // Phase 5 summary stats
		];

		await scanPathLibrary("/library", 1, 100);

		// Verify a job was queued with the correct library context
		expect(mockAddBulk).toHaveBeenCalled();
		const jobs = mockAddBulk.mock.calls[0][0];
		expect(jobs[0].data.libraryId).toBe(1);
		expect(jobs[0].data.libraryPathId).toBe(100);
		expect(jobs[0].data.action).toBe("add");
	});

	test("queue is NOT obliterated at scan start (old bug destroyed jobs from other concurrent scans)", async () => {
		fgFiles = [];
		selectResults = [[], [], [], [], []];

		// The old implementation called queue.drain() + queue.obliterate() at the
		// top of scanPathLibrary, which wiped ALL jobs from every library scan.
		// The new implementation removed those calls entirely.
		// This test verifies the scan completes cleanly without needing obliterate.
		await scanPathLibrary("/library", 1, 100);
	});

	test("scanning an empty directory completes without errors and creates no jobs", async () => {
		fgFiles = [];
		selectResults = [[], [], [], [], []];

		await scanPathLibrary("/library", 1, 100);

		// No files found = no jobs should be queued
		expect(mockAddBulk).not.toHaveBeenCalled();
	});
});
