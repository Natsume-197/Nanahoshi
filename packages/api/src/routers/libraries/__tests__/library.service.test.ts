import { beforeEach, describe, expect, mock, test } from "bun:test";

// ─── Mocks must be registered before importing the module under test ─────────

// Mock env to prevent validation errors
mock.module("@nanahoshi-v2/env/server", () => ({
	env: {
		DATABASE_URL: "postgres://mock",
		NAMESPACE_UUID: "00000000-0000-0000-0000-000000000000",
		SEARCH_PROVIDER: "pgroonga",
	},
}));

// ─── libraryRepository mock ──────────────────────────────────────────────────

const mockFindById = mock(() => Promise.resolve(null));
const mockUpdate = mock(() => Promise.resolve(null));
const mockDelete = mock(() => Promise.resolve(false));
const mockAddPath = mock(() => Promise.resolve(null));
const mockFindLibraryIdForPath = mock(() => Promise.resolve(null));

// We expose a MockLibraryRepository class so that other tests which import the
// real LibraryRepository class (e.g. local.provider.ts) do not break due to
// mock pollution when this test runs in the same bun process.
class MockLibraryRepository {
	findById = mockFindById;
	update = mockUpdate;
	delete = mockDelete;
	addPath = mockAddPath;
	findLibraryIdForPath = mockFindLibraryIdForPath;
	create = mock(() => Promise.resolve(null));
	findByOrganization = mock(() => Promise.resolve([]));
	removePath = mock(() => Promise.resolve(true));
}

mock.module("../library.repository", () => ({
	LibraryRepository: MockLibraryRepository,
	libraryRepository: new MockLibraryRepository(),
}));

// ─── Cascade helper mocks ────────────────────────────────────────────────────

const mockFetchRelatedEntitiesByLibraryId = mock(() =>
	Promise.resolve({ authorIds: [], seriesIds: [] }),
);
const mockFetchRelatedEntitiesByLibraryPathId = mock(() =>
	Promise.resolve({ authorIds: [], seriesIds: [] }),
);
const mockEnqueueBulkEntitySync = mock(() => Promise.resolve());
const mockEnqueueSearchSync = mock(() => Promise.resolve());

mock.module("../../../infrastructure/search/search.document", () => ({
	fetchRelatedEntitiesByLibraryId: mockFetchRelatedEntitiesByLibraryId,
	fetchRelatedEntitiesByLibraryPathId: mockFetchRelatedEntitiesByLibraryPathId,
}));

mock.module("../../../infrastructure/search/search-sync.service", () => ({
	enqueueBulkEntitySync: mockEnqueueBulkEntitySync,
	enqueueSearchSync: mockEnqueueSearchSync,
	enqueueSeriesSync: mock(() => Promise.resolve()),
	enqueueAuthorSync: mock(() => Promise.resolve()),
}));

mock.module("../../../modules/conversion/converter", () => ({
	removeConvertedFile: mock(() => Promise.resolve()),
}));

const mockScanPathLibrary = mock(() => Promise.resolve());
mock.module("../../../modules/libraryScanner", () => ({
	scanPathLibrary: mockScanPathLibrary,
}));

const mockCreateTask = mock(() => Promise.resolve({ id: "task-1" }));
const mockFinalizeTask = mock(() => Promise.resolve());
mock.module("../../../modules/taskManager", () => ({
	createTask: mockCreateTask,
	finalizeTask: mockFinalizeTask,
	LIBRARY_SCAN_TASK_TYPE: "LIBRARY_SCAN",
}));

const mockGetIdsByLibraryId = mock(() => Promise.resolve([]));
const mockGetIdsByLibraryPathId = mock(() => Promise.resolve([]));
mock.module("../../books/book.repository", () => ({
	bookRepository: {
		getIdsByLibraryId: mockGetIdsByLibraryId,
		getIdsByLibraryPathId: mockGetIdsByLibraryPathId,
	},
}));

mock.module("../../books/metadata/metadata.repository", () => ({
	bookMetadataRepository: {
		deleteAuthorIfOrphaned: mock(() => Promise.resolve()),
		deleteSeriesIfOrphaned: mock(() => Promise.resolve()),
	},
}));

// ─── Import module under test + error class ──────────────────────────────────

const { NotFoundError } = await import("../../../errors");
const service = await import("../library.service");

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeLibrary(overrides: Record<string, unknown> = {}) {
	return {
		id: 1,
		name: "Test Library",
		organizationId: "org-A",
		isCronWatch: false,
		isPublic: false,
		mediaType: "ebook",
		metadataProviders: ["ranobedb"],
		createdAt: new Date().toISOString(),
		paths: [],
		...overrides,
	};
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("library.service — org-scoped authorization", () => {
	beforeEach(() => {
		mockFindById.mockReset();
		mockUpdate.mockReset();
		mockDelete.mockReset();
		mockAddPath.mockReset();
		mockFindLibraryIdForPath.mockReset();
		mockFetchRelatedEntitiesByLibraryId.mockReset();
		mockGetIdsByLibraryId.mockReset();
		mockFetchRelatedEntitiesByLibraryPathId.mockReset();
		mockGetIdsByLibraryPathId.mockReset();
		// Restore safe defaults after each reset
		mockFetchRelatedEntitiesByLibraryId.mockImplementation(() =>
			Promise.resolve({ authorIds: [], seriesIds: [] }),
		);
		mockGetIdsByLibraryId.mockImplementation(() => Promise.resolve([]));
		mockFetchRelatedEntitiesByLibraryPathId.mockImplementation(() =>
			Promise.resolve({ authorIds: [], seriesIds: [] }),
		);
		mockGetIdsByLibraryPathId.mockImplementation(() => Promise.resolve([]));
	});

	// ─── getLibraryById ──────────────────────────────────────────────────────

	describe("getLibraryById", () => {
		test("returns the library when findById resolves a library", async () => {
			const lib = makeLibrary();
			mockFindById.mockImplementation(() => Promise.resolve(lib));

			const result = await service.getLibraryById(1, "org-A");

			expect(result).toEqual(lib);
		});

		test("throws NotFoundError when findById resolves null", async () => {
			mockFindById.mockImplementation(() => Promise.resolve(null));

			await expect(service.getLibraryById(1, "org-A")).rejects.toBeInstanceOf(
				NotFoundError,
			);
		});

		test("passes organizationId through to libraryRepository.findById", async () => {
			mockFindById.mockImplementation(() => Promise.resolve(makeLibrary()));

			await service.getLibraryById(42, "org-A");

			expect(mockFindById).toHaveBeenCalledWith(42, "org-A");
		});
	});

	// ─── updateLibrary ───────────────────────────────────────────────────────

	describe("updateLibrary", () => {
		test("throws NotFoundError when update resolves null", async () => {
			mockUpdate.mockImplementation(() => Promise.resolve(null));

			await expect(
				service.updateLibrary(1, { name: "New Name" }, "org-A"),
			).rejects.toBeInstanceOf(NotFoundError);
		});

		test("passes organizationId through to libraryRepository.update", async () => {
			const lib = makeLibrary({ name: "Updated" });
			mockUpdate.mockImplementation(() => Promise.resolve(lib));

			await service.updateLibrary(1, { name: "Updated" }, "org-A");

			expect(mockUpdate).toHaveBeenCalledWith(1, { name: "Updated" }, "org-A");
		});

		test("returns the updated library on success", async () => {
			const lib = makeLibrary({ name: "Updated" });
			mockUpdate.mockImplementation(() => Promise.resolve(lib));

			const result = await service.updateLibrary(
				1,
				{ name: "Updated" },
				"org-A",
			);

			expect(result).toEqual(lib);
		});
	});

	// ─── deleteLibrary ───────────────────────────────────────────────────────

	describe("deleteLibrary", () => {
		test("throws NotFoundError (without cascade) when findById resolves null", async () => {
			mockFindById.mockImplementation(() => Promise.resolve(null));

			await expect(service.deleteLibrary(1, "org-A")).rejects.toBeInstanceOf(
				NotFoundError,
			);

			// Cascade helpers must NOT have been called
			expect(mockFetchRelatedEntitiesByLibraryId).not.toHaveBeenCalled();
			expect(mockGetIdsByLibraryId).not.toHaveBeenCalled();
		});

		test("runs cascade and succeeds when findById resolves a library", async () => {
			const lib = makeLibrary();
			mockFindById.mockImplementation(() => Promise.resolve(lib));
			mockDelete.mockImplementation(() => Promise.resolve(true));

			const result = await service.deleteLibrary(1, "org-A");

			expect(result).toEqual({ success: true });
			expect(mockFetchRelatedEntitiesByLibraryId).toHaveBeenCalled();
		});
	});

	// ─── scanLibrary ─────────────────────────────────────────────────────────

	describe("scanLibrary", () => {
		test("throws NotFoundError when findById resolves null", async () => {
			mockFindById.mockImplementation(() => Promise.resolve(null));

			await expect(service.scanLibrary(1, "org-A")).rejects.toBeInstanceOf(
				NotFoundError,
			);
		});

		test("passes organizationId to findById", async () => {
			// Library with a configured path so scan proceeds
			const lib = makeLibrary({
				paths: [{ id: 10, path: "/books", libraryId: 1, isEnabled: true }],
			});
			mockFindById.mockImplementation(() => Promise.resolve(lib));
			mockCreateTask.mockImplementation(() => Promise.resolve({ id: "t-1" }));

			await service.scanLibrary(5, "org-A");

			expect(mockFindById).toHaveBeenCalledWith(5, "org-A");
		});
	});

	// ─── addPath ─────────────────────────────────────────────────────────────

	describe("addPath", () => {
		test("throws NotFoundError when findById resolves null", async () => {
			mockFindById.mockImplementation(() => Promise.resolve(null));

			await expect(
				service.addPath(1, "/books", "org-A"),
			).rejects.toBeInstanceOf(NotFoundError);
		});

		test("does NOT call addPath on repository when library is not found", async () => {
			mockFindById.mockImplementation(() => Promise.resolve(null));

			await expect(
				service.addPath(1, "/books", "org-A"),
			).rejects.toBeInstanceOf(NotFoundError);

			expect(mockAddPath).not.toHaveBeenCalled();
		});

		test("calls repository.addPath when library is found", async () => {
			const lib = makeLibrary();
			mockFindById.mockImplementation(() => Promise.resolve(lib));
			const newPath = {
				id: 5,
				libraryId: 1,
				path: "/books",
				isEnabled: true,
			};
			mockAddPath.mockImplementation(() => Promise.resolve(newPath));

			const result = await service.addPath(1, "/books", "org-A");

			expect(mockAddPath).toHaveBeenCalledWith({
				libraryId: 1,
				path: "/books",
				isEnabled: true,
			});
			expect(result).toEqual(newPath);
		});
	});

	// ─── removePath ──────────────────────────────────────────────────────────

	describe("removePath", () => {
		test("throws NotFoundError when findLibraryIdForPath resolves null", async () => {
			mockFindLibraryIdForPath.mockImplementation(() => Promise.resolve(null));

			await expect(service.removePath(99, "org-A")).rejects.toBeInstanceOf(
				NotFoundError,
			);
		});

		test("does NOT run cascade cleanup when path is not found", async () => {
			mockFindLibraryIdForPath.mockImplementation(() => Promise.resolve(null));

			await expect(service.removePath(99, "org-A")).rejects.toBeInstanceOf(
				NotFoundError,
			);

			expect(mockFetchRelatedEntitiesByLibraryPathId).not.toHaveBeenCalled();
			expect(mockGetIdsByLibraryPathId).not.toHaveBeenCalled();
		});
	});
});
