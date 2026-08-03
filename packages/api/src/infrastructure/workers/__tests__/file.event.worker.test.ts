import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { minimalAzw3 } from "../../../modules/__tests__/fixtures/azw3.fixture";

/**
 * Unit tests for the file-event worker's "add" repair logic and failure
 * handling.
 *
 * Isolation strategy for the shared Bun test process: bun loads test files
 * (including their top-level dynamic imports) before earlier files' afterAll
 * hooks run, so mock.module on a module another test file destructures at load
 * would leak into it. Domain singletons (repositories, metadata service) are
 * therefore patched in place — the patched object is the same one the worker
 * imported, whatever the registry currently holds — and the original methods
 * are restored in afterAll. mock.module is reserved for infrastructure and for
 * function modules no other test file imports for real.
 *
 * Run with:
 *   bun test packages/api/src/infrastructure/workers/__tests__/file.event.worker.test.ts
 */

// ─── Mocks: infrastructure (before any real module import) ──────────────────

mock.module("@nanahoshi-v2/db", () => ({ db: {} }));
// Re-export all real schema exports to prevent mock pollution across files.
const realSchema = await import("@nanahoshi-v2/db/schema/general");
mock.module("@nanahoshi-v2/db/schema/general", () => ({ ...realSchema }));

// Real repositories/services in this file's import graph pull env in.
mock.module("@nanahoshi-v2/env/server", () => ({
	env: {
		DATABASE_URL: "postgres://mock",
		NAMESPACE_UUID: "00000000-0000-0000-0000-000000000000",
	},
}));

type EventHandler = (...args: unknown[]) => unknown;

class MockWorker {
	static instance: MockWorker | undefined;
	name: string;
	processor: (job: unknown) => Promise<unknown>;
	handlers = new Map<string, EventHandler>();

	constructor(name: string, processor: (job: unknown) => Promise<unknown>) {
		this.name = name;
		this.processor = processor;
		MockWorker.instance = this;
	}

	on(event: string, handler: EventHandler) {
		this.handlers.set(event, handler);
		return this;
	}
}

class StubQueue {
	add = mock(() => Promise.resolve());
	addBulk = mock(() => Promise.resolve());
	on() {
		return this;
	}
}

const priorBullmq = await import("bullmq");
mock.module("bullmq", () => ({
	...priorBullmq,
	Worker: MockWorker,
	Queue: StubQueue,
	QueueEvents: class {},
}));

mock.module("../../queue/redis", () => ({ redis: {} }));

mock.module("../../queue/queues/metadata-enrich.queue", () => ({
	metadataEnrichQueue: { add: mock(() => Promise.resolve()) },
}));

mock.module("../../search/catalog-relations", () => ({
	fetchBookRelatedEntities: mock(() => Promise.resolve(undefined)),
	fetchRelatedEntitiesByLibraryId: mock(() =>
		Promise.resolve({ authorIds: [], seriesIds: [] }),
	),
	fetchRelatedEntitiesByLibraryPathId: mock(() =>
		Promise.resolve({ authorIds: [], seriesIds: [] }),
	),
}));

const loggerMock = {
	info: mock(() => {}),
	warn: mock(() => {}),
	error: mock(() => {}),
	debug: mock(() => {}),
	child: mock(() => loggerMock),
};
mock.module("../../../lib/logger", () => ({ logger: loggerMock }));

// ─── Mocks: function modules (no other test file imports these for real) ─────

const processAudiobook = mock(() => Promise.resolve());
const priorAudiobookProcessor = await import(
	"../../../modules/audiobookProcessor"
);
mock.module("../../../modules/audiobookProcessor", () => ({
	...priorAudiobookProcessor,
	processAudiobook,
}));

const regroupBookDuplicates = mock(() => Promise.resolve());
const priorDuplicateGrouping = await import(
	"../../../modules/duplicateGrouping"
);
mock.module("../../../modules/duplicateGrouping", () => ({
	...priorDuplicateGrouping,
	regroupBookDuplicates,
	findMemberToPromote: mock(() => Promise.resolve(null)),
	enqueueBookEnrich: mock(() => Promise.resolve()),
}));

// ─── Patch domain singletons in place (restored in afterAll) ─────────────────

// Overwrites methods on the shared singleton object and returns a restorer
// that reinstates the original own-property state (so class-prototype methods
// reappear and prior mocks keep their exact shape).
function patchMethods(
	target: object,
	methods: Record<string, unknown>,
): () => void {
	const obj = target as Record<string, unknown>;
	const originals = Object.entries(methods).map(([key, fn]) => {
		const had = Object.hasOwn(obj, key);
		const value = obj[key];
		obj[key] = fn;
		return { key, had, value };
	});
	return () => {
		for (const { key, had, value } of originals) {
			if (had) obj[key] = value;
			else delete obj[key];
		}
	};
}

const { scannedFileRepository } = await import(
	"../../../modules/scanning/scannedFile.repository"
);
const { bookRepository } = await import(
	"../../../routers/books/book.repository"
);
const { bookMetadataRepository } = await import(
	"../../../routers/books/metadata/metadata.repository"
);
const { bookMetadataService } = await import(
	"../../../routers/books/metadata/metadata.service"
);
const { libraryRepository } = await import(
	"../../../routers/libraries/library.repository"
);

const markDone = mock(() => Promise.resolve());
const markFailed = mock(() => Promise.resolve());

// `existingBookResult` is what getByRelativePath finds at the job's path;
// `metadataRowResult` decides whether that book counts as fully processed.
let existingBookResult: {
	id: number;
	uuid: string;
	filehash: string;
} | null = null;
let updateFileInfoResult: { id: number } | undefined = { id: 5 };
let metadataRowResult: { bookId: number } | null = null;
const create = mock((input: { uuid: string }) =>
	Promise.resolve({ id: 11, uuid: input.uuid }),
);

const getByRelativePath = mock(() => Promise.resolve(existingBookResult));
const updateFileInfo = mock(() => Promise.resolve(updateFileInfoResult));
const findByBookId = mock(() => Promise.resolve(metadataRowResult));
const enrichAndSaveMetadata = mock(() => Promise.resolve(null));

// Reprocess-path state: what getById returns and whether a provider gap exists.
let getByIdResult: {
	id: number;
	uuid: string;
	duplicateOfBookId: number | null;
} | null = null;
let amazonEnrichedResult = false;
let needsEnrichmentResult = false;

const getById = mock(() => Promise.resolve(getByIdResult));
const isAmazonEnriched = mock(() => Promise.resolve(amazonEnrichedResult));
const needsExternalEnrichment = mock(() =>
	Promise.resolve(needsEnrichmentResult),
);
const fillMissingFromLocal = mock(() => Promise.resolve(null));

const restorers = [
	patchMethods(scannedFileRepository, { markDone, markFailed }),
	patchMethods(bookRepository, {
		create,
		getByRelativePath,
		updateFileInfo,
		getById,
	}),
	patchMethods(bookMetadataRepository, { findByBookId, isAmazonEnriched }),
	patchMethods(bookMetadataService, {
		enrichAndSaveMetadata,
		fillMissingFromLocal,
		needsExternalEnrichment,
	}),
	patchMethods(libraryRepository, {
		getServerIdByLibraryId: mock(() => Promise.resolve("server-1")),
	}),
];

const fixtureDir = await fs.mkdtemp(path.join(os.tmpdir(), "nh-worker-azw3-"));

afterAll(async () => {
	for (const restore of restorers) restore();
	// Best-effort registry restore for modules no later file binds at load.
	mock.module("bullmq", () => ({ ...priorBullmq }));
	mock.module("../../../modules/audiobookProcessor", () => ({
		...priorAudiobookProcessor,
	}));
	mock.module("../../../modules/duplicateGrouping", () => ({
		...priorDuplicateGrouping,
	}));
	await fs.rm(fixtureDir, { recursive: true, force: true });
});

// ─── Import module under test (after all mocks are registered) ───────────────

await import("../file.event.worker");
const worker = MockWorker.instance;
if (!worker) throw new Error("Worker was not constructed");
const processJob = (data: Record<string, unknown>) =>
	worker.processor({ id: "job-1", data, opts: {} }) as Promise<
		Record<string, unknown>
	>;
const failedHandler = worker.handlers.get("failed");
if (!failedHandler) throw new Error("failed handler was not registered");

// ─── Helpers ─────────────────────────────────────────────────────────────────

function addJob(overrides: Record<string, unknown> = {}) {
	return {
		action: "add",
		filename: "book.epub",
		fileHash: "hash-1",
		path: "/library/book.epub",
		lastModified: "2025-01-01T00:00:00.000Z",
		size: 2048,
		relativePath: "book.epub",
		libraryId: 1,
		libraryPathId: 100,
		...overrides,
	};
}

function audiobookJob(overrides: Record<string, unknown> = {}) {
	return {
		action: "add-audiobook",
		mediaType: "audiobook",
		dirPath: "/audio/Author/Book",
		filename: "Book",
		fileHash: "hash-1",
		path: "/audio/Author/Book",
		lastModified: "2025-01-01T00:00:00.000Z",
		size: 4096,
		relativePath: "Author/Book",
		libraryId: 1,
		libraryPathId: 100,
		audioFiles: [
			{ path: "/audio/Author/Book/1.mp3" },
			{ path: "/audio/Author/Book/2.mp3" },
		],
		...overrides,
	};
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("file.event.worker", () => {
	beforeEach(() => {
		existingBookResult = null;
		updateFileInfoResult = { id: 5 };
		metadataRowResult = null;
		getByIdResult = null;
		amazonEnrichedResult = false;
		needsEnrichmentResult = false;
		markDone.mockClear();
		markFailed.mockClear();
		create.mockClear();
		getByRelativePath.mockClear();
		updateFileInfo.mockClear();
		findByBookId.mockClear();
		enrichAndSaveMetadata.mockClear();
		getById.mockClear();
		isAmazonEnriched.mockClear();
		needsExternalEnrichment.mockClear();
		fillMissingFromLocal.mockClear();
		processAudiobook.mockClear();
		regroupBookDuplicates.mockClear();
	});

	describe("add — ebook format validation", () => {
		test("accepts a generated native AZW3 before cataloguing it", async () => {
			const filePath = path.join(fixtureDir, "native.azw3");
			await fs.writeFile(filePath, minimalAzw3());
			getByIdResult = { id: 11, uuid: "native", duplicateOfBookId: null };

			await processJob(
				addJob({
					filename: "native.azw3",
					path: filePath,
					relativePath: "native.azw3",
				}),
			);

			expect(create).toHaveBeenCalledTimes(1);
			expect(create.mock.calls[0]?.[0]).toMatchObject({
				filename: "native.azw3",
				mediaType: "application/vnd.amazon.ebook",
			});
		});

		test("rejects a legacy MOBI renamed to AZW3 before cataloguing it", async () => {
			const filePath = path.join(fixtureDir, "renamed.azw3");
			await fs.writeFile(filePath, minimalAzw3({ version: 6 }));

			await expect(
				processJob(
					addJob({
						filename: "renamed.azw3",
						path: filePath,
						relativePath: "renamed.azw3",
					}),
				),
			).rejects.toThrow("not a native AZW3/KF8 file");
			expect(create).not.toHaveBeenCalled();
		});

		test("continues cataloguing legitimate EPUB files normally", async () => {
			getByIdResult = { id: 11, uuid: "epub", duplicateOfBookId: null };

			await processJob(addJob());

			expect(create).toHaveBeenCalledTimes(1);
			expect(create.mock.calls[0]?.[0]).toMatchObject({
				filename: "book.epub",
				mediaType: "application/epub+zip",
			});
		});
	});

	describe("add — repair of half-processed books", () => {
		test("a fully processed book with unchanged content is skipped", async () => {
			existingBookResult = { id: 5, uuid: "u5", filehash: "hash-1" };
			metadataRowResult = { bookId: 5 };

			const result = await processJob(addJob());

			expect(result.skipped).toBe("already_exists");
			expect(markDone).toHaveBeenCalledWith("/library/book.epub", 100);
			expect(enrichAndSaveMetadata).not.toHaveBeenCalled();
			expect(updateFileInfo).not.toHaveBeenCalled();
		});

		test("same content but missing metadata re-runs extraction instead of skipping", async () => {
			existingBookResult = { id: 5, uuid: "u5", filehash: "hash-1" };
			metadataRowResult = null;

			const result = await processJob(addJob());

			expect(result.repaired).toBe(true);
			expect(result.updated).toBe(false);
			// Same content: no file-info rewrite, straight to reprocessing
			expect(updateFileInfo).not.toHaveBeenCalled();
			expect(enrichAndSaveMetadata).toHaveBeenCalledTimes(1);
			expect(regroupBookDuplicates).toHaveBeenCalledWith(5);
			expect(markDone).toHaveBeenCalledWith("/library/book.epub", 100);
		});

		test("changed content still updates the book in place", async () => {
			existingBookResult = { id: 5, uuid: "u5", filehash: "hash-old" };

			const result = await processJob(addJob());

			expect(result.updated).toBe(true);
			expect(result.repaired).toBe(false);
			expect(updateFileInfo).toHaveBeenCalledTimes(1);
			expect(enrichAndSaveMetadata).toHaveBeenCalledTimes(1);
			// Completeness check is irrelevant when content changed
			expect(findByBookId).not.toHaveBeenCalled();
		});

		test("changed content matching another book is left for dedupe", async () => {
			existingBookResult = { id: 5, uuid: "u5", filehash: "hash-old" };
			updateFileInfoResult = undefined;

			const result = await processJob(addJob());

			expect(result.skipped).toBe("duplicate_content");
			expect(enrichAndSaveMetadata).not.toHaveBeenCalled();
			expect(markDone).toHaveBeenCalledWith("/library/book.epub", 100);
		});
	});

	describe("add-audiobook — repair", () => {
		test("same content but missing metadata re-runs processAudiobook", async () => {
			existingBookResult = { id: 9, uuid: "u9", filehash: "hash-1" };
			metadataRowResult = null;

			await processJob(audiobookJob());

			expect(processAudiobook).toHaveBeenCalledTimes(1);
			expect(markDone).toHaveBeenCalledTimes(2);
			expect(markDone).toHaveBeenCalledWith("/audio/Author/Book/1.mp3", 100);
			expect(markDone).toHaveBeenCalledWith("/audio/Author/Book/2.mp3", 100);
		});

		test("a fully processed audiobook with unchanged content is skipped", async () => {
			existingBookResult = { id: 9, uuid: "u9", filehash: "hash-1" };
			metadataRowResult = { bookId: 9 };

			const result = await processJob(audiobookJob());

			expect(result.skipped).toBe("already_exists");
			expect(processAudiobook).not.toHaveBeenCalled();
			expect(markDone).toHaveBeenCalledTimes(2);
		});
	});

	describe("regroup — DB-only edition rebuild", () => {
		test("runs only duplicate grouping and never opens local metadata", async () => {
			const result = await processJob({
				action: "regroup",
				bookId: 7,
				libraryId: 1,
			});

			expect(result).toEqual({ action: "regroup", bookId: 7 });
			expect(regroupBookDuplicates).toHaveBeenCalledWith(7);
			expect(fillMissingFromLocal).not.toHaveBeenCalled();
			expect(enrichAndSaveMetadata).not.toHaveBeenCalled();
			expect(needsExternalEnrichment).not.toHaveBeenCalled();
		});
	});

	describe("reprocess — pipeline without fs walk/hash", () => {
		const reprocessJob = (overrides: Record<string, unknown> = {}) => ({
			action: "reprocess",
			bookId: 7,
			uuid: "u7",
			libraryId: 1,
			...overrides,
		});

		test("a deleted book is skipped without touching metadata", async () => {
			getByIdResult = null;

			const result = await processJob(reprocessJob());

			expect(result.skipped).toBe("book_missing");
			expect(fillMissingFromLocal).not.toHaveBeenCalled();
			expect(enrichAndSaveMetadata).not.toHaveBeenCalled();
			expect(regroupBookDuplicates).not.toHaveBeenCalled();
		});

		test("a book with metadata gets fill-missing and regrouping", async () => {
			getByIdResult = { id: 7, uuid: "u7", duplicateOfBookId: null };
			metadataRowResult = { bookId: 7 };

			await processJob(reprocessJob());

			expect(fillMissingFromLocal).toHaveBeenCalledWith({
				bookId: 7,
				uuid: "u7",
			});
			expect(enrichAndSaveMetadata).not.toHaveBeenCalled();
			expect(regroupBookDuplicates).toHaveBeenCalledWith(7);
		});

		test("a book without any metadata row runs the full local extraction (repair)", async () => {
			getByIdResult = { id: 7, uuid: "u7", duplicateOfBookId: null };
			metadataRowResult = null;

			await processJob(reprocessJob());

			expect(enrichAndSaveMetadata).toHaveBeenCalledTimes(1);
			expect(fillMissingFromLocal).not.toHaveBeenCalled();
			expect(regroupBookDuplicates).toHaveBeenCalledWith(7);
		});

		test("a book hidden behind a canonical skips the enrichment check", async () => {
			getByIdResult = { id: 7, uuid: "u7", duplicateOfBookId: 3 };
			metadataRowResult = { bookId: 7 };

			await processJob(reprocessJob());

			expect(needsExternalEnrichment).not.toHaveBeenCalled();
		});

		test("a visible book checks for provider gaps, not the enriched flag", async () => {
			getByIdResult = { id: 7, uuid: "u7", duplicateOfBookId: null };
			metadataRowResult = { bookId: 7 };

			await processJob(reprocessJob());

			expect(needsExternalEnrichment).toHaveBeenCalledWith(7);
			// The old gate: an "already enriched" book must no longer be skipped.
			expect(isAmazonEnriched).not.toHaveBeenCalled();
		});
	});

	describe("terminal failure marks scanned_file rows failed", () => {
		test("a terminally failed add job marks its file failed", async () => {
			failedHandler(
				{
					id: "job-1",
					attemptsMade: 3,
					opts: { attempts: 3 },
					data: addJob(),
				},
				new Error("boom"),
			);
			await Promise.resolve();

			expect(markFailed).toHaveBeenCalledWith(["/library/book.epub"], 100);
		});

		test("a non-terminal attempt does not mark the file failed", async () => {
			failedHandler(
				{
					id: "job-1",
					attemptsMade: 1,
					opts: { attempts: 3 },
					data: addJob(),
				},
				new Error("boom"),
			);
			await Promise.resolve();

			expect(markFailed).not.toHaveBeenCalled();
		});

		test("a terminally failed audiobook job marks every audio file failed", async () => {
			failedHandler(
				{
					id: "job-1",
					attemptsMade: 3,
					opts: { attempts: 3 },
					data: audiobookJob(),
				},
				new Error("boom"),
			);
			await Promise.resolve();

			expect(markFailed).toHaveBeenCalledWith(
				["/audio/Author/Book/1.mp3", "/audio/Author/Book/2.mp3"],
				100,
			);
		});

		test("a terminally failed delete job marks nothing", async () => {
			failedHandler(
				{
					id: "job-1",
					attemptsMade: 3,
					opts: { attempts: 3 },
					data: addJob({ action: "delete" }),
				},
				new Error("boom"),
			);
			await Promise.resolve();

			expect(markFailed).not.toHaveBeenCalled();
		});
	});
});
